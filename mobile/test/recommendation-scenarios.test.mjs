import assert from 'node:assert/strict';
import * as engine from '../src/lib/exercise-recommendations.ts';
import { exerciseCatalog } from '../src/db/exercise-catalog.ts';
import { searchExercises } from '../src/lib/exercise-search.ts';

const now = new Date('2026-10-04T12:00:00Z');
const day = 86_400_000;
const prescription = { sets: 3, reps: { min: 6, max: 10 } };
const exercise = (id, muscles, secondary = [], extra = {}) => ({
  id, name: id, area: 'TEST', mark: 'TE', color: '#000', equipment: 'barbell', isFeatured: 0,
  detailsJson: JSON.stringify({ primaryMuscles: muscles, secondaryMuscles: secondary, category: 'strength', mechanic: 'compound', level: 'beginner', ...extra }),
});
const chest = exercise('Chest Press', ['chest']);
const shoulders = exercise('Shoulder Press', ['shoulders']);
const triceps = exercise('Triceps Press', ['triceps']);
const core = exercise('Core', ['abdominals']);
const bench = exercise('Bench Press', ['chest'], ['shoulders', 'triceps']);
const session = (workoutId, weight, reps = [8, 8, 8], daysAgo = 1) => reps.map((reps, index) => ({
  workoutId, exerciseId: chest.id, setNumber: index + 1, weight, reps, completedAt: new Date(now.getTime() - daysAgo * day + index * 60_000),
}));
const overload = (history, options = {}, target = prescription) => engine.getProgressiveOverloadRecommendation(history, target, { now, ...options });
const plan = (catalog, history = [], context = {}, ratings = []) => engine.getExerciseRecommendations(catalog, history, ratings, 'today', 'push', Infinity, now, context);
const ranking = (catalog, history = [], context = {}, feedback = []) => engine.getRankedExercises(catalog, history, [], 'today', 'push', now, context, feedback);

