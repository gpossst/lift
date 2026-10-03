import { groupWorkoutVisits } from './history-sections';
import type { WorkoutVisitSummary } from '@/db';

function assertEqual(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const visit = (id: string, createdAt: Date, endedAt: Date | null = null): WorkoutVisitSummary => ({
  workout: { id, split: 'push', createdAt, endedAt }, sets: 1, exercises: 1, volume: 0, reps: 1,
});

const sections = groupWorkoutVisits([
  visit('latest', new Date(2026, 0, 31), new Date(2026, 1, 1)),
  visit('february', new Date(2026, 1, 1)),
  visit('january', new Date(2026, 0, 31)),
  visit('last-year', new Date(2025, 0, 31)),
]);

assertEqual(sections.map(({ title, data }) => [title, data.map(({ workout }) => workout.id)]), [
  ['February 2026', ['latest', 'february']],
  ['January 2026', ['january']],
  ['January 2025', ['last-year']],
]);
assertEqual(groupWorkoutVisits([]), []);
