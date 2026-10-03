import type { CloudSyncChange, CloudSyncMutationResult } from '@/db';

export function validateReceipt(changes: Pick<CloudSyncChange, 'entity' | 'key'>[], revision: number, results: CloudSyncMutationResult[]): void {
  if (!Number.isSafeInteger(revision) || revision < 1 || !Array.isArray(results) || results.length !== changes.length
    || changes.some((change) => results.filter((result) => result.entity === change.entity && result.key === change.key).length !== 1)
    || results.some((result) => result.status !== 'conflict' && (result.status !== 'accepted' || result.revision !== revision))) {
    throw new Error('Cloud sync returned an invalid per-record receipt. Update the sync server before retrying.');
  }
}