const scenarios = [
  ['fatigue overrides misses and earned progression', () => {
    for (const history of [[...session('older', 100, [5, 5, 5], 2), ...session('last', 100, [5, 4, 5])], session('last', 100, [10, 10, 10])]) {
      const result = overload(history, { exhaustion: 4 });
      assert.equal(result.action, 'deload');
      assert(result.weight <= 85 && result.sets <= 2);
    }
  }],
  ['small and discrete loads stay usable', () => {
    for (const exhaustion of [2, 4]) {
      assert.equal(overload(session('last', 2.5), { exhaustion, weightIncrement: 2.5, minimumWeight: 2.5 }).weight, 2.5);
      const loads = { minimumWeight: 10, weightIncrement: 5, availableWeights: [10, 17.5, 25, 40] };
      assert(loads.availableWeights.includes(overload(session('last', 25), { ...loads, exhaustion }).weight));
      assert.equal(overload(session('last', 45), { ...engine.getProgressiveOverloadLoadOptions(bench), exhaustion }).weight, 45);
    }
  }],
  ['ramps and back-offs progress each successful tier', () => {
    for (const weights of [[80, 90, 100], [100, 90, 80]]) {
      const history = session('last', 100, [10, 10, 10]).map((set, index) => ({ ...set, weight: weights[index] }));
      for (let setNumber = 1; setNumber <= 3; setNumber++) {
        assert.equal(overload(history, { setNumber }).weight, weights[setNumber - 1] + 5);
        assert.equal(overload(history.slice(0, 2), { setNumber: 1 }).action, 'retain');
      }
    }
  }],
  ['bodyweight progresses without inventing weight', () => {
    for (const reps of [10, 11, 15]) {
      const result = overload(session('last', 0, [reps, reps, reps]));
      assert.equal(result.weight, 0);
      assert.equal(result.reps, reps + 1);
      assert.equal(result.action, 'increase');
    }
  }],
  ['today’s adjustment carries through without repeating increases', () => {
    const options = { currentWorkoutId: 'today', setNumber: 2 };
    const current = { ...session('today', 80, [7], 0)[0] };
    const result = overload([...session('last', 100), current], options);
    assert.equal(result.weight, 80);
    assert.equal(result.reps, 7);
    assert.equal(overload([...session('last', 100, [10, 10, 10]), { ...current, weight: 105, reps: 6 }], options).weight, 105);
  }],
  ['future history and long breaks cannot earn increases', () => {
    assert.equal(overload(session('future', 300, [10, 10, 10], -1)).action, 'start');
    assert.equal(overload(session('ancient', 300, [10, 10, 10], 91)).action, 'start');
    const returning = overload(session('break', 100, [10, 10, 10], 30));
    assert(returning.weight < 100 && returning.sets <= 2 && returning.action === 'reduce');
  }],
  ['independent secondary-muscle recovery drives ranking and load', () => {
    const ratings = [{ workoutId: 'old', split: 'pull', muscle: 'triceps', exhaustion: 10, completedAt: new Date(now - .5 * day) },
      { workoutId: 'new', split: 'push', muscle: 'chest', exhaustion: 0, completedAt: now }];
    const exhaustion = engine.getExerciseRecoveryExhaustion(bench, ratings, now, 'today');
    assert(exhaustion >= 3.5);
    assert.equal(plan([bench], [], {}, ratings).length, 0);
    assert.equal(overload(session('last', 100), { exhaustion }).action, 'deload');
  }],
  ['entry paths share goals while preserving a trimmed plan cap', () => {
    const context = { goals: ['Get stronger'], sessionMinutes: 45 };
    const planned = plan([core], [], context)[0];
    assert.equal(planned.sets, 1);
    const logger = engine.resolveExercisePrescription(core, context, undefined, planned.sets);
    assert.equal(logger.sets, planned.sets);
    assert.deepEqual(logger.reps, planned.reps);
    assert.equal(logger.estimatedMinutes, planned.estimatedMinutes);
    const strength = engine.resolveExercisePrescription(bench, context);
    assert.equal(overload(session('old-goal', 100, [12, 12, 12]), {}, strength).action, 'retain');
    assert.equal(overload(session('old-goal', 100, [12, 12, 12]), {}, strength).reps, strength.reps.max);
    for (const invalid of [0, -1, NaN, 1.5]) assert.equal(engine.resolveExercisePrescription(bench, context, undefined, invalid).sets, strength.sets);
  }],
  ['muscle frequency counts workouts rather than sets', () => {
    const pull = exercise('Pull', ['lats']);
    const legs = exercise('Squat', ['quadriceps']);
    const catalog = [chest, pull, legs, exercise('Fly', ['chest'])];
    const history = [session('push', 100, [8], 10)[0], { ...session('pull', 100, [8], 12)[0], exerciseId: pull.id },
      { ...session('legs', 100, [8], 14)[0], exerciseId: legs.id }];
    const single = ranking(catalog, history).find((item) => item.exercise.id === 'Fly');
    const repeated = ranking(catalog, [...history, ...Array.from({ length: 20 }, () => history[0])]).find((item) => item.exercise.id === 'Fly');
    assert.equal(single.score, repeated.score);
  }],
  ['long plans stop at muscle targets despite favorites', () => {
    const catalog = Array.from({ length: 12 }, (_, index) => ({ ...chest, id: `chest-${index}`, name: `chest-${index}` }));
    const result = plan(catalog, [], { sessionMinutes: 120, favoriteExerciseIds: catalog.map((item) => item.id) });
    assert.equal(result.reduce((total, item) => total + item.sets, 0), 8);
    assert(result.length < catalog.length);
  }],
  ['surplus sets earn no benefit after partial coverage', () => {
    const logged = session('today', 100, [8, 8, 8, 8], 0).map((set) => ({ ...set, completedAt: now }));
    const fresh = { ...chest, id: 'fresh-chest' };
    const result = plan([chest, fresh, shoulders], logged);
    assert.equal(result.find((item) => item.exercise.id === fresh.id)?.sets, 1);
    assert.equal(result[0].exercise.id, shoulders.id);
  }],
  ['extra tags do not beat an equally useful saved routine', () => {
    const tagged = exercise('Tagged', ['chest', 'shoulders', 'triceps']);
    assert.equal(ranking([tagged, chest], [], { routineExerciseIdsBySplit: { push: [chest.id] } })[0].exercise.id, chest.id);
  }],
  ['real catalog presses and chin-ups keep their movement patterns', () => {
    for (const [source, expected] of [['Seated_Dumbbell_Press', 'vertical press'], ['Arnold_Dumbbell_Press', 'vertical press'], ['Chin-Up', 'vertical pull']]) {
      const found = exerciseCatalog.find((item) => item.id === `free_exercise_db:${source}`);
      assert(found, source);
      assert.equal(JSON.parse(found.detailsJson).movementPattern, expected);
    }
  }],
  ['ancient rejection no longer permanently suppresses an anchor', () => {
    const featured = { ...chest, isFeatured: 1 };
    const score = ranking([featured])[0].score;
    const ancient = ranking([featured], [], {}, [{ exerciseId: chest.id, workoutId: 'ancient', action: 'removed', createdAt: new Date('2020-01-01') }])[0].score;
    assert(Math.abs(ancient - score) < 1e-8);
  }],
  ['completed strength work consumes the same time model as planned work', () => {
    const history = session('today', 100, [6, 6, 6], 0).map((set) => ({ ...set, completedAt: now }));
    assert.equal(plan([chest, shoulders, triceps], history, { goals: ['Get stronger'], sessionMinutes: 15 }).length, 0);
  }],
  ['cached ranking can be filtered without changing relative order', () => {
    const catalog = [chest, shoulders, triceps, bench];
    const cached = ranking(catalog);
    const query = 'press';
    const filtered = searchExercises(catalog, query);
    const visible = new Set(filtered.map((item) => item.id));
    const restricted = engine.getRankedExercises(catalog, [], [], 'today', 'push', now, { excludedExerciseIds: catalog.filter((item) => !visible.has(item.id)).map((item) => item.id) });
    assert.deepEqual(cached.filter((item) => visible.has(item.exercise.id)), restricted);
  }],
];

for (const [name, run] of scenarios) {
  try { run(); } catch (error) { throw new Error(`Recommendation scenario failed: ${name}`, { cause: error }); }
}
console.log(`Recommendation scenarios passed: ${scenarios.length} audited failures and boundary combinations.`);
