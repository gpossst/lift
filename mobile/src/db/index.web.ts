// The product database is Expo SQLite + Drizzle on iOS/Android. Expo SQLite's web
// driver requires cross-origin isolation, which local Expo dev servers do not add.
// This tiny browser adapter keeps the preview usable while the native app uses Drizzle.
import { exerciseCatalog, type Exercise, workoutSplitForExercise } from './exercise-catalog';
import { buildDemoWorkoutSets, demoWorkoutIdPrefix, isDemoDataEnabled } from './demo-data';
import { defaultWorkoutSplits, getEffectiveExhaustion, getExerciseRecommendations as rankExerciseRecommendations, getRecommendedWorkoutSplit as recommendWorkoutSplit, type ExerciseRecommendation, type MuscleExhaustionRating, type RecommendationContext, type RecommendationFeedback, type RecommendationFeedbackAction } from '@/lib/exercise-recommendations';

export type { RecommendationContext, RecommendationFeedback, RecommendationFeedbackAction } from '@/lib/exercise-recommendations';

type StoredSet = { exerciseId: string; workoutId: string; setNumber: number; weight: number; reps: number; completedAt: Date };
type StoredWorkout = { id: string; split: WorkoutSplit; createdAt: Date; endedAt: Date | null };
export type WorkoutHistoryPoint = { workoutId: string; setNumber: number; weight: number; reps: number; completedAt: Date };
export type WorkoutStats = { visits: number; sets: number; volume: number };
export type WorkoutActivity = { date: string; volume: number; sets: number; visits: number };
export type WorkoutSplitTrend = { split: 'ALL' | 'PUSH' | 'PULL' | 'LEGS'; points: { weekStart: string; volume: number }[] };
export type WorkoutSplit = 'push' | 'pull' | 'legs' | `custom:${string}`;
export type CustomSplit = { id: `custom:${string}`; name: string; muscles: string[] };
export type Workout = StoredWorkout;
export type WorkoutVisitSummary = { workout: Workout; sets: number; exercises: number; volume: number; reps: number };
export type WorkoutVisitExercise = { id: string; name: string; sets: number; volume: number };
export type WorkoutVisitExerciseDetail = { id: string; name: string; sets: { number: number; weight: number; reps: number }[] };
export type WorkoutAchievement = { exerciseId: string; name: string; level: 'silver' | 'gold'; metric: 'weight' | 'reps'; weight: number; reps?: number };
export type WorkoutProgressPoint = { workoutId: string; volume: number; completedAt: Date };
export type WorkoutMuscle = { id: string; name: string; area: string };
export type WorkoutMuscleRating = WorkoutMuscle & { exhaustion: number };
export type CloudSyncTombstone = { entity: 'workout' | 'set' | 'rating' | 'split'; key: string; deletedAt: number };
export type CloudSyncEntity = 'workout' | 'set' | 'rating' | 'feedback' | 'split';
export type CloudSyncChange = { entity: CloudSyncEntity; key: string; operation: 'upsert' | 'delete'; baseRevision: number; record?: Record<string, unknown> };
export type CloudSyncRemoteChange = Omit<CloudSyncChange, 'baseRevision'> & { revision: number };
export type CloudSyncBatch = { batchId: string; changes: CloudSyncChange[] };
const key = 'lift-preview-sets';
const workoutsKey = 'lift-preview-workouts';
const ratingsKey = 'lift-preview-muscle-ratings';
const recommendationFeedbackKey = 'lift-preview-recommendation-feedback';
const customSplitsKey = 'lift-preview-custom-splits';
const trackingVersionKey = 'lift-preview-tracking-schema-version';
const trackingVersion = '3';
const workoutTimeoutMs = 2 * 60 * 60 * 1_000;
const activeUserKey = 'lift-active-user';
const legacyActiveUserKey = 'lift-active-clerk-user';
const pendingSyncKey = 'lift-cloud-sync-pending';
const tombstonesKey = 'lift-cloud-sync-tombstones';
const outboxKey = 'lift-cloud-sync-outbox-v2';
const versionsKey = 'lift-cloud-sync-versions-v2';
const cursorKey = 'lift-cloud-sync-cursor-v2';
const storage = typeof globalThis.localStorage?.getItem === 'function'
  && typeof globalThis.localStorage?.setItem === 'function'
  && typeof globalThis.localStorage?.removeItem === 'function'
  ? globalThis.localStorage
  : null;

// Keep the browser preview consistent with the native v3 reset: catalog and set
// data are intentionally discarded once so only source-dataset exercises remain.
if (storage?.getItem(trackingVersionKey) !== trackingVersion) {
  storage?.removeItem(key);
  storage?.setItem(trackingVersionKey, trackingVersion);
}

