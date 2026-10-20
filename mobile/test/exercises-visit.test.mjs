import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { transformSync } from '@babel/core';

// Execute the real refreshVisit from exercises.tsx against stubbed state.
const source = ts.createSourceFile('exercises.tsx', readFileSync(new URL('../src/app/exercises.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let declaration;
(function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'refreshVisit') declaration = node;
  ts.forEachChild(node, visit);
})(source);
assert.ok(declaration, 'Missing refreshVisit');

const empty = (id, createdAt) => ({ workout: { id, split: 'push', createdAt: new Date(createdAt), endedAt: null }, sets: 0, exercises: 0, volume: 0, reps: 0 });
const summaries = { a: empty('a', 1_000), b: empty('b', 2_000) };
let visit, workoutExercises = [];
const refresh = (workoutId) => vm.runInNewContext(ts.transpile(declaration.initializer.getText(source), { target: ts.ScriptTarget.ES2022 }), {
  workoutId,
  useCallback: (callback) => callback,
  getWorkoutVisitSummary: (id) => summaries[id] ?? null,
  getWorkoutVisitExercises: () => [],
  setVisit: (next) => { visit = next(visit); },
  setWorkoutExercises: (next) => { workoutExercises = next(workoutExercises); },
})();

refresh('a');
assert.equal(visit, summaries.a);
refresh('a');
assert.equal(visit, summaries.a, 'unchanged visit keeps its identity');
// Old empty A -> fresh empty B with identical totals must switch to B's visit and start time.
refresh('b');
assert.equal(visit.workout.id, 'b');
// A missing workout (deleted, or no workoutId) clears the stale visit.
refresh('gone');
assert.equal(visit, null);
refresh('b');
refresh(undefined);
assert.equal(visit, null);
console.log('exercises visit refresh ok');

// Compile the real screen: opaque DB reads must keep their explicit revision
// dependencies, which React Compiler previously removed as unused values.
const compiled = transformSync(source.text, {
  filename: new URL('../src/app/exercises.tsx', import.meta.url).pathname,
  configFile: false,
  babelrc: false,
  plugins: [['babel-plugin-react-compiler', {}]],
  parserOpts: { plugins: ['typescript', 'jsx'] },
}).code;
const output = ts.createSourceFile('compiled.tsx', compiled, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const plannerDependencies = [];
(function visit(node) {
  if (ts.isVariableDeclaration(node) && ['recommendations', 'rankedExerciseScores'].includes(node.name.getText(output))) {
    const call = node.initializer;
    if (ts.isCallExpression(call) && call.expression.getText(output) === 'useMemo') {
      plannerDependencies.push(call.arguments[1].getText(output));
    }
  }
  ts.forEachChild(node, visit);
})(output);
assert.equal(plannerDependencies.length, 2, 'compiled planner must retain both explicit memos');
for (const dependencies of plannerDependencies) {
  assert(dependencies.includes('workoutExerciseKey'), 'newly logged exercises must refresh the plan');
  assert(dependencies.includes('workoutSetRevision'), 'additional sets must refresh the plan and catalog ranking');
  assert(dependencies.includes('workoutId'), 'switching workouts on the same day must refresh the plan');
}
console.log('compiled exercise recommendation dependencies ok');
