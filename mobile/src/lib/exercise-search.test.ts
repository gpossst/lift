import { exerciseCatalog } from '../db/exercise-catalog';
import { searchExercises } from './exercise-search';

function assert(value: unknown) {
  if (!value) throw new Error('Search assertion failed');
}
assert.equal = (actual: unknown, expected: unknown, message?: string) => {
  if (actual !== expected) throw new Error(`${message ?? 'Search'}: expected ${expected}, got ${actual}`);
};
assert.deepEqual = (actual: unknown, expected: unknown) => {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
};

const id = (source: string) => `free_exercise_db:${source}`;
const first = (query: string) => searchExercises(exerciseCatalog, query)[0]?.id;

// Even a conflicting recommendation/order must not beat an exact name.
for (const exercise of exerciseCatalog) {
  assert.equal(searchExercises(exerciseCatalog, exercise.name, (a, b) => b.name.localeCompare(a.name))[0]?.id, exercise.id, exercise.name);
}
for (const [query, source] of [
  ['bench press', 'Barbell_Bench_Press_-_Medium_Grip'],
  ['back squat', 'Barbell_Squat'],
  ['OHP', 'Standing_Military_Press'],
  ['RDL', 'Romanian_Deadlift'],
  ['pec deck', 'Butterfly'],
  ['reverse pec deck', 'Reverse_Machine_Flyes'],
  ['pull-ups', 'Pullups'],
  ['push ups', 'Pushups'],
  ['chinups', 'Chin-Up'],
  ['DB bench press', 'Dumbbell_Bench_Press'],
  ['  DUMBBELL   BENCH-PRESS  ', 'Dumbbell_Bench_Press'],
  ['dumbbell fly', 'Dumbbell_Flyes'],
  ['skull crusher', 'EZ-Bar_Skullcrusher'],
]) assert.equal(first(query), id(source), query);
assert(searchExercises(exerciseCatalog, 'bench dumbbell').some((exercise) => exercise.id === id('Dumbbell_Bench_Press')));
assert(searchExercises(exerciseCatalog, 'chest dumbbell').some((exercise) => exercise.id === id('Dumbbell_Bench_Press')));
assert.equal(searchExercises(exerciseCatalog, 'zzzzunknownmovement').length, 0);
assert.deepEqual(searchExercises(exerciseCatalog, '   '), exerciseCatalog);
assert.equal(searchExercises([{ id: 'unrelated', name: 'Squat', detailsJson: JSON.stringify({ instructions: ['Do a bench press first'] }) }], 'bench press').length, 0);
const stats = [{ id: id('Standing_Military_Press'), name: 'Standing Military Press', sessions: 3 }];
assert.deepEqual(searchExercises(stats, 'overhead press'), stats);
console.log(`Exercise search checks passed, including ${exerciseCatalog.length} exact names.`);
