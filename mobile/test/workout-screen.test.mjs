import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('workout.tsx', readFileSync(new URL('../src/app/workout.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(name) {
  let result;
  function visit(node) {
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText(source) === name) result = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result, `Missing ${name}`);
  return result;
}
const run = (code, context) => vm.runInNewContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), context);
const value = (name, context) => run(find(name).initializer.getText(source), context);

// Execute the real memo expression across workouts with the same exercise.
let previousDeps, previousValue, reads = 0;
const memoContext = {
  exerciseId: 'squat', workoutId: 'first', getWorkoutHistory: () => [++reads],
  useMemo: (read, deps) => {
    if (!previousDeps || deps.some((dep, i) => dep !== previousDeps[i])) {
      previousDeps = deps;
      previousValue = read();
    }
    return previousValue;
  },
};
assert.equal(value('completedHistory', memoContext)[0], 1);
memoContext.workoutId = 'second';
assert.equal(value('completedHistory', memoContext)[0], 2);

// setParams merges: keep the original cap through a superset round trip.
const route = { id: 'squat', recommendedSets: '2' };
const switchContext = {
  exerciseId: 'squat', plannedExerciseId: value('plannedExerciseId', { params: route, exerciseId: route.id }),
  workoutId: 'first', supersetIds: ['squat', 'row'], setSwitchDirection() {},
  router: { setParams: (params) => Object.assign(route, params) },
};
const switchExercise = run(`(${find('switchExercise').getText(source)})`, switchContext);
switchExercise({ id: 'row' });
assert.equal(value('plannedExerciseId', { params: route, exerciseId: route.id }), 'squat');
assert.notEqual(route.recommendedExerciseId, route.id);
switchExercise({ id: 'squat' });
assert.equal(value('plannedSets', { params: route }), 2);

// Fresh navigation overwrites a merged cap and superset, including manual opens.
const exercisesSource = readFileSync(new URL('../src/app/exercises.tsx', import.meta.url), 'utf8');
const routeParams = exercisesSource.match(/router\.push\(\{ pathname: '\/workout', params: (\{[\s\S]*?\n    \}) \}\)/)?.[1];
assert.ok(routeParams);
Object.assign(route, run(`(${routeParams})`, { exercise: { id: 'press' }, workoutId: 'second', recommendation: { sets: 4 } }));
assert.equal(route.recommendedExerciseId, 'press');
assert.equal(route.recommendedSets, 4);
Object.assign(route, run(`(${routeParams})`, { exercise: { id: 'row' }, workoutId: 'second', recommendation: undefined }));
assert.equal(route.recommendedSets, undefined);
assert.equal(route.superset, undefined);

function saveContext({ failSave = false, failRefresh = false, stored = [], setNumber = 1 } = {}) {
  const state = { saves: 0, setNumber, weight: '100', reps: '8', alerts: [], stored };
  const context = {
    usesWeight: true, weight: state.weight, reps: state.reps, setNumber,
    isValidWorkoutSetValues: () => true, savingRef: { current: false }, setSaving() {},
    exerciseId: 'squat', workoutId: 'first',
    saveWorkoutSet(set) {
      if (failSave) throw new Error('Workout deleted');
      if (stored.some((row) => row.setNumber === set.setNumber)) throw new Error('UNIQUE constraint failed');
      stored.push(set);
      state.saves++;
    },
    getNextSetNumberForWorkout: () => Math.max(0, ...stored.map((row) => row.setNumber)) + 1,
    setSetNumber: (update) => { state.setNumber = typeof update === 'function' ? update(state.setNumber) : update; },
    Haptics: { impactAsync: () => Promise.resolve(), ImpactFeedbackStyle: { Light: 'light' } },
    setLabelScale: {}, withSequence() {}, withSpring() {},
    getWorkoutHistory() { if (failRefresh) throw new Error('Read failed'); return []; },
    setHistory() {}, completedHistory: [], prescription: {}, loadOptions: {},
    getRecentExerciseExhaustion() {}, getProgressiveOverloadRecommendation: () => ({ action: 'start' }),
    setWeight: (weight) => { state.weight = weight; }, setReps: (reps) => { state.reps = reps; }, setField() {},
    supersetExercises: [], startRest() {}, Platform: { OS: 'ios' },
    Alert: { alert: (...args) => state.alerts.push(args) },
  };
  return { state, save: run(`(${find('saveSet').getText(source)})`, context) };
}
const failed = saveContext({ failSave: true });
failed.save();
assert.equal(failed.state.saves, 0);
assert.equal(failed.state.setNumber, 1);
assert.equal(failed.state.weight, '100');
assert.equal(failed.state.reps, '8');
assert.equal(failed.state.alerts[0][0], 'Could not save set');
const refreshFailed = saveContext({ failRefresh: true });
refreshFailed.save();
refreshFailed.save();
assert.equal(refreshFailed.state.saves, 1);
assert.equal(refreshFailed.state.setNumber, 2);
assert.equal(refreshFailed.state.alerts[0][0], 'Set saved');
const success = saveContext();
success.save();
success.save();
assert.equal(success.state.saves, 1, 'Stale render must not save twice');
assert.equal(success.state.setNumber, 2);
// Another device synced set 1 while this screen still showed SET 1.
const synced = { setNumber: 1, weight: 135, reps: 5 };
const collided = saveContext({ stored: [synced] });
collided.save();
assert.equal(collided.state.saves, 0);
assert.deepEqual(collided.state.stored, [synced], 'Collision must not overwrite the synced set');
assert.equal(collided.state.setNumber, 2, 'Collision must move to the next free number');
assert.equal(collided.state.weight, '100');
assert.equal(collided.state.reps, '8');
const retry = saveContext({ stored: collided.state.stored, setNumber: collided.state.setNumber });
retry.save(); // Re-render with the recovered number saves the kept entries.
assert.equal(retry.state.saves, 1);
assert.equal(retry.state.stored[1].setNumber, 2);
assert.equal(retry.state.stored[1].weight, 100);
console.log('Workout screen regressions passed.');
