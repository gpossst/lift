const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
} });

const db = await import('./index.web');
const check = (condition: unknown) => { if (!condition) throw new Error('Offline account switch lost local data.'); };

check(db.prepareCloudSyncForUser('user-a'));
const workout = db.createWorkout('push');
const pendingBatch = db.getCloudSyncBatch();
check(pendingBatch?.changes.some((change) => change.entity === 'workout' && change.key === workout.id));

check(!db.prepareCloudSyncForUser('user-b'));
check(db.getWorkoutVisitSummary(workout.id)?.workout.id === workout.id);
check(db.getCloudSyncBatch()?.batchId === pendingBatch?.batchId);
check(db.prepareCloudSyncForUser('user-a'));