const read = (): StoredSet[] => JSON.parse(storage?.getItem(key) ?? '[]').map((set: StoredSet) => ({ ...set, completedAt: new Date(set.completedAt) }));
const write = (sets: StoredSet[]) => storage?.setItem(key, JSON.stringify(sets));
const readWorkouts = (): StoredWorkout[] => JSON.parse(storage?.getItem(workoutsKey) ?? '[]').map((workout: StoredWorkout) => ({ ...workout, createdAt: new Date(workout.createdAt), endedAt: workout.endedAt ? new Date(workout.endedAt) : null }));
const writeWorkouts = (workouts: StoredWorkout[]) => storage?.setItem(workoutsKey, JSON.stringify(workouts));
const readRatings = (): Record<string, Record<string, number>> => JSON.parse(storage?.getItem(ratingsKey) ?? '{}');
const writeRatings = (ratings: Record<string, Record<string, number>>) => storage?.setItem(ratingsKey, JSON.stringify(ratings));
const readRecommendationFeedback = (): RecommendationFeedback[] => JSON.parse(storage?.getItem(recommendationFeedbackKey) ?? '[]').map((item: RecommendationFeedback) => ({ ...item, createdAt: new Date(item.createdAt) }));
const writeRecommendationFeedback = (feedback: RecommendationFeedback[]) => storage?.setItem(recommendationFeedbackKey, JSON.stringify(feedback));
const readCustomSplits = (): CustomSplit[] => JSON.parse(storage?.getItem(customSplitsKey) ?? '[]');
const writeCustomSplits = (splits: CustomSplit[]) => storage?.setItem(customSplitsKey, JSON.stringify(splits));

const builtinSplits = defaultWorkoutSplits;
const customSplitIdPattern = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createSplitId = () => `custom:${'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (digit) => {
  const random = Math.random() * 16 | 0;
  return (digit === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
})}` as CustomSplit['id'];

export function getCustomSplits(): CustomSplit[] { return readCustomSplits().sort((a, b) => a.name.localeCompare(b.name)); }
export function saveCustomSplit(input: { id?: CustomSplit['id']; name: string; muscles: string[] }): CustomSplit {
  const name = input.name.trim();
  const muscles = [...new Set(input.muscles.map((muscle) => muscle.trim()).filter(Boolean))];
  if (!name || name.length > 40 || muscles.length < 1 || muscles.length > 12 || muscles.some((muscle) => !Object.hasOwn(muscleNames, muscle))) throw new Error('Use a name up to 40 characters and choose 1–12 catalog muscles.');
  const split: CustomSplit = { id: input.id ?? createSplitId(), name, muscles };
  if (!customSplitIdPattern.test(split.id)) throw new Error('Custom split IDs must be UUIDs prefixed with custom:.');
  const splits = readCustomSplits(); const index = splits.findIndex((item) => item.id === split.id);
  if (index < 0) splits.push(split); else splits[index] = split;
  writeCustomSplits(splits); markCloudSyncDirty('split', split.id);
  return split;
}
export function deleteCustomSplit(id: CustomSplit['id']): void {
  const splits = readCustomSplits(); const next = splits.filter((item) => item.id !== id);
  if (next.length === splits.length) return;
  writeCustomSplits(next); queueCloudSyncTombstone('split', id);
}
export function getWorkoutSplitDefinition(split: WorkoutSplit) {
  const builtin = builtinSplits.find((item) => item.id === split);
  return builtin ? { ...builtin, muscles: [...builtin.muscles] } : getCustomSplits().find((item) => item.id === split) ?? null;
}

function syncDemoWorkoutData() {
  const userSets = read().filter((set) => !set.workoutId.startsWith(demoWorkoutIdPrefix));
  if (!isDemoDataEnabled) {
    write(userSets);
    return;
  }
  write([...userSets, ...buildDemoWorkoutSets(exerciseCatalog)]);
}

syncDemoWorkoutData();

export const db: any = {
  select: () => ({ from: () => ({ where: () => Promise.resolve([{ lastSet: 0 }]) }) }),
  insert: () => ({ values: (set: StoredSet) => { write([...read(), set]); markCloudSyncDirty('set', [set.workoutId, set.exerciseId, set.setNumber].join('\u001F')); return Promise.resolve(); } }),
};

export function getExercises(): Exercise[] { return [...exerciseCatalog].sort((a, b) => a.name.localeCompare(b.name)); }
export function getFeaturedExercises(): Exercise[] { return getExercises().filter((exercise) => exercise.isFeatured === 1); }

