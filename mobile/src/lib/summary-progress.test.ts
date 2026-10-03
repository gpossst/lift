import { exerciseProgress } from './summary-progress';

function assertProgress(actual: ReturnType<typeof exerciseProgress>, expected: ReturnType<typeof exerciseProgress>) {
  if (actual.improved !== expected.improved || actual.label !== expected.label) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const earlier = new Date('2026-09-01');
const current = new Date('2026-09-08');
const history = [{ workoutId: 'prior', completedAt: earlier, weight: 100, reps: 5 }];

assertProgress(exerciseProgress([{ weight: 110, reps: 5 }], history, 'now', current, true), { improved: true, label: '↑ 10 lb on your best set' });
assertProgress(exerciseProgress([{ weight: 100, reps: 6 }], history, 'now', current, true), { improved: true, label: '↑ 100 lb volume from last time' });
assertProgress(exerciseProgress([{ weight: 0, reps: 8 }], [{ ...history[0], weight: 0, reps: 6 }], 'now', current, false), { improved: true, label: '↑ 2 reps on your best set' });
assertProgress(exerciseProgress([{ weight: 100, reps: 5 }], [], 'now', current, true), { improved: false, label: 'First time logged' });
