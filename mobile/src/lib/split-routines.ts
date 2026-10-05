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
