import {
  acknowledgeCloudSyncBatch,
  getCloudSyncBatch,
  getCloudSyncCursor,
  hasPendingCloudSync,
  mergeCloudSyncChanges,
  recordCloudSyncFailure,
  type CloudSyncRemoteChange,
} from '@/db';
import { apiUrl, authHeaders } from '@/lib/auth-client';

export type CohortRecommendation = { muscle: string; mySets: number; peerSets: number; peerCount: number; direction: 'below_peer_range' | 'above_peer_range' | 'within_peer_range' };
const endpoint = apiUrl;
type SyncSession = { userId: string; generation: number };
type SyncRun = { generation: number; controller: AbortController; promise: Promise<CohortRecommendation[] | null> };
let session: SyncSession | null = null;
let generation = 0;
let inFlight: SyncRun | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 5_000;

type SyncResponse = {
  batchId?: string;
  revision?: number;
  changes?: CloudSyncRemoteChange[];
  cursor?: number;
  hasMore?: boolean;
  recommendations?: CohortRecommendation[];
  error?: string;
};

async function request(path: string, signal: AbortSignal, init?: RequestInit) {
  const response = await fetch(`${endpoint}${path}`, { ...init, credentials: 'omit', signal, headers: { ...await authHeaders(), 'Content-Type': 'application/json', ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as SyncResponse;
  if (!response.ok) throw new Error(payload.error ?? `Cloud sync failed (${response.status}).`);
  return payload;
}

export function setCloudSyncUser(userId: string | null) {
  if (session?.userId === userId && userId) {
    return;
  }
  generation += 1;
  session = userId ? { userId, generation } : null;
  inFlight?.controller.abort();
  inFlight = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryDelay = 5_000;
}

function scheduleRetry() {
  if (retryTimer || !endpoint) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncWorkoutData().catch(() => undefined);
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
}

/** Upload durable three-record chunks, then consume cursor pages. A failed
 * request leaves its claimed idempotency key in the outbox for the retry. */
export function syncWorkoutData(): Promise<CohortRecommendation[] | null> {
  if (!endpoint || !session) return Promise.resolve(null);
  if (inFlight?.generation === session.generation) return inFlight.promise;
  const runSession = session;
  const controller = new AbortController();
  const isCurrent = () => session?.userId === runSession.userId && generation === runSession.generation && !controller.signal.aborted;
  const assertCurrent = () => { if (!isCurrent()) throw new DOMException('Cloud sync session changed.', 'AbortError'); };
  const promise = (async () => {
    try {
      let recommendations: CohortRecommendation[] | null = null;
      do {
        while (hasPendingCloudSync()) {
          const batch = getCloudSyncBatch(3);
          if (!batch) break;
          const response = await request('/v1/sync', controller.signal, { method: 'POST', body: JSON.stringify(batch) });
          assertCurrent();
          if (response.batchId !== batch.batchId || !Number.isInteger(response.revision)) throw new Error('Cloud sync returned an invalid batch receipt.');
          acknowledgeCloudSyncBatch(batch.batchId, response.revision!);
        }

        let cursor = getCloudSyncCursor();
        let hasMore = true;
        while (hasMore) {
          const response = await request(`/v1/sync?cursor=${cursor}&limit=50`, controller.signal);
          assertCurrent();
          if (!Array.isArray(response.changes) || !Number.isSafeInteger(response.cursor)) throw new Error('Cloud sync returned an invalid change page.');
          mergeCloudSyncChanges(response.changes, response.cursor!);
          cursor = response.cursor!;
          hasMore = response.hasMore === true;
        }
        const response = await request('/v1/recommendations', controller.signal);
        assertCurrent();
        recommendations = response.recommendations ?? null;
      } while (hasPendingCloudSync());
      retryDelay = 5_000;
      return recommendations;
    } catch (error) {
      if (isCurrent()) {
        recordCloudSyncFailure();
        scheduleRetry();
      }
      throw error;
    } finally {
      if (inFlight?.generation === runSession.generation) inFlight = null;
    }
  })();
  inFlight = { generation: runSession.generation, controller, promise };
  return promise;
}
