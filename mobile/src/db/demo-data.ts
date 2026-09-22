import type { Exercise } from './exercise-catalog';

export const demoWorkoutIdPrefix = 'demo-history-';

export type DemoWorkoutSet = {
  exerciseId: string;
  workoutId: string;
  setNumber: number;
  weight: number;
  reps: number;
  completedAt: Date;
};

// Expo replaces EXPO_PUBLIC_* values at bundle time. This intentionally defaults
// to off so production builds and ordinary development sessions stay empty.
export const isDemoDataEnabled = process.env.EXPO_PUBLIC_SEED_DEMO_DATA === 'true';

const demoExercises = [
  { id: 'free_exercise_db:Barbell_Squat', weight: 155, reps: 8 },
  { id: 'free_exercise_db:Barbell_Bench_Press_-_Medium_Grip', weight: 135, reps: 8 },
  { id: 'free_exercise_db:Pullups', weight: 0, reps: 7 },
  { id: 'free_exercise_db:Barbell_Deadlift', weight: 185, reps: 6 },
  { id: 'free_exercise_db:Standing_Military_Press', weight: 75, reps: 8 },
  { id: 'free_exercise_db:Barbell_Hip_Thrust', weight: 165, reps: 10 },
  { id: 'free_exercise_db:Dumbbell_Bench_Press', weight: 55, reps: 10 },
] as const;

const weeklySessionDays = [
  [0, 3], [1, 4, 6], [0, 2, 5], [1, 3, 6],
  [0, 3], [1, 4, 5], [0, 2, 6], [1, 3, 5],
  [0, 4], [1, 3, 6], [0, 2, 5], [1, 4, 6],
  [0, 3, 5], [1, 2, 6], [0, 3, 6], [1, 4, 5],
] as const;

function trainingProgress(week: number) {
  // Build strength for four weeks, pull back for a deload, then build again.
  if (week < 4) return week * 5;
  if (week === 4) return 5;
  if (week < 9) return 15 + (week - 5) * 5;
  if (week === 9) return 25;
  return 35 + (week - 10) * 5;
}

/** Creates a 16-week training block with uneven schedules and visible progression. */
export function buildDemoWorkoutSets(catalog: readonly Exercise[]): DemoWorkoutSet[] {
  const available = new Set(catalog.map((exercise) => exercise.id));
  const workouts: DemoWorkoutSet[] = [];
  const today = new Date();
  today.setHours(18, 0, 0, 0);

  for (let week = 0; week < weeklySessionDays.length; week += 1) {
    const weeklyProgress = trainingProgress(week);
    for (const [session, dayOffset] of weeklySessionDays[week].entries()) {
      const date = new Date(today);
      date.setDate(today.getDate() - ((15 - week) * 7 + (6 - dayOffset)));
      const workoutId = `${demoWorkoutIdPrefix}${week + 1}-${session + 1}`;
      // The lifter starts with dumbbell bench press, then spends the final
      // month on barbell bench. That recent single-exercise run is deliberate:
      // it gives the recommendation card a realistic rotation scenario.
      const pushPressExerciseIndex = week < 12 ? 6 : 1;
      const exerciseIndexes = session === 0 ? [0, pushPressExerciseIndex] : session === 1 ? [2, 3] : [4, 5];
      const setCount = week === 4 || week === 9 ? 2 : session === 2 && week >= 10 ? 4 : 3;

      for (const exerciseIndex of exerciseIndexes) {
        const exercise = demoExercises[exerciseIndex];
        if (!available.has(exercise.id)) continue;
        for (let setNumber = 1; setNumber <= setCount; setNumber += 1) {
          const topSet = setNumber === setCount;
          const bodyweightReps = exercise.weight === 0
            ? exercise.reps + Math.floor(week / 3) - (topSet && week % 3 === 2 ? 1 : 0)
            : exercise.reps - (topSet ? 1 : 0) + (week >= 10 && setNumber === 1 ? 1 : 0);
          workouts.push({
            exerciseId: exercise.id,
            workoutId,
            setNumber,
            // The final set is a modest top set; deload weeks are lighter and shorter.
            weight: exercise.weight === 0 ? 0 : exercise.weight + weeklyProgress + (topSet ? 5 : 0),
            reps: Math.max(5, bodyweightReps),
            completedAt: new Date(date.getTime() + setNumber * 12 * 60_000),
          });
        }
      }
    }
  }

  return workouts;
}
