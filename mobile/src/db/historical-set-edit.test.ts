const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
} });

const db = await import('./index.web');
const check = (condition: unknown) => { if (!condition) throw new Error('Historical set edit changed the wrong workout or failed to sync.'); };
const exerciseId = db.getExercises()[0].id;
const first = db.createWorkout('push');
const second = db.createWorkout('push');
const completedAt = new Date('2026-01-01T12:00:00Z');
db.saveWorkoutSet({ exerciseId, workoutId: first.id, setNumber: 1, weight: 100, reps: 8, completedAt });
db.saveWorkoutSet({ exerciseId, workoutId: second.id, setNumber: 1, weight: 110, reps: 7, completedAt });
const original = db.getWorkoutHistory(exerciseId).find((set) => set.workoutId === first.id)!;
db.updateWorkoutSet(exerciseId, original, { weight: 105, reps: 9 });
const history = db.getWorkoutHistory(exerciseId);
check(history.find((set) => set.workoutId === first.id)?.weight === 105);
check(history.find((set) => set.workoutId === first.id)?.reps === 9);
check(history.find((set) => set.workoutId === second.id)?.weight === 110);
check(db.getWorkoutVisitSummary(first.id)?.volume === 945);
check(db.getCloudSyncBatch()?.changes.some((change) => change.entity === 'set' && change.key.includes(first.id) && change.record?.weight === 105));
