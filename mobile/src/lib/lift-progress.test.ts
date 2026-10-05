import { comparePeriods, exerciseHistories, progressFor } from './lift-progress';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const older = new Date('2026-09-01T12:00:00Z');
const newer = new Date('2026-09-08T12:00:00Z');
const progress = progressFor([
  { workoutId: 'new', setNumber: 2, weight: 150, reps: 5, completedAt: newer },
  { workoutId: 'old', setNumber: 1, weight: 100, reps: 10, completedAt: older },
  { workoutId: 'new', setNumber: 1, weight: 120, reps: 10, completedAt: newer },
], true);

assert(progress.length === 2, 'groups sets by workout');
assert(progress[0].workoutId === 'old' && progress[1].workoutId === 'new', 'sorts workouts chronologically');
assert(progress[1].bestSet.weight === 150, 'uses the highest estimated 1RM as the best set');
assert(progress[1].sets[0].setNumber === 1, 'sorts sets by set number');
assert(progressFor([{ workoutId: 'single', setNumber: 1, weight: 200, reps: 1, completedAt: newer }], true)[0].value === 200, 'uses actual weight for a one-rep set');
const differentBestSets = [
  { workoutId: 'different', setNumber: 1, weight: 150, reps: 5, completedAt: newer },
  { workoutId: 'different', setNumber: 2, weight: 140, reps: 10, completedAt: newer },
];
assert(progressFor(differentBestSets, true)[0].bestSet.setNumber === 2, 'estimated 1RM favors the stronger rep set');
assert(progressFor(differentBestSets, true, 'maxWeight')[0].bestSet.setNumber === 1, 'max weight uses the heaviest logged set');
assert(progressFor(differentBestSets, true, 'maxWeight')[0].value === 150, 'max weight charts the logged weight');
assert(progressFor([{ workoutId: 'decimal', setNumber: 1, weight: 52.5, reps: 8, completedAt: newer }], true, 'maxWeight')[0].value === 52.5, 'max weight keeps fractional pounds');
assert(progressFor(differentBestSets, true, 'volume')[0].value === 2150, 'volume sums every set in the workout');
assert(progressFor(differentBestSets, true, 'volume')[0].bestSet.setNumber === 2, 'volume retains the largest contributing set');
assert(progressFor(differentBestSets, false, 'totalReps')[0].value === 15, 'bodyweight workout reps sum every set');
assert(progress[0].personalBest === false && progress[1].personalBest === true, 'first workout is a baseline and a later record is marked');
const periodHistory = [
  ['older-1', '2026-07-10', 100], ['older-2', '2026-07-20', 100],
  ['previous-1', '2026-08-10', 100], ['previous-2', '2026-08-20', 100],
  ['current-1', '2026-09-10', 120], ['current-2', '2026-09-20', 120],
].map(([workoutId, date, weight]) => ({ workoutId: String(workoutId), setNumber: 1, weight: Number(weight), reps: 1, completedAt: new Date(`${date}T12:00:00Z`) }));
const periodPoints = progressFor(periodHistory, true, 'maxWeight');
assert(comparePeriods(periodPoints, 4, new Date('2026-09-29T12:00:00Z')).change === 20, 'compares average workout values with preceding period');
assert(comparePeriods(periodPoints.slice(0, -1), 4, new Date('2026-09-29T12:00:00Z')).change === null, 'one current workout does not yield a percentage');
assert(comparePeriods(periodPoints, 12, new Date('2026-09-29T12:00:00Z')).current.length === 6, 'twelve-week view includes older workouts');
assert(comparePeriods(periodPoints, 13, new Date('2026-09-29T12:00:00Z')).current.length === 6, 'three-month view includes older workouts');
assert(comparePeriods(periodPoints, null, new Date('2026-09-29T12:00:00Z')).current.length === 6 && comparePeriods(periodPoints, null, new Date('2026-09-29T12:00:00Z')).change === null, 'all-time view shows every workout without a prior-period comparison');

const histories = exerciseHistories(
  [{ workout: { id: 'w2', split: 'push', createdAt: older, endedAt: newer } }, { workout: { id: 'w1', split: 'push', createdAt: older, endedAt: older } }],
  new Map([['w1', [{ id: 'bench', sets: [{ number: 1, weight: 100, reps: 5 }] }]], ['w2', [{ id: 'bench', sets: [{ number: 1, weight: 110, reps: 5 }] }, { id: 'dip', sets: [{ number: 1, weight: 0, reps: 12 }] }]]]),
);
assert(histories.get('bench')?.length === 2 && histories.get('dip')?.length === 1, 'groups completed sets by exercise');
assert(progressFor(histories.get('bench')!, true).at(-1)?.bestSet.weight === 110, 'dates sets by workout end so the latest session sorts last');
