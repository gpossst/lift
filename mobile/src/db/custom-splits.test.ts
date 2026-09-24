const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
} });

const db = await import('./index.web');
const check = (condition: unknown) => { if (!condition) throw new Error('Custom split persistence or sync failed.'); };
check(db.getRecommendedWorkoutSplit() === 'push');
const split = db.saveCustomSplit({ name: 'Upper', muscles: ['chest', 'lats'] });
check(db.getCustomSplits()[0]?.id === split.id && db.getWorkoutSplitDefinition(split.id)?.name === 'Upper');
const created = db.getCloudSyncBatch();
check(created?.changes.some((change) => change.entity === 'split' && change.record?.name === 'Upper'));
db.acknowledgeCloudSyncBatch(created!.batchId, 1);
db.deleteCustomSplit(split.id);
check(db.getCustomSplits().length === 0);
check(db.getCloudSyncBatch()?.changes.some((change) => change.entity === 'split' && change.operation === 'delete'));