export function getRecommendedWorkoutSplit(now = new Date()): WorkoutSplit {
  const ratings = readRatings();
  const muscleRatings: MuscleExhaustionRating[] = [];
  const history = getWorkoutVisits().map((visit) => {
    const completedAt = visit.workout.endedAt ?? visit.workout.createdAt;
    muscleRatings.push(...Object.entries(ratings[visit.workout.id] ?? {}).map(([muscle, exhaustion]) => ({ workoutId: visit.workout.id, split: visit.workout.split, muscle, exhaustion, completedAt })));
    return {
      split: visit.workout.split,
      completedAt,
      sets: visit.sets,
    };
  });
  const custom = getCustomSplits();
  const latestSplit = history[0]?.split;
  const definitions = custom.some((item) => item.id === latestSplit) ? custom : builtinSplits;
  return recommendWorkoutSplit(history, now, muscleRatings, definitions) as WorkoutSplit;
}

export function createWorkout(split: WorkoutSplit): Workout {
  const workout = { id: `workout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, split, createdAt: new Date(), endedAt: null };
  writeWorkouts([...readWorkouts(), workout]);
  markCloudSyncDirty('workout', workout.id);
  return workout;
}

export function saveWorkoutSet(set: StoredSet) {
  write([...read(), set]);
  markCloudSyncDirty('set', [set.workoutId, set.exerciseId, set.setNumber].join('\u001F'));
}

/** Marks workouts that can no longer be resumed as finished at their timeout. */
export function closeExpiredWorkouts(now = new Date()): number {
  const workouts = readWorkouts();
  let closed = 0;
  const updated = workouts.map((workout) => {
    if (workout.endedAt || workout.createdAt.getTime() + workoutTimeoutMs > now.getTime()) return workout;
    closed += 1;
    return { ...workout, endedAt: new Date(workout.createdAt.getTime() + workoutTimeoutMs) };
  });
  if (closed) { writeWorkouts(updated); for (const workout of updated.filter((item, index) => item !== workouts[index])) markCloudSyncDirty('workout', workout.id); }
  return closed;
}

/** Returns the most recently started workout that has not been ended yet. */
export function getActiveWorkout(): Workout | null {
  closeExpiredWorkouts();
  return readWorkouts()
    .filter((workout) => !workout.endedAt)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

export function endWorkout(workoutId: string): Workout | null {
  const workouts = readWorkouts();
  const index = workouts.findIndex((workout) => workout.id === workoutId);
  if (index < 0) return null;
  const workout = { ...workouts[index], endedAt: workouts[index].endedAt ?? new Date() };
  workouts[index] = workout;
  writeWorkouts(workouts);
  markCloudSyncDirty('workout', workoutId);
  return workout;
}

export function getWorkoutVisitSummary(workoutId: string): WorkoutVisitSummary | null {
  const workout = readWorkouts().find((item) => item.id === workoutId);
  if (!workout) return null;
  const sets = read().filter((set) => set.workoutId === workoutId);
  return { workout, sets: sets.length, exercises: new Set(sets.map((set) => set.exerciseId)).size, volume: sets.reduce((total, set) => total + set.weight * set.reps, 0), reps: sets.reduce((total, set) => total + set.reps, 0) };
}

export function getWorkoutVisitExercises(workoutId: string): WorkoutVisitExercise[] {
  const names = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise.name]));
  const totals = new Map<string, WorkoutVisitExercise>();
  for (const set of read().filter((item) => item.workoutId === workoutId)) {
    const item = totals.get(set.exerciseId) ?? { id: set.exerciseId, name: names.get(set.exerciseId) ?? 'Exercise', sets: 0, volume: 0 };
    item.sets += 1;
    item.volume += set.weight * set.reps;
    totals.set(set.exerciseId, item);
  }
  return [...totals.values()].sort((a, b) => b.volume - a.volume);
}

/** Completed workouts with at least one logged set, newest first. */
export function getWorkoutVisits(): WorkoutVisitSummary[] {
  return readWorkouts()
    .filter((workout) => read().some((set) => set.workoutId === workout.id))
    .map((workout) => getWorkoutVisitSummary(workout.id)!)
    .sort((a, b) => (b.workout.endedAt ?? b.workout.createdAt).getTime() - (a.workout.endedAt ?? a.workout.createdAt).getTime());
}

export function getWorkoutVisitExerciseDetails(workoutId: string): WorkoutVisitExerciseDetail[] {
  const names = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise.name]));
  const exercises = new Map<string, WorkoutVisitExerciseDetail>();
  for (const set of read().filter((item) => item.workoutId === workoutId).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId) || a.setNumber - b.setNumber)) {
    const exercise = exercises.get(set.exerciseId) ?? { id: set.exerciseId, name: names.get(set.exerciseId) ?? 'Exercise', sets: [] };
    exercise.sets.push({ number: set.setNumber, weight: set.weight, reps: set.reps });
    exercises.set(set.exerciseId, exercise);
  }
  return [...exercises.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getWorkoutAchievements(workoutId: string): WorkoutAchievement[] {
  const names = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise.name]));
  const currentExercises = new Set(read().filter((set) => set.workoutId === workoutId).map((set) => set.exerciseId));
  return [...currentExercises].flatMap<WorkoutAchievement>((exerciseId) => {
    const history = read().filter((set) => set.exerciseId === exerciseId);
    const current = history.filter((set) => set.workoutId === workoutId);
    const previous = history.filter((set) => set.workoutId !== workoutId);
    if (!previous.length) return [];
    const maxCurrentWeight = Math.max(...current.map((set) => set.weight));
    const maxPreviousWeight = Math.max(...previous.map((set) => set.weight));
    if (maxCurrentWeight > 0 && maxCurrentWeight >= maxPreviousWeight) return [{ exerciseId, name: names.get(exerciseId) ?? 'Exercise', level: maxCurrentWeight > maxPreviousWeight ? 'gold' as const : 'silver' as const, metric: 'weight' as const, weight: maxCurrentWeight }];
    const repResult = current.flatMap((set) => {
      const priorReps = previous.filter((item) => item.weight === set.weight).map((item) => item.reps);
      if (!priorReps.length) return [];
      const bestPriorReps = Math.max(...priorReps);
      return set.reps >= bestPriorReps ? [{ level: set.reps > bestPriorReps ? 'gold' as const : 'silver' as const, weight: set.weight, reps: set.reps }] : [];
    }).sort((a, b) => (a.level === 'gold' ? -1 : 1) - (b.level === 'gold' ? -1 : 1) || b.reps - a.reps)[0];
    return repResult ? [{ exerciseId, name: names.get(exerciseId) ?? 'Exercise', ...repResult, metric: 'reps' as const }] : [];
  }).sort((a, b) => (a.level === 'gold' ? -1 : 1) - (b.level === 'gold' ? -1 : 1));
}

export function getWorkoutProgress(workoutId: string): WorkoutProgressPoint[] {
  const summary = getWorkoutVisitSummary(workoutId);
  if (!summary) return [];
  const volumes = new Map<string, number>();
  for (const set of read()) volumes.set(set.workoutId, (volumes.get(set.workoutId) ?? 0) + set.weight * set.reps);
  return readWorkouts()
    .filter((workout) => workout.split === summary.workout.split && volumes.has(workout.id))
    .map((workout) => ({ workoutId: workout.id, volume: volumes.get(workout.id) ?? 0, completedAt: workout.endedAt ?? workout.createdAt }))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
    .slice(-6);
}

const muscleNames: Record<string, string> = {
  abdominals: 'Abs', abductors: 'Abductors', adductors: 'Adductors', biceps: 'Biceps', calves: 'Calves', chest: 'Chest',
  forearms: 'Forearms', glutes: 'Glutes', hamstrings: 'Hamstrings', lats: 'Lats', 'lower back': 'Lower back',
  'middle back': 'Mid back', neck: 'Neck', quadriceps: 'Quads', shoulders: 'Shoulders', traps: 'Traps', triceps: 'Triceps',
};

export function getWorkoutMuscles(workoutId: string): WorkoutMuscle[] {
  const exerciseById = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise]));
  const muscles = new Map<string, WorkoutMuscle>();
  for (const set of read().filter((item) => item.workoutId === workoutId)) {
    const exercise = exerciseById.get(set.exerciseId);
    if (!exercise) continue;
    let primary: string[] = [];
    try { primary = JSON.parse(exercise.detailsJson ?? '{}').primaryMuscles ?? []; } catch { /* fall back to area */ }
    for (const muscle of primary) muscles.set(muscle, { id: muscle, name: muscleNames[muscle] ?? muscle, area: exercise.area });
    if (!primary.length) {
      const id = exercise.area.toLowerCase();
      muscles.set(id, { id, name: exercise.area.replace(/\b\w/g, (letter) => letter.toUpperCase()), area: exercise.area });
    }
  }
  return [...muscles.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function saveWorkoutMuscleRatings(workoutId: string, ratings: Record<string, number>) {
  writeRatings({ ...readRatings(), [workoutId]: ratings });
  for (const muscle of Object.keys(ratings)) markCloudSyncDirty('rating', [workoutId, muscle].join('\u001F'));
}

export function getWorkoutMuscleRatings(workoutId: string): WorkoutMuscleRating[] {
  const ratings = readRatings()[workoutId] ?? {};
  return getWorkoutMuscles(workoutId).flatMap((muscle) => ratings[muscle.id] === undefined ? [] : [{ ...muscle, exhaustion: ratings[muscle.id] }]);
}

export function getExerciseRecommendations(workoutId: string, split: WorkoutSplit, limit?: number, context?: RecommendationContext): ExerciseRecommendation[] {
  const workouts = new Map(readWorkouts().map((workout) => [workout.id, workout]));
  const muscleRatings = Object.entries(readRatings()).flatMap(([ratedWorkoutId, ratings]) => {
    const workout = workouts.get(ratedWorkoutId);
    if (!workout) return [];
    const completedAt = workout.endedAt ?? workout.createdAt;
    return Object.entries(ratings).map(([muscle, exhaustion]) => ({ workoutId: ratedWorkoutId, split: workout.split, muscle, exhaustion, completedAt }));
  }).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.workoutId.localeCompare(b.workoutId) || a.muscle.localeCompare(b.muscle));
  const completedSets = read().filter((set) => set.workoutId === workoutId || workouts.get(set.workoutId)?.endedAt || !workouts.has(set.workoutId))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.workoutId.localeCompare(b.workoutId) || a.setNumber - b.setNumber);
  const feedback = readRecommendationFeedback().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.workoutId.localeCompare(b.workoutId) || a.exerciseId.localeCompare(b.exerciseId));
  return rankExerciseRecommendations(getExercises(), completedSets, muscleRatings, workoutId, split, limit, undefined, context, feedback, getWorkoutSplitDefinition(split) ?? undefined);
}

export function recordRecommendationFeedback(
  workoutId: string, exerciseId: string, action: RecommendationFeedbackAction, rank?: number,
): void {
  const feedback = readRecommendationFeedback();
  if (feedback.some((item) => item.workoutId === workoutId && item.exerciseId === exerciseId && item.action === action)) return;
  writeRecommendationFeedback([...feedback, { workoutId, exerciseId, action, rank, createdAt: new Date() }]);
  markCloudSyncDirty('feedback', [workoutId, exerciseId, action].join('\u001F'));
}

export function getNextSetNumberForWorkout(exerciseId: string, workoutId: string) {
  const lastSet = read()
    .filter((set) => set.exerciseId === exerciseId)
    .filter((set) => set.workoutId === workoutId)
    .reduce((highest, set) => Math.max(highest, set.setNumber), 0);

  return lastSet + 1;
}

export function getWorkoutStats(): WorkoutStats {
  const sets = read();
  return {
    visits: new Set(sets.map((set) => set.workoutId)).size,
    sets: sets.length,
    volume: sets.reduce((total, set) => total + set.weight * set.reps, 0),
  };
}

export function getWorkoutActivity(days = 28): WorkoutActivity[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const results = new Map<string, WorkoutActivity>();
  for (let index = 0; index < days; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const date = day.toISOString().slice(0, 10);
    results.set(date, { date, volume: 0, sets: 0, visits: 0 });
  }
  const visitDays = new Set<string>();
  for (const set of read()) {
    const date = new Date(set.completedAt).toISOString().slice(0, 10);
    const item = results.get(date);
    if (!item) continue;
    item.volume += set.weight * set.reps;
    item.sets += 1;
    const visitKey = `${date}:${set.workoutId}`;
    if (!visitDays.has(visitKey)) {
      item.visits += 1;
      visitDays.add(visitKey);
    }
  }
  return [...results.values()];
}

export function getWorkoutSplitTrends(weeks = 8): WorkoutSplitTrend[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  const exerciseById = new Map(exerciseCatalog.map((exercise) => [exercise.id, exercise]));
  const trends = new Map<WorkoutSplitTrend['split'], WorkoutSplitTrend>();
  const emptyPoints = () => Array.from({ length: weeks }, (_, index) => {
    const week = new Date(start);
    week.setDate(start.getDate() + index * 7);
    return { weekStart: week.toISOString().slice(0, 10), volume: 0 };
  });
  trends.set('ALL', { split: 'ALL', points: emptyPoints() });
  const workoutsBySplitWeek = new Map<WorkoutSplitTrend['split'], Set<string>[]>();
  for (const set of read()) {
    const index = Math.floor((new Date(set.completedAt).getTime() - start.getTime()) / 86_400_000 / 7);
    if (index < 0 || index >= weeks) continue;
    trends.get('ALL')!.points[index].volume += set.weight * set.reps;
    const exercise = exerciseById.get(set.exerciseId);
    const split = exercise ? workoutSplitForExercise(exercise) : null;
    if (!split) continue;
    if (!trends.has(split)) {
      trends.set(split, { split, points: emptyPoints() });
      workoutsBySplitWeek.set(split, Array.from({ length: weeks }, () => new Set<string>()));
    }
    trends.get(split)!.points[index].volume += set.weight * set.reps;
    workoutsBySplitWeek.get(split)![index].add(set.workoutId);
  }
  const order: WorkoutSplitTrend['split'][] = ['PUSH', 'PULL', 'LEGS', 'ALL'];
  return order.filter((split) => trends.has(split)).map((split) => {
    const trend = trends.get(split)!;
    if (split !== 'ALL') trend.points.forEach((point, index) => { point.volume /= workoutsBySplitWeek.get(split)![index].size || 1; });
    return trend;
  });
}

export function getWorkoutHistory(exerciseId: string) {
  return read()
    .filter((set) => set.exerciseId === exerciseId)
    .sort((a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime())
    .map((set) => ({ ...set, completedAt: new Date(set.completedAt) }));
}

export function getRecentExerciseExhaustion(exerciseId: string, excludingWorkoutId: string, now = new Date()): number | undefined {
  const exercise = exerciseCatalog.find((item) => item.id === exerciseId);
  let muscles: string[] = [];
  try { muscles = JSON.parse(exercise?.detailsJson ?? '{}').primaryMuscles ?? []; } catch { /* Missing catalog metadata means there is no safe fatigue match. */ }
  const target = new Set(muscles);
  const recent = readWorkouts()
    .filter((workout) => workout.id !== excludingWorkoutId && now.getTime() - (workout.endedAt ?? workout.createdAt).getTime() <= 14 * 86_400_000)
    .sort((a, b) => (b.endedAt ?? b.createdAt).getTime() - (a.endedAt ?? a.createdAt).getTime())
    .map((workout) => Object.entries(readRatings()[workout.id] ?? {}).filter(([muscle]) => target.has(muscle)).map(([, value]) => getEffectiveExhaustion(value, workout.endedAt ?? workout.createdAt, now)))
    .find((ratings) => ratings.length);
  return recent ? Math.max(...recent) : undefined;
}

export function deleteWorkoutSet(exerciseId: string, set: WorkoutHistoryPoint) {
  let didDelete = false;
  write(read().filter((storedSet) => {
    const matches =
      storedSet.exerciseId === exerciseId &&
      storedSet.workoutId === set.workoutId &&
      storedSet.setNumber === set.setNumber &&
      storedSet.weight === set.weight &&
      storedSet.reps === set.reps &&
      new Date(storedSet.completedAt).getTime() === set.completedAt.getTime();
    if (matches && !didDelete) {
      didDelete = true;
      return false;
    }
    return true;
  }));
  if (didDelete) {
    queueCloudSyncTombstone('set', cloudSetKey(set.workoutId, exerciseId, set.setNumber));
  }
}

const cloudKeySeparator = '\u001F';
const cloudSetKey = (workoutId: string, exerciseId: string, setNumber: number) => [workoutId, exerciseId, setNumber].join(cloudKeySeparator);
const readTombstones = (): CloudSyncTombstone[] => JSON.parse(storage?.getItem(tombstonesKey) ?? '[]');
const writeTombstones = (tombstones: CloudSyncTombstone[]) => storage?.setItem(tombstonesKey, JSON.stringify(tombstones));

type StoredOutbox = CloudSyncChange & { mutationId: string; batchId?: string; createdAt: number };
const readOutbox = (): StoredOutbox[] => JSON.parse(storage?.getItem(outboxKey) ?? '[]');
const writeOutbox = (items: StoredOutbox[]) => storage?.setItem(outboxKey, JSON.stringify(items));
const readVersions = (): Record<string, number> => JSON.parse(storage?.getItem(versionsKey) ?? '{}');
const versionKey = (entity: CloudSyncEntity, key: string) => `${entity}\u0000${key}`;
const mutationId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

function localSyncRecord(entity: CloudSyncEntity, entityKey: string): Record<string, unknown> | null {
  if (entity === 'workout') {
    const workout = readWorkouts().find((item) => item.id === entityKey);
    if (!workout) return null;
    return { id: workout.id, split: workout.split, createdAt: Math.floor(workout.createdAt.getTime() / 1000), endedAt: workout.endedAt ? Math.floor(workout.endedAt.getTime() / 1000) : null };
  }
  if (entity === 'set') {
    const [workoutId, exerciseId, setNumber] = entityKey.split(cloudKeySeparator);
    const set = read().find((item) => item.workoutId === workoutId && item.exerciseId === exerciseId && item.setNumber === Number(setNumber));
    if (!set) return null;
    const exercise = exerciseCatalog.find((item) => item.id === exerciseId);
    let muscles: string[] = [];
    try { muscles = JSON.parse(exercise?.detailsJson ?? '{}').primaryMuscles ?? [exercise?.area.toLowerCase()].filter(Boolean); } catch { muscles = exercise ? [exercise.area.toLowerCase()] : []; }
    return { ...set, completedAt: Math.floor(new Date(set.completedAt).getTime() / 1000), muscles };
  }
  if (entity === 'rating') {
    const [workoutId, muscle] = entityKey.split(cloudKeySeparator);
    const exhaustion = readRatings()[workoutId]?.[muscle];
    return exhaustion === undefined ? null : { workoutId, muscle, exhaustion, createdAt: Math.floor(Date.now() / 1000) };
  }
  if (entity === 'split') return readCustomSplits().find((item) => item.id === entityKey) ?? null;
  const [workoutId, exerciseId, action] = entityKey.split(cloudKeySeparator);
  const feedback = readRecommendationFeedback().find((item) => item.workoutId === workoutId && item.exerciseId === exerciseId && item.action === action);
  return feedback ? { ...feedback, createdAt: Math.floor(feedback.createdAt.getTime() / 1000) } : null;
}

function enqueueCloudSync(entity: CloudSyncEntity, entityKey: string, operation: 'upsert' | 'delete') {
  const record = operation === 'upsert' ? localSyncRecord(entity, entityKey) : null;
  if (operation === 'upsert' && !record) return;
  const items = readOutbox();
  const index = items.findIndex((item) => !item.batchId && item.entity === entity && item.key === entityKey);
  const item: StoredOutbox = { entity, key: entityKey, operation, baseRevision: readVersions()[versionKey(entity, entityKey)] ?? 0, record: record ?? undefined, mutationId: mutationId(), createdAt: Date.now() };
  if (index < 0) items.push(item); else items[index] = item;
  writeOutbox(items);
}

function seedCloudSyncOutbox() {
  if (storage?.getItem(pendingSyncKey) !== '1') return;
  for (const workout of readWorkouts().filter((item) => !item.id.startsWith(demoWorkoutIdPrefix))) enqueueCloudSync('workout', workout.id, 'upsert');
  for (const set of read().filter((item) => !item.workoutId.startsWith(demoWorkoutIdPrefix))) enqueueCloudSync('set', cloudSetKey(set.workoutId, set.exerciseId, set.setNumber), 'upsert');
  for (const [workoutId, ratings] of Object.entries(readRatings())) for (const muscle of Object.keys(ratings)) enqueueCloudSync('rating', [workoutId, muscle].join(cloudKeySeparator), 'upsert');
  for (const item of readRecommendationFeedback()) enqueueCloudSync('feedback', [item.workoutId, item.exerciseId, item.action].join(cloudKeySeparator), 'upsert');
  for (const item of readCustomSplits()) enqueueCloudSync('split', item.id, 'upsert');
  for (const item of readTombstones()) enqueueCloudSync(item.entity, item.key, 'delete');
  storage?.removeItem(pendingSyncKey);
}

export function markCloudSyncDirty(entity?: CloudSyncEntity, entityKey?: string) {
  if (entity && entityKey) enqueueCloudSync(entity, entityKey, 'upsert');
  else storage?.setItem(pendingSyncKey, '1');
}
export function hasPendingCloudSync() { seedCloudSyncOutbox(); return readOutbox().length > 0; }
export function recordCloudSyncFailure() { /* The durable claimed batch is the retry state. */ }
export function getCloudSyncBatch(limit = 3): CloudSyncBatch | null {
  seedCloudSyncOutbox();
  const items = readOutbox();
  let batchId = items.find((item) => item.batchId)?.batchId;
  if (!batchId) {
    batchId = mutationId();
    for (const item of items.filter((entry) => !entry.batchId).slice(0, Math.min(limit, 3))) item.batchId = batchId;
    writeOutbox(items);
  }
  const changes = items.filter((item) => item.batchId === batchId).map(({ mutationId: _, batchId: __, createdAt: ___, ...change }) => change);
  return changes.length ? { batchId, changes } : null;
}
export function acknowledgeCloudSyncBatch(batchId: string, revision: number) {
  const items = readOutbox();
  const acknowledged = items.filter((item) => item.batchId === batchId);
  const remaining = items.filter((item) => item.batchId !== batchId);
  for (const item of remaining) if (acknowledged.some((prior) => prior.entity === item.entity && prior.key === item.key)) item.baseRevision = Math.max(item.baseRevision, revision);
  writeOutbox(remaining);
  const deleted = new Set(acknowledged.filter((item) => item.operation === 'delete').map((item) => versionKey(item.entity, item.key)));
  writeTombstones(readTombstones().filter((item) => !deleted.has(versionKey(item.entity, item.key))));
}
export function getCloudSyncCursor() { return Number(storage?.getItem(cursorKey) ?? 0); }
function queueCloudSyncTombstone(entity: CloudSyncTombstone['entity'], key: string) {
  const withoutCurrent = readTombstones().filter((item) => item.entity !== entity || item.key !== key);
  writeTombstones([...withoutCurrent, { entity, key, deletedAt: 0 }]);
  enqueueCloudSync(entity, key, 'delete');
}

export function prepareCloudSyncForUser(userId: string): boolean {
  const activeUserId = storage?.getItem(activeUserKey) ?? storage?.getItem(legacyActiveUserKey);
  if (!activeUserId) {
    storage?.setItem(activeUserKey, userId);
    if (readWorkouts().some((workout) => !workout.id.startsWith(demoWorkoutIdPrefix)) || readCustomSplits().length) storage?.setItem(pendingSyncKey, '1');
    return true;
  }
  if (activeUserId === userId) { storage?.removeItem(legacyActiveUserKey); return true; }
  if (hasPendingCloudSync()) return false;
  write([]);
  writeWorkouts([]);
  writeRatings({});
  storage?.removeItem(recommendationFeedbackKey);
  storage?.removeItem(customSplitsKey);
  storage?.removeItem(tombstonesKey);
  storage?.removeItem(pendingSyncKey);
  storage?.removeItem(outboxKey);
  storage?.removeItem(versionsKey);
  storage?.removeItem(cursorKey);
  storage?.setItem(activeUserKey, userId);
  storage?.removeItem(legacyActiveUserKey);
  syncDemoWorkoutData();
  return true;
}

/** Remove account-owned rows and sync metadata without touching the exercise catalog. */
export function clearLocalAccountData() {
  write([]);
  writeWorkouts([]);
  writeRatings({});
  for (const item of [recommendationFeedbackKey, customSplitsKey, tombstonesKey, pendingSyncKey, outboxKey, versionsKey, cursorKey, activeUserKey, legacyActiveUserKey]) storage?.removeItem(item);
  syncDemoWorkoutData();
}

export function mergeCloudSyncChanges(changes: CloudSyncRemoteChange[], cursor: number) {
  const pending = new Set(readOutbox().map((item) => versionKey(item.entity, item.key)));
  const versions = readVersions();
  for (const change of changes) {
    const identity = versionKey(change.entity, change.key);
    if (!pending.has(identity)) {
      const pieces = change.key.split(cloudKeySeparator);
      if (change.operation === 'delete') {
        if (change.entity === 'workout') {
          writeWorkouts(readWorkouts().filter((item) => item.id !== change.key));
          write(read().filter((item) => item.workoutId !== change.key));
          const ratings = readRatings(); delete ratings[change.key]; writeRatings(ratings);
          writeRecommendationFeedback(readRecommendationFeedback().filter((item) => item.workoutId !== change.key));
        }
        if (change.entity === 'set') write(read().filter((item) => !(item.workoutId === pieces[0] && item.exerciseId === pieces[1] && item.setNumber === Number(pieces[2]))));
        if (change.entity === 'rating') { const ratings = readRatings(); if (ratings[pieces[0]]) delete ratings[pieces[0]][pieces[1]]; writeRatings(ratings); }
        if (change.entity === 'split') writeCustomSplits(readCustomSplits().filter((item) => item.id !== change.key));
      } else if (change.record) {
        const record = change.record;
        if (change.entity === 'workout') {
          const workouts = readWorkouts(); const index = workouts.findIndex((item) => item.id === record.id);
          const workout = { id: String(record.id), split: record.split as WorkoutSplit, createdAt: new Date(Number(record.createdAt) * 1000), endedAt: record.endedAt == null ? null : new Date(Number(record.endedAt) * 1000) };
          if (index < 0) workouts.push(workout); else workouts[index] = workout; writeWorkouts(workouts);
        }
        if (change.entity === 'set' && readWorkouts().some((item) => item.id === record.workoutId)) {
          const sets = read(); const index = sets.findIndex((item) => cloudSetKey(item.workoutId, item.exerciseId, item.setNumber) === change.key);
          const set = { workoutId: String(record.workoutId), exerciseId: String(record.exerciseId), setNumber: Number(record.setNumber), weight: Number(record.weight), reps: Number(record.reps), completedAt: new Date(Number(record.completedAt) * 1000) };
          if (index < 0) sets.push(set); else sets[index] = set; write(sets);
        }
        if (change.entity === 'rating') { const ratings = readRatings(); const workoutId = String(record.workoutId); ratings[workoutId] = { ...ratings[workoutId], [String(record.muscle)]: Number(record.exhaustion) }; writeRatings(ratings); }
        if (change.entity === 'feedback') {
          const feedback = readRecommendationFeedback(); const index = feedback.findIndex((item) => item.workoutId === record.workoutId && item.exerciseId === record.exerciseId && item.action === record.action);
          const item = { workoutId: String(record.workoutId), exerciseId: String(record.exerciseId), action: record.action as RecommendationFeedbackAction, rank: record.rank == null ? undefined : Number(record.rank), createdAt: new Date(Number(record.createdAt) * 1000) };
          if (index < 0) feedback.push(item); else feedback[index] = item; writeRecommendationFeedback(feedback);
        }
        if (change.entity === 'split' && String(record.id).startsWith('custom:') && Array.isArray(record.muscles)) {
          const splits = readCustomSplits(); const index = splits.findIndex((item) => item.id === record.id);
          const split: CustomSplit = { id: String(record.id) as CustomSplit['id'], name: String(record.name), muscles: record.muscles.filter((muscle): muscle is string => typeof muscle === 'string') };
          if (index < 0) splits.push(split); else splits[index] = split; writeCustomSplits(splits);
        }
      }
    }
    versions[identity] = Math.max(versions[identity] ?? 0, change.revision);
  }
  storage?.setItem(versionsKey, JSON.stringify(versions));
  storage?.setItem(cursorKey, String(cursor));
}
