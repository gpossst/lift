const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
} });

const db = await import('./index.web');
const check = (condition: unknown) => { if (!condition) throw new Error('Workout deletion left history or sync data behind.'); };
const exerciseId = db.getExercises()[0].id;
const removed = db.createWorkout('push');
const retained = db.createWorkout('pull');
const completedAt = new Date('2026-01-01T12:00:00Z');
for (const workout of [removed, retained]) db.saveWorkoutSet({ exerciseId, workoutId: workout.id, setNumber: 1, weight: 100, reps: 8, completedAt });
db.endWorkout(removed.id);
db.endWorkout(retained.id);
db.saveWorkoutMuscleRatings(removed.id, { chest: 4 });
db.recordRecommendationFeedback(removed.id, exerciseId, 'accepted');
check(db.deleteWorkout(removed.id));
check(!db.deleteWorkout(removed.id));
check(db.getWorkoutVisitSummary(removed.id) === null);
check(!db.getWorkoutHistory(exerciseId).some((set) => set.workoutId === removed.id));
check(db.getWorkoutVisits().every((visit) => visit.workout.id !== removed.id));
check(db.getWorkoutVisitSummary(retained.id)?.sets === 1);
for (const key of ['lift-preview-sets', 'lift-preview-workouts', 'lift-preview-muscle-ratings', 'lift-preview-recommendation-feedback']) check(!values.get(key)?.includes(removed.id));
check(db.getCloudSyncBatch()?.changes.some((change) => change.entity === 'workout' && change.key === removed.id && change.operation === 'delete'));
