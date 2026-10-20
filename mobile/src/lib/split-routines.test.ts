import { defaultWorkoutSplits } from './exercise-recommendations';
import { splitsWithoutBaseline, routinePromptIsSnoozed, splitPresets } from './split-routines';
import type { WorkoutVisitSummary } from '@/db';

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const now = new Date();
function visit(id: string, split: 'push' | 'pull' | 'legs', sets: number, endedAt: Date | null = now): WorkoutVisitSummary {
  return { workout: { id, split, createdAt: now, endedAt }, sets, exercises: 1, volume: 100, reps: 10 };
}
equal(splitsWithoutBaseline(defaultWorkoutSplits, [visit('empty', 'push', 0), visit('active', 'pull', 3, null), visit('demo-history-legs', 'legs', 3)]).map(({ id }) => id), ['push', 'pull', 'legs']);
equal(splitsWithoutBaseline(defaultWorkoutSplits, [visit('finished', 'push', 3)], { pull: ['row'] }).map(({ id }) => id), ['legs']);
equal(splitsWithoutBaseline([{ id: 'custom:upper', name: 'Upper', muscles: ['chest'] }], [], { 'custom:upper': ['bench'] }), []);
equal(routinePromptIsSnoozed(null, now.getTime()), false);
equal(routinePromptIsSnoozed('garbage', now.getTime()), false);
equal(routinePromptIsSnoozed(String(now.getTime()), now.getTime()), true);
equal(routinePromptIsSnoozed(String(now.getTime() - 7 * 86_400_000), now.getTime()), false);
// Presets must pass saveCustomSplit's validation (catalog muscles, 1–12 each).
const muscleNames = Object.fromEntries(['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps'].map((muscle) => [muscle, muscle]));
for (const preset of splitPresets) for (const split of preset.splits) {
  if (!split.muscles.length || split.muscles.length > 12 || split.muscles.some((muscle) => !Object.hasOwn(muscleNames, muscle))) throw new Error(`Invalid preset split ${preset.id}/${split.name}`);
}
console.log('Split routine baseline and snooze checks passed.');
