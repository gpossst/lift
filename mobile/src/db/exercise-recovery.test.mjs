import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { mock } from 'bun:test';
import { getEffectiveExhaustion, getExerciseRecoveryExhaustion, getExerciseRecommendations, getProgressiveOverloadRecommendation } from '../lib/exercise-recommendations.ts';

process.env.EXPO_PUBLIC_SEED_DEMO_DATA = 'false';
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => { storage.set(key, value); },
  removeItem: (key) => { storage.delete(key); },
} });
const web = await import('./index.web.ts');
const connection = new Database(':memory:');
mock.module('expo-sqlite', () => ({ openDatabaseSync: () => ({
  execSync: (sql) => connection.exec(sql),
  runSync: (sql, params = []) => connection.query(sql).run(...params),
  getFirstSync: (sql, params = []) => connection.query(sql).get(...params),
  getAllSync: (sql, params = []) => connection.query(sql).all(...params),
}) }));
mock.module('drizzle-orm/expo-sqlite', () => ({ drizzle: () => ({}) }));
const native = await import('./index.native.ts');
const now = new Date('2026-09-30T12:00:00Z');
const day = 86_400_000;
const exercise = web.getExercises().find((item) => {
  const details = JSON.parse(item.detailsJson ?? '{}');
  return details.primaryMuscles?.includes('chest') && details.secondaryMuscles?.includes('triceps') && details.level === 'beginner';
});
assert(exercise, 'fixture needs a beginner chest exercise involving triceps');
const rating = (workoutId, muscle, exhaustion, daysAgo) => ({
  workoutId, split: 'push', muscle, exhaustion, completedAt: new Date(now.getTime() - daysAgo * day),
});
const prescription = { sets: 3, reps: { min: 6, max: 10 } };
const history = [1, 2, 3].map((setNumber) => ({ workoutId: 'previous', completedAt: now, weight: 100, reps: 10, setNumber }));

function check(ratings, expected, action) {
  const workouts = ratings.map(({ workoutId: id, split, completedAt }) => ({ id, split, createdAt: completedAt, endedAt: completedAt }));
  storage.set('lift-preview-workouts', JSON.stringify(workouts));
  storage.set('lift-preview-muscle-ratings', JSON.stringify(Object.fromEntries(ratings.map((item) => [item.workoutId, { [item.muscle]: item.exhaustion }]))));
  connection.exec('DELETE FROM workout_muscle_ratings; DELETE FROM workouts;');
  for (const item of ratings) {
    connection.query('INSERT INTO workouts (id, split, created_at, ended_at) VALUES (?, ?, ?, ?)').run(item.workoutId, item.split, item.completedAt.getTime() / 1000, item.completedAt.getTime() / 1000);
    connection.query('INSERT INTO workout_muscle_ratings (workout_id, muscle, exhaustion, created_at) VALUES (?, ?, ?, ?)').run(item.workoutId, item.muscle, item.exhaustion, item.completedAt.getTime() / 1000);
  }
  assert.equal(getExerciseRecoveryExhaustion(exercise, ratings, now, 'current'), expected);
  for (const adapter of [web, native]) {
    const exhaustion = adapter.getRecentExerciseExhaustion(exercise.id, 'current', now);
    assert.equal(exhaustion, expected);
    assert.equal(getProgressiveOverloadRecommendation(history, prescription, { exhaustion, now }).action, action);
    assert.equal(adapter.getRecentExerciseExhaustion('missing', 'current', now), undefined);
  }
}

// A newer chest check-in must not hide a still-fatigued secondary muscle.
const separateMuscles = [rating('older-triceps', 'triceps', 10, .5), rating('newer-chest', 'chest', 0, 0)];
check(separateMuscles, getEffectiveExhaustion(10, separateMuscles[0].completedAt, now), 'deload');
assert.equal(getExerciseRecommendations([exercise], [], separateMuscles, 'current', 'push', 1, now).length, 0);
check([...separateMuscles].reverse(), getEffectiveExhaustion(10, separateMuscles[0].completedAt, now), 'deload');
const moderate = [rating('older-triceps', 'triceps', 8, 1), rating('newer-chest', 'chest', 0, 0)];
check(moderate, getEffectiveExhaustion(8, moderate[0].completedAt, now), 'reduce');
assert.equal(getExerciseRecommendations([exercise], [], moderate, 'current', 'push', 1, now)[0].sets, 2);
// A newer rating replaces only the same muscle's previous rating.
check([...separateMuscles, rating('recovered-triceps', 'triceps', 0, 0)], 1, 'increase');
check([rating('older-chest', 'chest', 8, 1), rating('newer-triceps', 'triceps', 0, 0)], getEffectiveExhaustion(8, new Date(now.getTime() - day), now), 'reduce');
check([rating('current', 'chest', 10, 0), rating('future', 'triceps', 10, -1), rating('stale', 'chest', 10, 7.01), rating('unrelated', 'calves', 10, 0)], undefined, 'increase');
check([rating('boundary', 'chest', 10, 7)], getEffectiveExhaustion(10, new Date(now.getTime() - 7 * day), now), 'increase');
check([], undefined, 'increase');

const multiplePrimary = { detailsJson: JSON.stringify({ primaryMuscles: ['chest', 'shoulders'] }) };
assert.equal(getExerciseRecoveryExhaustion(multiplePrimary, [rating('older', 'shoulders', 8, 1), rating('newer', 'chest', 0, 0)], now), getEffectiveExhaustion(8, new Date(now.getTime() - day), now));
for (const detailsJson of [null, 'null', '{', JSON.stringify({ primaryMuscles: 'chest', secondaryMuscles: [null, 3] })]) {
  assert.equal(getExerciseRecoveryExhaustion({ detailsJson }, separateMuscles, now), undefined);
}
