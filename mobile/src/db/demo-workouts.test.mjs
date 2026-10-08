import assert from 'node:assert/strict';
import { exerciseCatalog } from './exercise-catalog';
import { progressFor } from '../lib/lift-progress';

process.env.EXPO_PUBLIC_SEED_DEMO_DATA = 'true';
const { buildDemoWorkoutSets, demoWorkoutIdPrefix } = await import('./demo-data.ts');

for (const now of [new Date(2026, 0, 1), new Date(2026, 9, 8), new Date(2026, 2, 9)]) {
  const sets = buildDemoWorkoutSets(exerciseCatalog, now);
  const visits = new Map(sets.map((set) => [set.workoutId, set.completedAt]));
  assert(visits.size >= 150);
  assert(new Set([...visits.values()].map((date) => `${date.getFullYear()}-${date.getMonth()}`)).size >= 12);
  assert(sets.every((set) => set.completedAt < now && set.weight >= 0 && set.reps > 0));
  assert.equal(new Set(sets.map((set) => `${set.workoutId}/${set.exerciseId}/${set.setNumber}`)).size, sets.length);
  const squat = progressFor(sets.filter((set) => set.exerciseId === 'free_exercise_db:Barbell_Squat'), true);
  assert(squat.length >= 52);
  assert(squat.at(-1).value > squat[0].value * 1.4);
  assert(squat.some((point, index) => index > 0 && point.value < squat[index - 1].value));
}
assert.deepEqual(buildDemoWorkoutSets([], new Date()), []);

// Seeding must produce calendar visits and preserve real workouts.
const realWorkout = { id: 'real-workout', split: 'push', createdAt: new Date(), endedAt: new Date() };
const realSet = { exerciseId: exerciseCatalog[0].id, workoutId: realWorkout.id, setNumber: 1, weight: 50, reps: 8, completedAt: new Date() };
const values = new Map([
  ['lift-preview-tracking-schema-version', '3'],
  ['lift-preview-workouts', JSON.stringify([realWorkout])],
  ['lift-preview-sets', JSON.stringify([realSet])],
]);
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, value); },
  removeItem: (key) => { values.delete(key); },
} });
const db = await import('./index.web');
assert(db.getWorkoutVisits().filter(({ workout }) => workout.id.startsWith(demoWorkoutIdPrefix)).length >= 150);
assert(db.getWorkoutVisitSummary(realWorkout.id));
assert.equal(db.getCompletedWorkoutExerciseDetails().get(realWorkout.id)?.[0].sets[0].weight, 50);
console.log('Demo workout history checks passed.');
