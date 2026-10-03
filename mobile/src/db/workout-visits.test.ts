const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
} });

const db = await import('./index.web');
const exerciseId = db.getExercises()[0].id;
const unfinished = db.createWorkout('push');
db.saveWorkoutSet({ exerciseId, workoutId: unfinished.id, setNumber: 1, weight: 100, reps: 8, completedAt: new Date() });
if (db.getWorkoutVisits().some(({ workout }) => workout.id === unfinished.id)) throw new Error('Unfinished workout entered completed visits.');

db.endWorkout(unfinished.id);
if (!db.getWorkoutVisits().some(({ workout }) => workout.id === unfinished.id)) throw new Error('Finished workout missing from completed visits.');

const empty = db.createWorkout('pull');
db.endWorkout(empty.id);
if (db.getWorkoutVisits().some(({ workout }) => workout.id === empty.id)) throw new Error('Workout without sets entered completed visits.');

const prExerciseId = db.getExercises()[1].id;
const [, second] = [100, 110, 120].map((weight, week) => {
  const workout = db.createWorkout('push');
  db.saveWorkoutSet({ exerciseId: prExerciseId, workoutId: workout.id, setNumber: 1, weight, reps: 5, completedAt: new Date(2026, 0, 1 + week * 7) });
  db.endWorkout(workout.id);
  return workout;
});
if (db.getWorkoutAchievements(second.id)[0]?.level !== 'gold') throw new Error('A best at the time lost its PR once a later workout beat it.');
