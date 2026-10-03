import {
  acknowledgeCloudSyncBatch,
  getCloudSyncBatch,
  getCloudSyncCursor,
  hasPendingCloudSync,
  mergeCloudSyncChanges,
  recordCloudSyncFailure,
  rejectCloudSyncBatch,
  type CloudSyncMutationResult,
  type CloudSyncEntity,
  type CloudSyncRemoteChange,
} from '@/db';
import { validateReceipt } from '@/lib/cloud-sync-receipt';
import { apiUrl, authHeaders } from '@/lib/auth-client';

const endpoint = apiUrl;
type SyncSession = { userId: string; generation: number };
type SyncRun = { generation: number; controller: AbortController; promise: Promise<void> };
let session: SyncSession | null = null;
let generation = 0;
let inFlight: SyncRun | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 5_000;
const workoutDataListeners = new Set<() => void>();

export function subscribeWorkoutData(listener: () => void) {
  workoutDataListeners.add(listener);
  return () => { workoutDataListeners.delete(listener); };
}

type SyncResponse = {
  batchId?: string;
  revision?: number;
  changes?: CloudSyncRemoteChange[];
  cursor?: number;
  hasMore?: boolean;
  results?: CloudSyncMutationResult[];
  invalidChanges?: { entity: CloudSyncEntity; key: string }[];
  error?: string;
};

class SyncRequestError extends Error {
  constructor(message: string, readonly status: number, readonly invalidChanges?: { entity: CloudSyncEntity; key: string }[]) { super(message); }
}

async function request(path: string, signal: AbortSignal, init?: RequestInit) {
  const response = await fetch(`${endpoint}${path}`, { ...init, credentials: 'omit', signal, headers: { ...await authHeaders(), 'Content-Type': 'application/json', ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as SyncResponse;
  if (!response.ok) throw new SyncRequestError(payload.error ?? `Cloud sync failed (${response.status}).`, response.status, payload.invalidChanges);
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

/** Upload durable three-record chunks, then consume cursor pages. Transient
 * failures retain their idempotency key; invalid records remain reviewable. */
export function syncWorkoutData(): Promise<void> {
  if (!endpoint || !session) return Promise.resolve();
  if (inFlight?.generation === session.generation) return inFlight.promise;
  const runSession = session;
  const controller = new AbortController();
  const isCurrent = () => session?.userId === runSession.userId && generation === runSession.generation && !controller.signal.aborted;
  const assertCurrent = () => { if (!isCurrent()) throw new DOMException('Cloud sync session changed.', 'AbortError'); };
  const promise = (async () => {
    try {
      do {
        while (hasPendingCloudSync()) {
          const batch = getCloudSyncBatch(3);
          if (!batch) break;
          let response: SyncResponse;
          try {
            response = await request('/v1/sync', controller.signal, { method: 'POST', body: JSON.stringify(batch) });
          } catch (error) {
            assertCurrent();
            if (error instanceof SyncRequestError && [400, 409, 413, 422].includes(error.status)) {
              rejectCloudSyncBatch(batch.batchId, 'Cloud sync rejected this record. Review and save it again to correct its values.', error.invalidChanges);
              continue;
            }
            throw error;
          }
          assertCurrent();
          if (response.batchId !== batch.batchId || !Number.isInteger(response.revision)) throw new Error('Cloud sync returned an invalid batch receipt.');
          validateReceipt(batch.changes, response.revision!, response.results!);
          acknowledgeCloudSyncBatch(batch.batchId, response.revision!, response.results!);
        }

        let cursor = getCloudSyncCursor();
        let hasMore = true;
        while (hasMore) {
          const response = await request(`/v1/sync?cursor=${cursor}&limit=50`, controller.signal);
          assertCurrent();
          if (!Array.isArray(response.changes) || !Number.isSafeInteger(response.cursor)) throw new Error('Cloud sync returned an invalid change page.');
          mergeCloudSyncChanges(response.changes, response.cursor!);
          if (response.changes.length) for (const listener of workoutDataListeners) listener();
          cursor = response.cursor!;
          hasMore = response.hasMore === true;
        }
      } while (hasPendingCloudSync());
      retryDelay = 5_000;
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
