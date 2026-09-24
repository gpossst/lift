import { getWorkoutSplitDefinition, type WorkoutSplit } from '@/db';

export function workoutSplitLabel(split: WorkoutSplit) {
  return getWorkoutSplitDefinition(split)?.name ?? 'Custom';
}
