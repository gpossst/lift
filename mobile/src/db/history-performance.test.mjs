import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { mock } from 'bun:test';

// Run both production adapters against the same 100-visit history. Bun SQLite
// executes the native adapter's actual SQL, including migrations and joins.
const values = new Map();
const reads = new Map();
process.env.EXPO_PUBLIC_SEED_DEMO_DATA = 'false';
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key) => { reads.set(key, (reads.get(key) ?? 0) + 1); return values.get(key) ?? null; },
  setItem: (key, value) => { values.set(key, value); },
  removeItem: (key) => { values.delete(key); },
} });
const web = await import('./index.web.ts');
const connection = new Database(':memory:');
let queries = 0;
mock.module('expo-sqlite', () => ({ openDatabaseSync: () => ({
  execSync: (sql) => connection.exec(sql),
  runSync: (sql, params = []) => connection.query(sql).run(...params),
  getFirstSync: (sql, params = []) => { queries += 1; return connection.query(sql).get(...params); },
  getAllSync: (sql, params = []) => { queries += 1; return connection.query(sql).all(...params); },
}) }));
mock.module('drizzle-orm/expo-sqlite', () => ({ drizzle: () => ({}) }));
const native = await import('./index.native.ts');
const [first, second] = web.getExercises();
const now = new Date('2026-09-30T12:00:00Z');
const workouts = Array.from({ length: 100 }, (_, index) => ({
  id: `visit-${String(index).padStart(3, '0')}`,
  split: index % 2 ? 'push' : 'pull',
  createdAt: new Date(now.getTime() - (index + 1) * 3_600_000),
  endedAt: new Date(now.getTime() - index * 3_600_000),
}));
// Equal completion times exercise the tie-breaker; epoch completion remains valid.
workouts[1].endedAt = workouts[0].endedAt;
workouts.push({ id: 'epoch', split: 'legs', createdAt: new Date(0), endedAt: new Date(0) });
const completed = [...workouts];
workouts.push({ id: 'active', split: 'push', createdAt: now, endedAt: null });
workouts.push({ id: 'empty', split: 'pull', createdAt: now, endedAt: now });
const sets = workouts.filter((workout) => workout.id !== 'empty').flatMap((workout) => [
  { exerciseId: first.id, workoutId: workout.id, setNumber: 2, weight: 100, reps: 8, completedAt: workout.createdAt },
  { exerciseId: second.id, workoutId: workout.id, setNumber: 1, weight: 50, reps: 10, completedAt: workout.createdAt },
  { exerciseId: first.id, workoutId: workout.id, setNumber: 1, weight: 25, reps: 12, completedAt: workout.createdAt },
]);
values.set('lift-preview-workouts', JSON.stringify(workouts));
values.set('lift-preview-sets', JSON.stringify(sets));
for (const workout of workouts) connection.query('INSERT INTO workouts (id, split, created_at, ended_at) VALUES (?, ?, ?, ?)').run(
  workout.id, workout.split, workout.createdAt.getTime() / 1000, workout.endedAt?.getTime() / 1000 ?? null,
);
for (const set of sets) connection.query('INSERT INTO workout_sets (exercise_id, workout_id, set_number, weight, reps, completed_at) VALUES (?, ?, ?, ?, ?, ?)').run(
  set.exerciseId, set.workoutId, set.setNumber, set.weight, set.reps, set.completedAt.getTime() / 1000,
);

function readWeb(load) {
  reads.clear();
  const result = load();
  assert.equal(reads.get('lift-preview-sets'), 1, 'full set history is read once regardless of visit count');
  assert.equal(reads.get('lift-preview-workouts'), 1, 'workout history is read once');
  return result;
}
function readNative(load) {
  queries = 0;
  const result = load();
  assert.equal(queries, 1, 'one SQL query regardless of visit count');
  return result;
}
const visits = readWeb(web.getWorkoutVisits);
const nativeVisits = readNative(native.getWorkoutVisits);
assert.equal(visits.length, completed.length);
assert.deepEqual(visits.map(({ workout }) => workout.id), ['visit-000', 'visit-001', ...completed.slice(2).map(({ id }) => id)]);
const summary = ({ workout, sets, exercises, volume, reps }) => ({ workout, sets, exercises, volume, reps });
assert.deepEqual(nativeVisits.map(summary), visits.map(summary));
for (const visit of visits) assert.deepEqual({ sets: visit.sets, exercises: visit.exercises, volume: visit.volume, reps: visit.reps }, { sets: 3, exercises: 2, volume: 1600, reps: 30 });

const details = readWeb(web.getCompletedWorkoutExerciseDetails);
const nativeDetails = readNative(native.getCompletedWorkoutExerciseDetails);
assert.equal(details.size, completed.length);
assert.equal(nativeDetails.size, completed.length);
for (const workout of completed) {
  assert.deepEqual(details.get(workout.id), web.getWorkoutVisitExerciseDetails(workout.id), 'bulk details retain per-visit grouping and set order');
  assert.deepEqual(nativeDetails.get(workout.id), details.get(workout.id), 'native and web bulk results match');
}
assert.equal(details.has('active'), false);
assert.equal(details.has('empty'), false);
const sessions = readWeb(web.getExerciseSessionCounts);
assert.deepEqual(readNative(native.getExerciseSessionCounts), sessions);
assert.equal(sessions.get(first.id), completed.length, 'multiple sets count as one exercise session');
assert.equal(sessions.get(second.id), completed.length);

// Bulk split recommendation must retain the old per-workout rating semantics.
const chest = native.getExercises().find((exercise) => JSON.parse(exercise.detailsJson).primaryMuscles.includes('chest'));
connection.query('INSERT INTO workout_sets (exercise_id, workout_id, set_number, weight, reps, completed_at) VALUES (?, ?, 1, 100, 8, ?)').run(chest.id, completed[0].id, now.getTime() / 1000);
connection.query('INSERT INTO workout_muscle_ratings (workout_id, muscle, exhaustion, created_at) VALUES (?, ?, 4, ?)').run(completed[0].id, 'chest', now.getTime() / 1000);
connection.query('INSERT INTO workout_muscle_ratings (workout_id, muscle, exhaustion, created_at) VALUES (?, ?, 4, ?)').run('active', 'chest', now.getTime() / 1000);
const { getRecommendedWorkoutSplit } = await import('../lib/exercise-recommendations.ts');
const history = native.getWorkoutVisits();
const ratings = history.flatMap(({ workout }) => native.getWorkoutMuscleRatings(workout.id).map((rating) => ({
  workoutId: workout.id, split: workout.split, muscle: rating.id, exhaustion: rating.exhaustion, completedAt: workout.endedAt,
})));
const expectedSplit = getRecommendedWorkoutSplit(history.map(({ workout, sets }) => ({ split: workout.split, completedAt: workout.endedAt, sets })), now, ratings);
queries = 0;
assert.equal(native.getRecommendedWorkoutSplit(now), expectedSplit);
assert.equal(queries, 3, 'split recommendations use bulk ratings, visit summaries, and custom splits only');
connection.close();
console.log('History regression passed: 101 completed visits; one web history read / one native query per aggregate; three queries for split recommendations.');
