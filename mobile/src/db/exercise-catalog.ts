import freeExerciseDb from '../../data/free-exercise-db/exercises.json';

export type Exercise = {
  id: string;
  name: string;
  area: string;
  mark: string;
  color: string;
  equipment: string;
  isFeatured: number;
  detailsJson: string | null;
};

export type TrainingSplit = 'PUSH' | 'PULL' | 'LEGS';

export function exerciseRequiresWeight(exercise: Pick<Exercise, 'equipment'>) {
  return exercise.equipment !== 'body only';
}

export function workoutSplitForExercise(exercise: Pick<Exercise, 'area' | 'detailsJson'>): TrainingSplit | null {
  let primaryMuscles: string[] = [];
  try { primaryMuscles = JSON.parse(exercise.detailsJson ?? '{}').primaryMuscles ?? []; } catch { /* Older catalog rows can still use their area. */ }
  if (exercise.area === 'LEGS') return 'LEGS';
  if (exercise.area === 'CHEST' || exercise.area === 'SHOULDERS' || primaryMuscles.includes('triceps')) return 'PUSH';
  if (exercise.area === 'BACK' || primaryMuscles.includes('biceps') || primaryMuscles.includes('forearms')) return 'PULL';
  return null;
}

const areaByMuscle: Record<string, string> = {
  abdominals: 'CORE', abductors: 'LEGS', adductors: 'LEGS', biceps: 'ARMS', calves: 'LEGS', chest: 'CHEST',
  forearms: 'ARMS', glutes: 'LEGS', hamstrings: 'LEGS', lats: 'BACK', 'lower back': 'BACK', 'middle back': 'BACK',
  neck: 'NECK', quadriceps: 'LEGS', shoulders: 'SHOULDERS', traps: 'BACK', triceps: 'ARMS',
};
const colorByArea: Record<string, string> = {
  LEGS: '#FFCC4A', CHEST: '#A7E7CB', BACK: '#BFC8FF', SHOULDERS: '#FFC5AC', ARMS: '#D6C8FF', CORE: '#FFB4C3',
  NECK: '#D6C8FF', 'FULL BODY': '#BFC8FF',
};
const featuredSourceIds = new Set([
  'Barbell_Squat', 'Barbell_Bench_Press_-_Medium_Grip', 'Barbell_Deadlift',
  'Standing_Military_Press', 'Pullups', 'Barbell_Hip_Thrust',
]);

function markFor(name: string) {
  return name.split(/[^A-Za-z0-9]+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase() || 'EX';
}

const importedExercises: Exercise[] = freeExerciseDb.map((exercise) => {
  const area = areaByMuscle[exercise.primaryMuscles[0]] ?? 'FULL BODY';
  return {
    id: `free_exercise_db:${exercise.id}`,
    name: exercise.name,
    area,
    mark: markFor(exercise.name),
    color: colorByArea[area],
    // Source equipment values are lower-case, while missing values use this
    // fallback. Keep them in one canonical form so they do not create two
    // visually identical "Other" filters.
    equipment: (exercise.equipment ?? 'other').trim().toLowerCase(),
    isFeatured: featuredSourceIds.has(exercise.id) ? 1 : 0,
    detailsJson: JSON.stringify(exercise),
  };
});

export const exerciseCatalog: readonly Exercise[] = importedExercises;
