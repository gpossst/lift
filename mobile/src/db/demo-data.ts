import type { Exercise } from './exercise-catalog';
import type { FriendComment, FriendPersonalRecord } from '@/lib/friends';
import { friendWorkoutKey } from '@/lib/friend-record-groups';

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

export const demoFriendIdPrefix = 'demo-friend-';

export function buildDemoFriendRecords(now = Date.now()): FriendPersonalRecord[] {
  const seconds = Math.floor(now / 1000);
  return [
    { id: `${demoFriendIdPrefix}maya`, displayName: 'Maya Chen', imageUrl: null, workoutId: 'demo-maya-1', setNumber: 3, exerciseId: 'free_exercise_db:Barbell_Squat', weight: 185, reps: 5, completedAt: seconds - 2 * 60 * 60 - 20 * 60, liked: false, likeCount: 5, commentCount: 2 },
    { id: `${demoFriendIdPrefix}maya`, displayName: 'Maya Chen', imageUrl: null, workoutId: 'demo-maya-1', setNumber: 4, exerciseId: 'free_exercise_db:Barbell_Bench_Press_-_Medium_Grip', weight: 145, reps: 6, completedAt: seconds - 2 * 60 * 60 - 10 * 60, liked: false, likeCount: 5, commentCount: 2 },
    { id: `${demoFriendIdPrefix}maya`, displayName: 'Maya Chen', imageUrl: null, workoutId: 'demo-maya-1', setNumber: 3, exerciseId: 'free_exercise_db:Standing_Military_Press', weight: 95, reps: 5, completedAt: seconds - 2 * 60 * 60, liked: false, likeCount: 5, commentCount: 2 },
    { id: `${demoFriendIdPrefix}jordan`, displayName: 'Jordan Lee', imageUrl: null, workoutId: 'demo-jordan-1', setNumber: 4, exerciseId: 'free_exercise_db:Barbell_Deadlift', weight: 275, reps: 3, completedAt: seconds - 26 * 60 * 60 - 10 * 60, liked: false, likeCount: 9, commentCount: 1 },
    { id: `${demoFriendIdPrefix}jordan`, displayName: 'Jordan Lee', imageUrl: null, workoutId: 'demo-jordan-1', setNumber: 3, exerciseId: 'free_exercise_db:Pullups', weight: 25, reps: 7, completedAt: seconds - 26 * 60 * 60, liked: false, likeCount: 9, commentCount: 1 },
    { id: `${demoFriendIdPrefix}alex`, displayName: 'Alex Rivera', imageUrl: null, workoutId: 'demo-alex-1', setNumber: 3, exerciseId: 'free_exercise_db:Barbell_Bench_Press_-_Medium_Grip', weight: 155, reps: 6, completedAt: seconds - 3 * 24 * 60 * 60, liked: false, likeCount: 2, commentCount: 0 },
  ];
}

export function buildDemoFriendComments(now = Date.now()): Record<string, FriendComment[]> {
  const seconds = Math.floor(now / 1000);
  return {
    [friendWorkoutKey({ id: `${demoFriendIdPrefix}maya`, workoutId: 'demo-maya-1' })]: [
      { id: 'demo-comment-1', displayName: 'Jordan Lee', imageUrl: null, body: 'Strong set! 185 is huge 👏', createdAt: seconds - 90 * 60, mine: false },
      { id: 'demo-comment-2', displayName: 'Alex Rivera', imageUrl: null, body: 'You made that look easy.', createdAt: seconds - 55 * 60, mine: false },
    ],
    [friendWorkoutKey({ id: `${demoFriendIdPrefix}jordan`, workoutId: 'demo-jordan-1' })]: [
      { id: 'demo-comment-3', displayName: 'Maya Chen', imageUrl: null, body: 'New deadlift PR! Let’s go 🔥', createdAt: seconds - 22 * 60 * 60, mine: false },
    ],
  };
}

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
  [0, 2, 4, 6], [1, 4, 6], [0, 2, 5], [1, 3, 6],
  [0, 3, 6], [1, 4, 5], [0, 2, 6], [1, 3, 5],
  [0, 2, 4, 6], [1, 3, 6], [0, 2, 5], [1, 4, 6],
  [0, 3, 5], [1, 2, 6], [0, 3, 6], [1, 4, 5],
] as const;

function trainingProgress(week: number): number {
  if (week < 36) return Math.floor(week / 3) * 2.5 - (week % 8 === 7 ? 5 : 0);
  return 30 + recentTrainingProgress(week - 36);
}

function recentTrainingProgress(week: number) {
  // Build strength for four weeks, pull back for a deload, then build again.
  if (week < 4) return week * 5;
  if (week === 4) return 5;
  if (week < 9) return 15 + (week - 5) * 5;
  if (week === 9) return 25;
  return 35 + (week - 10) * 5;
}

/** Creates a 52-week training block with uneven schedules and visible progression. */
export function buildDemoWorkoutSets(catalog: readonly Exercise[], now = new Date()): DemoWorkoutSet[] {
  const available = new Set(catalog.map((exercise) => exercise.id));
  const workouts: DemoWorkoutSet[] = [];
  const today = new Date(now);
  today.setDate(today.getDate() - 1);
  today.setHours(18, 0, 0, 0);

  for (let week = 0; week < 52; week += 1) {
    const weeklyProgress = trainingProgress(week);
    for (const [session, dayOffset] of weeklySessionDays[week % weeklySessionDays.length].entries()) {
      const date = new Date(today);
      date.setDate(today.getDate() - ((51 - week) * 7 + (6 - dayOffset)));
      const workoutId = `${demoWorkoutIdPrefix}${week + 1}-${session + 1}`;
      // The lifter starts with dumbbell bench press, then spends the final
      // month on barbell bench. That recent single-exercise run is deliberate:
      // it gives the recommendation card a realistic rotation scenario.
      const pushPressExerciseIndex = week < 48 ? 6 : 1;
      const exerciseIndexes = session === 0 ? [0, pushPressExerciseIndex] : session === 1 ? [2, 3] : session === 2 ? [4, 5] : [0, pushPressExerciseIndex];
      const setCount = week % 8 === 7 || week === 40 || week === 45 ? 2 : session === 2 && week >= 10 ? 4 : 3;

      for (const exerciseIndex of exerciseIndexes) {
        const exercise = demoExercises[exerciseIndex];
        if (!available.has(exercise.id)) continue;
        for (let setNumber = 1; setNumber <= setCount; setNumber += 1) {
          const topSet = setNumber === setCount;
          const bodyweightReps = exercise.weight === 0
            ? exercise.reps + Math.floor(week / 10) - (topSet && week % 3 === 2 ? 1 : 0)
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
