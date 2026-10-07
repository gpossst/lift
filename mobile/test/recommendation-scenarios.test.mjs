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
  ['equal muscle fatigue does not favor narrower splits', () => {
    const narrow = { id: 'custom:chest', name: 'Chest', muscles: ['chest'] };
    const upper = { id: 'custom:upper', name: 'Upper', muscles: ['chest', 'shoulders', 'triceps', 'lats', 'biceps'] };
    const lower = { id: 'custom:lower', name: 'Lower', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves'] };
    const full = { id: 'custom:full', name: 'Full body', muscles: [...upper.muscles, ...lower.muscles] };
    for (const definitions of [[full, narrow], [upper, lower], engine.defaultWorkoutSplits]) {
      for (const exhaustion of [0, 2, 5, 10]) {
        const ratings = [...new Set(definitions.flatMap((split) => split.muscles))].map((muscle) => ({
          workoutId: 'check-in', split: 'unrelated', muscle, exhaustion, completedAt: now,
        }));
        assert.equal(engine.getRecommendedWorkoutSplit([], now, ratings, definitions), definitions[0].id);
        for (const overdue of definitions) {
          const history = definitions.map((split) => ({
            split: split.id, sets: 3, completedAt: new Date(now - (split === overdue ? 4 : 3) * day),
          }));
          assert.equal(engine.getRecommendedWorkoutSplit(history, now, ratings, definitions), engine.getRecommendedWorkoutSplit(history, now, [], definitions));
          const volume = definitions.map((split) => ({ split: split.id, sets: split === overdue ? 2 : 4, completedAt: new Date(now - 3 * day) }));
          assert.equal(engine.getRecommendedWorkoutSplit(volume, now, ratings, definitions), engine.getRecommendedWorkoutSplit(volume, now, [], definitions));
        }
      }
    }
  }],
  ['broader splits can train recovered muscles while fatigued exercises stay excluded', () => {
    const chestOnly = { id: 'custom:chest', name: 'Chest', muscles: ['chest'] };
    const full = { id: 'custom:full', name: 'Full body', muscles: ['chest', 'quadriceps', 'lats'] };
    const fresh = { id: 'custom:fresh', name: 'Fresh', muscles: ['biceps'] };
    const ratings = [{ workoutId: 'check-in', split: 'other', muscle: 'chest', exhaustion: 10, completedAt: now }];
    assert.equal(engine.getRecommendedWorkoutSplit([], now, ratings, [chestOnly, full]), full.id);
    const result = engine.getExerciseRecommendations([chest, exercise('Squat', ['quadriceps']), exercise('Row', ['lats'])], [], ratings, 'today', full.id, 3, now, {}, [], full);
    assert(result.length > 0);
    assert(result.every((item) => item.exercise.id !== chest.id));
    assert.equal(engine.getRecommendedWorkoutSplit([], now, ratings, [full, fresh]), fresh.id);
    // A one-muscle split still receives the full existing recovery penalty.
    assert.equal(engine.getRecommendedWorkoutSplit([{ split: fresh.id, sets: 0, completedAt: now }], now, ratings, [chestOnly, fresh]), fresh.id);
    for (const daysAgo of [8, -1]) {
      const ignored = ratings.map((rating) => ({ ...rating, completedAt: new Date(now - daysAgo * day) }));
      assert.equal(engine.getRecommendedWorkoutSplit([], now, ignored, [full, fresh]), full.id);
    }
    const later = new Date(now.getTime() + 1000);
    const latest = [...ratings, { ...ratings[0], exhaustion: 0, completedAt: later }];
    assert.equal(engine.getRecommendedWorkoutSplit([], later, latest, [full, fresh]), full.id);
  }],
  ['learned routines stay familiar and follow observed order', () => {
    const usual = [bench, shoulders, triceps];
    const odd = exercise('Car Drivers', ['shoulders'], [], { mechanic: 'isolation' });
    const discovery = { ...core, isFeatured: 1 };
    const history = Array.from({ length: 8 }, (_, visit) => usual.map((item, index) => ({
      ...session(`routine-${visit}`, 100, [8], 8 + visit * 7)[0], exerciseId: item.id,
      completedAt: new Date(now - (8 + visit * 7) * day + index * 60_000),
    }))).flat();
    const result = engine.getExerciseRecommendations([...usual, odd, discovery], history, [], 'today', 'push', 3, now);
    assert.deepEqual(result.map((item) => item.exercise.id), usual.map((item) => item.id));
    const realStaples = ['Barbell_Bench_Press_-_Medium_Grip', 'Incline_Dumbbell_Press', 'Triceps_Pushdown', 'Side_Lateral_Raise'].map((source) => {
      const item = exerciseCatalog.find((item) => item.id === `free_exercise_db:${source}`);
      assert(item, source); return item;
    });
    const realHistory = Array.from({ length: 8 }, (_, visit) => realStaples.flatMap((item, index) => session(`real-${visit}`, 100, [8, 8, 8], 8 + visit * 7).map((set) => ({
      ...set, exerciseId: item.id, completedAt: new Date(set.completedAt.getTime() + index * 10 * 60_000),
    })))).flat();
    const realPlan = engine.getExerciseRecommendations(exerciseCatalog, realHistory, [], 'today', 'push', 3, now);
    assert.equal(realPlan[0].exercise.id, realStaples[0].id);
    assert(realPlan.every((item) => realStaples.some((known) => known.id === item.exercise.id)));
    const longer = plan([...usual, odd, discovery, { ...discovery, id: 'another-core' }], history, { sessionMinutes: 120 });
    assert(!longer.some((item) => item.exercise.id === odd.id));
    assert(longer.filter((item) => !usual.some((known) => known.id === item.exercise.id)).length <= 1);
    const intermediate = { ...bench, detailsJson: JSON.stringify({ ...JSON.parse(bench.detailsJson), level: 'intermediate' }) };
    const expert = { ...intermediate, detailsJson: JSON.stringify({ ...JSON.parse(bench.detailsJson), level: 'expert' }) };
    for (const item of [intermediate, expert]) {
      assert.equal(plan([item], []).length, 0);
      assert.equal(plan([item], history)[0].exercise.id, bench.id);
    }
    const impression = { exerciseId: bench.id, workoutId: 'last', action: 'impression', createdAt: new Date(now - day) };
    assert.equal(ranking([bench, odd], history, {}, [impression, { ...impression, action: 'skipped' }])[0].exercise.id, bench.id);
    const recentlyTrained = history.map((set) => set.exerciseId === bench.id && set.workoutId === 'routine-0' ? { ...set, completedAt: new Date(now - 20 / 24 * day) } : set);
    const benchScore = (sets) => ranking(usual, sets).find((item) => item.exercise.id === bench.id).score;
    assert(benchScore(recentlyTrained) < benchScore(history));
  }],
  ['regular compounds beat unfamiliar shorter catalog movements', () => {
    const novelty = exercise('A New Fly', ['chest'], [], { mechanic: 'isolation' });
    novelty.isFeatured = 1;
    const history = [8, 15, 22].flatMap((daysAgo, index) => session(`habit-${index}`, 100, [8], daysAgo).map((set) => ({ ...set, exerciseId: bench.id })));
    assert.equal(ranking([bench, novelty])[0].exercise.id, novelty.id);
    assert.equal(ranking([bench, novelty], history)[0].exercise.id, bench.id);
    assert.equal(plan([bench, novelty], history)[0].exercise.id, bench.id);
    assert.equal(ranking([bench, novelty], history)[0].reason, 'A regular part of your training');
    assert.deepEqual(ranking([bench, novelty], history), ranking([novelty, bench], [...history].reverse()));
    const heavySingleVisit = Array.from({ length: 20 }, () => history[0]);
    assert.equal(ranking([bench, novelty], heavySingleVisit)[0].exercise.id, novelty.id);
  }],
  ['habit confidence fades and follows changing choices', () => {
    const alternative = { ...chest, id: 'Alternative Press', name: 'Alternative Press' };
    const habit = [8, 15, 22].map((daysAgo, index) => session(`habit-${index}`, 100, [8], daysAgo)[0]);
    const score = (sets) => ranking([chest, alternative], sets).find((item) => item.exercise.id === chest.id).score;
    const pull = exercise('Pull', ['lats']);
    const unrelated = [3, 10, 17].map((daysAgo, index) => ({ ...session(`pull-${index}`, 100, [8], daysAgo)[0], exerciseId: pull.id }));
    assert.deepEqual(ranking([chest, alternative], habit), ranking([chest, alternative, pull], [...habit, ...unrelated]));
    const replacement = [8, 15, 22, 29, 36, 43].map((daysAgo, index) => ({ ...session(`alternative-${index}`, 100, [8], daysAgo)[0], exerciseId: alternative.id }));
    assert(score([...habit, ...replacement]) < score(habit));
    assert.equal(ranking([chest, alternative], [...habit, ...replacement])[0].exercise.id, alternative.id);
    assert(score(habit.map((set) => ({ ...set, completedAt: new Date(set.completedAt - 60 * day) }))) < score(habit));
    const rejections = [1, 2, 3].map((daysAgo) => ({ exerciseId: chest.id, workoutId: `rejected-${daysAgo}`, action: 'removed', createdAt: new Date(now - daysAgo * day) }));
    assert.equal(ranking([chest, alternative], habit, {}, rejections)[0].exercise.id, alternative.id);
    assert(!engine.getExerciseRecommendations([chest, alternative], habit, [], 'today', 'push', 3, now, {}, rejections).some((item) => item.exercise.id === chest.id));
    const fatigue = [{ workoutId: 'fatigued', split: 'push', muscle: 'chest', exhaustion: 10, completedAt: now }];
    assert.equal(plan([chest, alternative], habit, {}, fatigue).length, 0);
    assert.deepEqual(ranking([chest, alternative], habit), ranking([chest, alternative], [...habit, ...session('future', 100, [8], -1)]));
  }],
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
