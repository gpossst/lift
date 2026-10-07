import type { CloudSyncRejectedChange, CloudSyncRemoteChange } from '@/db';

/** Compare the attempted upload with the final cloud record, after every page
 * has loaded. An earlier log entry can match even when a later edit differs. */
export function reconcileSyncConflicts(issues: CloudSyncRejectedChange[], changes: CloudSyncRemoteChange[], fullReplay = false): CloudSyncRejectedChange[] {
  const latest = new Map(changes.map((change) => [`${change.entity}\u0000${change.key}`, change]));
  return issues.flatMap((issue) => {
    const remote = latest.get(`${issue.entity}\u0000${issue.key}`);
    if (!issue.conflict) return [issue];
    if (!remote) return [{ ...issue, remoteRevision: fullReplay ? 0 : issue.remoteRevision }];
    const same = issue.operation === remote.operation && (issue.operation === 'delete' || (
      issue.record && remote.record && Object.keys(issue.record).length > 0 && Object.keys(issue.record).filter((key) => key !== 'updatedAt').every((key) => {
        const attempted = issue.record![key] ?? null;
        const saved = remote.record![key] ?? null;
        return Array.isArray(attempted) && Array.isArray(saved)
          ? JSON.stringify([...attempted].sort()) === JSON.stringify([...saved].sort())
          : attempted === saved;
      })
    ));
    return same ? [] : [{ ...issue, remoteRevision: remote.revision, remoteOperation: remote.operation }];
  });
}
