import type { WorkoutVisitSummary } from '@/db';
import { demoWorkoutIdPrefix } from '@/db/demo-data';
import type { WorkoutSplitDefinition } from '@/lib/exercise-recommendations';

export function splitsWithoutBaseline(splits: readonly WorkoutSplitDefinition[], visits: readonly WorkoutVisitSummary[], routines: Readonly<Record<string, readonly string[]>> = {}) {
  return splits.filter(({ id }) => !routines[id]?.length && !visits.some(({ workout, sets }) =>
    workout.split === id && workout.endedAt !== null && sets > 0 && !workout.id.startsWith(demoWorkoutIdPrefix)));
}

export function routinePromptIsSnoozed(value: string | null, now = Date.now()) {
  const dismissedAt = Number(value);
  return Number.isFinite(dismissedAt) && dismissedAt > 0 && now - dismissedAt < 7 * 86_400_000;
}

export type SplitPresetId = 'ppl' | 'upper-lower' | 'full-body' | 'body-part';
type SplitPreset = { id: SplitPresetId; name: string; detail: string; splits: readonly { name: string; muscles: readonly string[] }[] };
/** Starting rotations. PPL uses the built-in splits, so it has none to create. */
export const splitPresets: readonly SplitPreset[] = [
  { id: 'ppl', name: 'Push Pull Legs', detail: 'Pressing, pulling, and leg days.', splits: [] },
  { id: 'upper-lower', name: 'Upper / Lower', detail: 'Alternate upper and lower body.', splits: [
    { name: 'Upper', muscles: ['chest', 'shoulders', 'triceps', 'lats', 'middle back', 'traps', 'biceps', 'forearms', 'abdominals'] },
    { name: 'Lower', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors', 'lower back', 'abdominals'] },
  ] },
  { id: 'full-body', name: 'Full body', detail: 'Train everything each session.', splits: [
    { name: 'Full Body', muscles: ['chest', 'shoulders', 'triceps', 'lats', 'middle back', 'biceps', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'lower back', 'abdominals'] },
  ] },
  { id: 'body-part', name: 'Body part', detail: 'One muscle group per day.', splits: [
    { name: 'Chest', muscles: ['chest', 'abdominals'] },
    { name: 'Back', muscles: ['lats', 'middle back', 'lower back', 'traps'] },
    { name: 'Shoulders', muscles: ['shoulders', 'traps', 'abdominals'] },
    { name: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
    { name: 'Legs', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'] },
  ] },
];
