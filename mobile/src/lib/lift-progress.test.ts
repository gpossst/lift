import { progressFor } from './lift-progress';

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
