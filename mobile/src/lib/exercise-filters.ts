import type { Exercise } from '@/db';

type ExerciseMetadata = { primaryMuscles: string[]; secondaryMuscles: string[]; force?: string };
const exerciseMetadata = new WeakMap<Exercise, ExerciseMetadata>();
export const staticFilter = '__static__';

export function matchesMuscle(exercise: Exercise, filters: string[] | null) { return !filters?.length || filters.some((filter) => getPrimaryMuscles(exercise).includes(filter)); }

export function matchesEquipment(exercise: Exercise, filters: string[] | null) {
  return !filters?.length || filters.some((filter) => filter === staticFilter ? isStaticExercise(exercise) : filter === exercise.equipment);
}

export function uniqueSorted(values: string[]) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }

export function formatLabel(value: string) { return value === staticFilter ? 'Static' : value.replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function getPrimaryMuscles(exercise: Exercise): string[] {
  return getExerciseMetadata(exercise).primaryMuscles;
}

export function isStaticExercise(exercise: Exercise) {
  return getExerciseMetadata(exercise).force === 'static';
}

export function getExerciseMetadata(exercise: Exercise): ExerciseMetadata {
  const cached = exerciseMetadata.get(exercise);
  if (cached) return cached;
  let parsed: Partial<ExerciseMetadata> = {};
  try { parsed = JSON.parse(exercise.detailsJson ?? '{}'); } catch { /* Catalog rows remain usable without details. */ }
  const metadata = {
    primaryMuscles: Array.isArray(parsed.primaryMuscles) ? parsed.primaryMuscles : [],
    secondaryMuscles: Array.isArray(parsed.secondaryMuscles) ? parsed.secondaryMuscles : [],
    force: typeof parsed.force === 'string' ? parsed.force : undefined,
  };
  exerciseMetadata.set(exercise, metadata);
  return metadata;
}

