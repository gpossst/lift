import { recentPersonalRecords } from './home-notifications';

const date = (day: number) => new Date(`2026-09-${String(day).padStart(2, '0')}T12:00:00Z`);
const sets = [
  { workoutId: 'first', setNumber: 1, weight: 100, reps: 5, completedAt: date(1) },
  { workoutId: 'tie', setNumber: 1, weight: 100, reps: 6, completedAt: date(20) },
  { workoutId: 'new', setNumber: 1, weight: 120, reps: 5, completedAt: date(22) },
  { workoutId: 'new', setNumber: 2, weight: 115, reps: 5, completedAt: date(22) },
];
const records = recentPersonalRecords([{ exerciseId: 'bench', name: 'Bench', sets: [...sets].reverse() }], date(15).getTime());
if (records.length !== 1 || records[0].weight !== 120 || records[0].workoutId !== 'new') throw new Error('Only a recent, strictly higher weight after a baseline is a PR');
if (recentPersonalRecords([{ exerciseId: 'bench', name: 'Bench', sets }], date(23).getTime()).length) throw new Error('Old records expire');
