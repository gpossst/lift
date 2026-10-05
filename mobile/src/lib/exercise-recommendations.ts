import type { Exercise } from '@/db/exercise-catalog';
import { availableBarWeights, BAR_WEIGHT_LB, PLATE_INCREMENT_LB } from './plate-loading';

export type RecommendationSet = { exerciseId: string; workoutId: string; completedAt: Date; weight?: number; reps?: number };
export type MuscleExhaustionRating = { workoutId: string; split: string; muscle: string; exhaustion: number; completedAt: Date };
export type WorkoutFocusHistory = { split: string; completedAt: Date; sets: number; exhaustion?: number };
export type WorkoutSplitDefinition = { id: string; name: string; muscles: readonly string[] };
export type RecommendationFeedbackAction = 'accepted' | 'completed' | 'impression' | 'replaced' | 'removed' | 'skipped' | 'manual';
export type RecommendationFeedback = {
  workoutId: string; exerciseId: string; action: RecommendationFeedbackAction; createdAt: Date; rank?: number;
};
/** Optional preferences; callers can add these independently as they become available. */
export type RecommendationContext = {
  goals?: readonly string[]; experience?: 'new' | 'some' | 'experienced'; trainingDays?: number; sessionMinutes?: number; weightLb?: number;
  routineExerciseIdsBySplit?: Readonly<Record<string, readonly string[]>>;
  favoriteExerciseIds?: readonly string[]; excludedExerciseIds?: readonly string[];
  cohortHints?: { optIn?: boolean; peerCount?: number; muscleCoverage?: Readonly<Record<string, number>> };
};
export type ExerciseRecommendation = {
  exercise: Exercise; reason: string; score: number;
  sets: number; reps: { min: number; max: number }; restSeconds: number; estimatedMinutes: number;
  relativeLoadPercent?: number;
};
export type ProgressiveOverloadRecommendation = {
  weight?: number; reps: number; sets: number;
  action: 'start' | 'increase' | 'retain' | 'reduce' | 'deload'; reason: string;
};
export type ProgressiveOverloadSet = Pick<RecommendationSet, 'workoutId' | 'completedAt' | 'weight' | 'reps'> & { setNumber?: number };
export type ProgressiveOverloadPrescription = Pick<ExerciseRecommendation, 'sets' | 'reps'>;

const musclesBySplit = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['lats', 'middle back', 'lower back', 'traps', 'biceps', 'forearms', 'neck'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'],
} as const;
export const defaultWorkoutSplits: readonly WorkoutSplitDefinition[] = Object.entries(musclesBySplit).map(([id, muscles]) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), muscles }));
const day = 86_400_000;
const moderateFatigue = .75;
const severeFatigue = 2.5;

function preferenceRecency(completedAt: Date, now: Date) {
  return Math.pow(.5, Math.max(0, now.getTime() - completedAt.getTime()) / day / 30);
}

/** Converts a 0-10 check-in to a rapidly decaying 1-5 fatigue signal (roughly a two-day time constant). */
export function getEffectiveExhaustion(exhaustion: number, completedAt: Date, now = new Date()) {
  const ageDays = Math.max(0, (now.getTime() - completedAt.getTime()) / day);
  return 1 + Math.max(0, exhaustion) * .4 * Math.exp(-ageDays / 2);
}

function latestRatings(ratings: readonly MuscleExhaustionRating[], now: Date, excludingWorkoutId?: string) {
  const latest = new Map<string, MuscleExhaustionRating>();
  for (const rating of ratings) {
    if (rating.workoutId === excludingWorkoutId || rating.completedAt > now || now.getTime() - rating.completedAt.getTime() > 7 * day) continue;
    if (!latest.has(rating.muscle) || latest.get(rating.muscle)!.completedAt < rating.completedAt) latest.set(rating.muscle, rating);
  }
  return latest;
}

function fatigueSignal(rating: MuscleExhaustionRating | undefined, now: Date) {
  return rating ? getEffectiveExhaustion(rating.exhaustion, rating.completedAt, now) - 1 : 0;
}

export function getRecommendedWorkoutSplit(history: readonly WorkoutFocusHistory[], now = new Date(), muscleRatings: readonly MuscleExhaustionRating[] = [], definitions: readonly WorkoutSplitDefinition[] = defaultWorkoutSplits): string {
  const ratings = latestRatings(muscleRatings, now);
  return definitions.map(({ id: split, muscles }, order) => {
    const visits = history.filter((visit) => visit.split === split && visit.completedAt <= now);
    const latest = visits.reduce<WorkoutFocusHistory | null>((result, visit) => !result || visit.completedAt > result.completedAt ? visit : result, null);
    const ageDays = latest ? Math.max(0, (now.getTime() - latest.completedAt.getTime()) / day) : 7;
    const weeklySets = visits.filter((visit) => now.getTime() - visit.completedAt.getTime() <= 7 * day).reduce((total, visit) => total + visit.sets, 0);
    const fatigue = muscles.reduce((total, muscle) => total + fatigueSignal(ratings.get(muscle), now) * 8, 0);
    return { split, order, score: Math.min(ageDays, 7) * 2 - weeklySets - fatigue };
  }).sort((a, b) => b.score - a.score || a.order - b.order)[0]!.split;
}
function detailsFor(exercise: Pick<Exercise, 'detailsJson'>): Record<string, unknown> {
  try {
    const details: unknown = JSON.parse(exercise.detailsJson ?? '{}');
    return details && typeof details === 'object' && !Array.isArray(details) ? details as Record<string, unknown> : {};
  } catch { return {}; }
}
function musclesFor(details: Record<string, unknown>, field: 'primaryMuscles' | 'secondaryMuscles') {
  const muscles = details[field];
  return Array.isArray(muscles) ? muscles.filter((muscle): muscle is string => typeof muscle === 'string') : [];
}
function isResistance(details: Record<string, unknown>) {
  const category = details.category;
  return category !== 'stretching' && category !== 'cardio';
}
function isEligibleForSplit(details: Record<string, unknown>, muscles: readonly string[], context: RecommendationContext = {}) {
  const category = details.category;
  const level = details.level;
  const conditioningGoal = context.goals?.some((goal) => /lean|lose fat|health|fitness/i.test(goal));
  if (level === 'expert' && context.experience !== 'experienced') return false;
  if (category === 'strongman' && context.experience !== 'experienced') return false;
  if (category === 'plyometrics' && !conditioningGoal && context.experience !== 'experienced') return false;
  return isResistance(details) && musclesFor(details, 'primaryMuscles').some((muscle) => muscles.includes(muscle));
}
function doseFor(details: Record<string, unknown>, muscles: readonly string[]) {
  const dose = new Map<string, number>();
  for (const muscle of musclesFor(details, 'primaryMuscles')) if (muscles.includes(muscle)) dose.set(muscle, 1);
  for (const muscle of musclesFor(details, 'secondaryMuscles')) if (muscles.includes(muscle)) dose.set(muscle, Math.max(dose.get(muscle) ?? 0, .15));
  return dose;
}
function recoveryExhaustionFor(details: Record<string, unknown>, ratings: ReadonlyMap<string, MuscleExhaustionRating>, now: Date): number | undefined {
  const involved = [...musclesFor(details, 'primaryMuscles'), ...musclesFor(details, 'secondaryMuscles')];
  const exhaustion = involved.flatMap((muscle) => {
    const rating = ratings.get(muscle);
    return rating ? [getEffectiveExhaustion(rating.exhaustion, rating.completedAt, now)] : [];
  });
  return exhaustion.length ? Math.max(...exhaustion) : undefined;
}

/** Uses each involved muscle's latest recent check-in, independently of the workout it came from. */
export function getExerciseRecoveryExhaustion(
  exercise: Pick<Exercise, 'detailsJson'>, ratings: readonly MuscleExhaustionRating[], now = new Date(), excludingWorkoutId?: string,
): number | undefined {
  return recoveryExhaustionFor(detailsFor(exercise), latestRatings(ratings, now, excludingWorkoutId), now);
}

function recoveryFatigueFor(details: Record<string, unknown>, ratings: ReadonlyMap<string, MuscleExhaustionRating>, now: Date) {
  return (recoveryExhaustionFor(details, ratings, now) ?? 1) - 1;
}
function labelMuscle(muscle: string) { return muscle.replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function performance(set: Pick<RecommendationSet, 'weight' | 'reps'>) {
  if (typeof set.weight !== 'number' || typeof set.reps !== 'number') return null;
  return set.weight === 0 ? set.reps : set.weight * (1 + set.reps / 30);
}
function completedSessions(sets: readonly RecommendationSet[]) {
  const sessions = new Map<string, { completedAt: Date; performance: number | null }>();
  for (const set of sets) {
    const value = performance(set); const session = sessions.get(set.workoutId);
    if (!session) sessions.set(set.workoutId, { completedAt: set.completedAt, performance: value });
    else {
      if (set.completedAt > session.completedAt) session.completedAt = set.completedAt;
      if (value !== null) session.performance = Math.max(session.performance ?? 0, value);
    }
  }
  return [...sessions.entries()].map(([workoutId, session]) => ({ workoutId, ...session }))
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.workoutId.localeCompare(b.workoutId));
}
function isProgressing(sessions: ReturnType<typeof completedSessions>) {
  const values = sessions.flatMap((session) => session.performance === null ? [] : [session.performance]).slice(-6); if (values.length < 3) return false;
  const midpoint = Math.floor(values.length / 2); const average = (items: number[]) => items.reduce((sum, value) => sum + value, 0) / items.length;
  return average(values.slice(midpoint)) > average(values.slice(0, midpoint)) * 1.02;
}
const movementPatterns = ['core', 'hinge', 'squat', 'vertical press', 'horizontal press', 'vertical pull', 'row', 'accessory'] as const;
type MovementPattern = typeof movementPatterns[number];

function movementPattern(exercise: Exercise, details: Record<string, unknown>): MovementPattern {
  // Catalog metadata wins; older rows and custom exercises still have a fallback.
  if (movementPatterns.includes(details.movementPattern as MovementPattern)) return details.movementPattern as MovementPattern;
  const name = exercise.name.toLowerCase().replace(/[-_]/g, ' ');
  if (musclesFor(details, 'primaryMuscles').includes('abdominals')) return 'core';
  if (/deadlift|good morning|hip thrust|pull through|swing/.test(name)) return 'hinge';
  if (/squat|lunge|step\s*up|leg press/.test(name)) return 'squat';
  if (/pull\s*up|pull\s*down|\bchin\s*up|\bchins\b/.test(name)
    || (/\bchin\b/.test(name) && musclesFor(details, 'primaryMuscles').some((muscle) => muscle === 'lats' || muscle === 'middle back'))) return 'vertical pull';
  if (/row/.test(name)) return 'row';
  if (/press/.test(name) && (/overhead|military|shoulder|arnold/.test(name) || musclesFor(details, 'primaryMuscles').includes('shoulders'))) return 'vertical press';
  return /press|push\s*up/.test(name) ? 'horizontal press' : 'accessory';
}

function estimateExerciseMinutes(sets: number, restSeconds: number) {
  return Math.ceil(1.5 + sets * (restSeconds + 45) / 60);
}

/** Shared by the planner and every exercise entry path; exhaustion is the effective 1–5 rating. */
export function resolveExercisePrescription(
  exercise: Pick<Exercise, 'detailsJson'>, context: RecommendationContext = {}, exhaustion?: number, maximumSets?: number,
): Pick<ExerciseRecommendation, 'sets' | 'reps' | 'restSeconds' | 'estimatedMinutes'> {
  const compound = detailsFor(exercise).mechanic === 'compound';
  const strength = context.goals?.some((goal) => /strong/i.test(goal));
  const muscle = context.goals?.some((goal) => /muscle|bigger/i.test(goal));
  const baseSets = context.experience === 'new' ? 2 : compound ? 3 : 2;
  const trainingDays = Math.max(1, Math.min(context.trainingDays ?? 3, 5));
  const frequencyAdjustment = trainingDays <= 2 ? 1 : trainingDays >= 4 ? -1 : 0;
  const recoveryAdjustment = (exhaustion ?? 1) >= moderateFatigue + 1 ? -1 : 0;
  const resolvedSets = Math.max(1, baseSets + frequencyAdjustment + recoveryAdjustment);
  const sets = Number.isInteger(maximumSets) && maximumSets! > 0 ? Math.min(resolvedSets, maximumSets!) : resolvedSets;
  const reps = strength && compound ? { min: 4, max: 6 } : muscle ? { min: 8, max: 12 } : compound ? { min: 6, max: 10 } : { min: 10, max: 15 };
  const restSeconds = strength && compound ? 180 : compound ? 120 : 75;
  const estimatedMinutes = estimateExerciseMinutes(sets, restSeconds);
  return { sets, reps, restSeconds, estimatedMinutes };
}

export function getProgressiveOverloadLoadOptions(exercise: Pick<Exercise, 'equipment' | 'detailsJson'>) {
  if (exercise.equipment === 'barbell') return {
    weightIncrement: PLATE_INCREMENT_LB, minimumWeight: BAR_WEIGHT_LB, availableWeights: availableBarWeights,
  };
  const weightIncrement = exercise.equipment === 'dumbbell' || detailsFor(exercise).mechanic === 'isolation' ? 2.5 : 5;
  return { weightIncrement, minimumWeight: weightIncrement };
}

/** Recommends the next working set from completed sessions, never guessing a first-time load. */
export function getProgressiveOverloadRecommendation(
  history: readonly ProgressiveOverloadSet[],
  prescription: ProgressiveOverloadPrescription,
  options: { now?: Date; exhaustion?: number; weightIncrement?: number; minimumWeight?: number; availableWeights?: readonly number[]; currentWorkoutId?: string; setNumber?: number } = {},
): ProgressiveOverloadRecommendation {
  const now = options.now ?? new Date();
  const increment = Number.isFinite(options.weightIncrement) && options.weightIncrement! > 0 ? options.weightIncrement! : 5;
  const minimum = Number.isFinite(options.minimumWeight) && options.minimumWeight! > 0 ? options.minimumWeight! : increment;
  const availableWeights = [...new Set(options.availableWeights?.filter((load) => Number.isFinite(load) && load >= minimum))].sort((a, b) => a - b);
  const completed = history.filter((set) => set.completedAt.getTime() >= now.getTime() - 90 * day && set.completedAt <= now && Number.isFinite(set.weight) && set.weight! >= 0 && Number.isFinite(set.reps) && set.reps! > 0)
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.workoutId.localeCompare(b.workoutId));
  const valid = completed.filter((set) => set.workoutId !== options.currentWorkoutId);
  const current = completed.filter((set) => set.workoutId === options.currentWorkoutId)
    .sort((a, b) => (a.setNumber ?? Infinity) - (b.setNumber ?? Infinity) || a.completedAt.getTime() - b.completedAt.getTime());
  const latestCurrent = current.filter((set, index) => options.setNumber === undefined || (set.setNumber ?? index + 1) < options.setNumber).at(-1);
  if (latestCurrent) {
    const next = getProgressiveOverloadRecommendation(valid, prescription, options);
    if (next.weight === undefined) return {
      ...next, weight: latestCurrent.weight, reps: latestCurrent.reps!, action: 'retain', reason: 'Continue with the weight and reps logged this session',
    };
    const previous = getProgressiveOverloadRecommendation(valid, prescription, {
      ...options, setNumber: latestCurrent.setNumber ?? current.indexOf(latestCurrent) + 1,
    });
    // Carry the difference from the prescribed set forward, retaining the
    // historical ramp and avoiding another progression or fatigue reduction.
    const adjustment = latestCurrent.weight! - previous.weight!;
    let weight = next.weight;
    if (next.weight === previous.weight) {
      // A repeated load should keep the lifter's exact entry, including loads
      // outside the default equipment increments or a lighter bar.
      weight = latestCurrent.weight!;
    } else if (adjustment !== 0) {
      const target = next.weight + adjustment;
      weight = latestCurrent.weight === 0 || target <= 0 ? 0 : availableWeights.length
        ? availableWeights.reduce((best, load) => Math.abs(load - target) < Math.abs(best - target) ? load : best)
        : minimum + Math.max(0, Math.round((target - minimum) / increment)) * increment;
    }
    const reps = Math.max(1, next.reps + latestCurrent.reps! - previous.reps);
    return weight === next.weight && reps === next.reps ? next : {
      ...next, weight, reps, action: 'retain', reason: 'Follow this session’s adjustment while preserving the previous set sequence',
    };
  }
  if (!valid.length) return {
    reps: prescription.reps.min, sets: (options.exhaustion ?? 0) >= moderateFatigue + 1 ? Math.min(prescription.sets, 2) : prescription.sets,
    action: 'start', reason: (options.exhaustion ?? 0) >= moderateFatigue + 1 ? 'Start with less volume while the muscles involved recover' : 'Start conservatively and choose a comfortable weight',
  };

  const byWorkout = new Map<string, ProgressiveOverloadSet[]>();
  for (const set of valid) {
    const session = byWorkout.get(set.workoutId) ?? []; session.push(set); byWorkout.set(set.workoutId, session);
  }
  const allSessions = [...byWorkout.entries()].sort(([aId, a], [bId, b]) => a.at(-1)!.completedAt.getTime() - b.at(-1)!.completedAt.getTime() || aId.localeCompare(bId)).map(([, sets]) => sets);
  // Misses and declines from before a training break are not consecutive evidence.
  let firstComparable = allSessions.length - 1;
  while (firstComparable > 0 && allSessions[firstComparable]!.at(-1)!.completedAt.getTime() - allSessions[firstComparable - 1]!.at(-1)!.completedAt.getTime() < 14 * day) firstComparable -= 1;
  const orderedSessions = allSessions.slice(firstComparable);
  const sessions = orderedSessions.map((sets) => {
    // Compare session performance at the highest load, independently of tier progression.
    const workingWeight = sets.reduce((highest, set) => Math.max(highest, set.weight!), 0);
    return sets.filter((set) => set.weight === workingWeight);
  });
  const latest = sessions.at(-1)!;
  const previousSets = orderedSessions.at(-1)!.slice().sort((a, b) =>
    (a.setNumber ?? Infinity) - (b.setNumber ?? Infinity) || a.completedAt.getTime() - b.completedAt.getTime() || b.weight! - a.weight! || b.reps! - a.reps!);
  // Match the set being logged, preserving ramps and back-off sets. Extra sets
  // repeat the final previous set; callers without a set number use the working load.
  const setNumber = options.setNumber;
  const matchedSet = setNumber !== undefined && Number.isInteger(setNumber) && setNumber > 0
    ? previousSets.find((set) => set.setNumber === setNumber) ?? previousSets[Math.min(setNumber - 1, previousSets.length - 1)]!
    : undefined;
  const weight = matchedSet?.weight ?? latest[0]!.weight!;
  // The previous sequence defines each load tier's set target. Require a full
  // session, then evaluate every set at this load without mixing in other tiers.
  const latestTier = previousSets.filter((set) => set.weight === weight);
  const recentTiers = orderedSessions.slice(-2).map((sets) => sets.filter((set) => set.weight === weight));
  // Rebase historical weighted reps into the current goal's range. Bodyweight
  // progression deliberately permits reps above the ceiling; today's explicit
  // adjustments are applied separately, after this historical baseline.
  const historicalReps = matchedSet?.reps ?? Math.round(latest.reduce((sum, set) => sum + set.reps!, 0) / latest.length);
  const reps = Math.max(prescription.reps.min, weight === 0 ? historicalReps : Math.min(prescription.reps.max, historicalReps));
  const lighterWeight = (percentage: number) => {
    if (weight === 0) return 0;
    const target = weight * percentage;
    if (availableWeights.length) {
      const lighter = availableWeights.filter((load) => load < weight);
      return lighter.reduce((best, load) => Math.abs(load - target) <= Math.abs(best - target) ? load : best, lighter[0] ?? weight);
    }
    const lowerStep = Math.ceil((weight - minimum) / increment) - 1;
    const targetStep = Math.round((target - minimum) / increment);
    return Math.min(weight, minimum + Math.max(0, Math.min(lowerStep, targetStep)) * increment);
  };
  const sessionPerformance = (sets: readonly ProgressiveOverloadSet[]) => Math.max(...sets.map((set) => performance(set)!));
  const recent = sessions.slice(-3);
  const declining = recent.length === 3 && recent.slice(1).every((session, index) => sessionPerformance(session) < sessionPerformance(recent[index]!) * .98);

  const missedRecently = recentTiers.length === 2 && recentTiers.every((tier) => tier.length > 0 && tier.reduce((sum, set) => sum + set.reps!, 0) / tier.length < prescription.reps.min);
  let recommendation: ProgressiveOverloadRecommendation;
  if (missedRecently) {
    const reducedWeight = lighterWeight(.9);
    recommendation = {
      weight: reducedWeight, reps: prescription.reps.min, sets: reducedWeight === weight ? Math.max(1, prescription.sets - 1) : prescription.sets,
      action: 'reduce', reason: reducedWeight === weight ? 'Use one fewer set after repeatedly missing the rep range' : 'Reduce the load after repeatedly missing the rep range',
    };
  } else {
    const increasedWeight = availableWeights.length ? availableWeights.find((load) => load > weight) ?? weight : weight + increment;
    const reachedRepCeiling = previousSets.length >= prescription.sets && latestTier.every((set) => weight === 0 ? set.reps! >= prescription.reps.max : set.reps === prescription.reps.max);
    recommendation = weight === 0 && reachedRepCeiling
      ? { weight, reps: Math.min(...latestTier.map((set) => set.reps!)) + 1, sets: prescription.sets, action: 'increase', reason: 'Add one rep per set after reaching the top of the bodyweight rep range' }
      : weight > 0 && increasedWeight > weight && reachedRepCeiling
      ? { weight: increasedWeight, reps: prescription.reps.min, sets: prescription.sets, action: 'increase', reason: 'Increase the load after reaching the top of the rep range' }
      : { weight, reps, sets: prescription.sets, action: 'retain', reason: 'Keep the current prescription while performance is stable' };
  }

  // A break overrides earned progression, while retaining equipment/load-tier rules.
  const daysSinceLastSession = (now.getTime() - orderedSessions.at(-1)!.at(-1)!.completedAt.getTime()) / day;
  if (daysSinceLastSession >= 14) recommendation = {
    weight: Math.min(recommendation.weight!, lighterWeight(daysSinceLastSession >= 28 ? .85 : .9)),
    reps: prescription.reps.min, sets: Math.min(recommendation.sets, 2), action: 'reduce',
    reason: 'Ease back into this exercise after a break',
  };

  // Fatigue caps every progression action, without compounding load reductions.
  if ((options.exhaustion ?? 0) >= severeFatigue + 1) return {
    weight: Math.min(recommendation.weight!, lighterWeight(.85)), reps: prescription.reps.min, sets: Math.min(recommendation.sets, 2), action: 'deload',
    reason: declining ? 'Take a lighter session after sustained decline and high exhaustion' : 'Take a lighter session while the muscles involved recover',
  };
  if ((options.exhaustion ?? 0) >= moderateFatigue + 1) return {
    weight: Math.min(recommendation.weight!, lighterWeight(.9)), reps: prescription.reps.min, sets: Math.min(recommendation.sets, 2), action: 'reduce', reason: 'Reduce load and volume while the muscles involved recover',
  };
  return recommendation;
}

function recommendExercises(
  exercises: readonly Exercise[], sets: readonly RecommendationSet[], muscleRatings: readonly MuscleExhaustionRating[],
  workoutId: string, split: string, limit = 3, now = new Date(), context: RecommendationContext = {},
  feedback: readonly RecommendationFeedback[] = [], definition?: WorkoutSplitDefinition, rankOnly = false,
): ExerciseRecommendation[] {
  const mainTarget: readonly string[] = definition?.muscles ?? musclesBySplit[split as keyof typeof musclesBySplit];
  if (!mainTarget?.length) return [];
  const target = split.startsWith('custom:') ? mainTarget : [...mainTarget, 'abdominals'];
  // Parse catalog metadata and group history once, independently of the number of suggestions.
  const metadata = new Map(exercises.map((exercise) => {
    const details = detailsFor(exercise);
    return [exercise.id, { exercise, details, primary: musclesFor(details, 'primaryMuscles'), dose: doseFor(details, target), pattern: movementPattern(exercise, details) }];
  }));
  const currentIds = new Set<string>(); const currentSetCounts = new Map<string, number>();
  const histories = new Map<string, RecommendationSet[]>(); const exercisesByWorkout = new Map<string, Set<string>>();
  const equipmentWorkouts = new Map<string, Set<string>>();
  const recentWorkouts = new Set<string>();
  const muscleWorkouts = new Map<string, Set<string>>();
  const sessionDose = new Map<string, number>(target.map((muscle) => [muscle, 0])); const weeklyDose = new Map<string, number>(target.map((muscle) => [muscle, 0])); const recentDose = new Map<string, number>(target.map((muscle) => [muscle, 0])); const sessionPatterns = new Set<string>();
  const addDose = (destination: Map<string, number>, dose: ReadonlyMap<string, number>, sets = 1) => dose.forEach((amount, muscle) => destination.set(muscle, (destination.get(muscle) ?? 0) + amount * sets));
  for (const set of sets) {
    if (set.completedAt > now) continue;
    const info = metadata.get(set.exerciseId);
    const age = now.getTime() - set.completedAt.getTime();
    if (set.workoutId !== workoutId && info && age <= 28 * day && isResistance(info.details)) {
      recentWorkouts.add(set.workoutId);
      for (const muscle of info.dose.keys()) {
        const workouts = muscleWorkouts.get(muscle) ?? new Set<string>();
        workouts.add(set.workoutId); muscleWorkouts.set(muscle, workouts);
      }
    }
    if (set.workoutId === workoutId) {
      currentSetCounts.set(set.exerciseId, (currentSetCounts.get(set.exerciseId) ?? 0) + 1); currentIds.add(set.exerciseId);
      // Logged work counts even when the planner would not suggest it (expert level, off-split primary).
      if (info && isResistance(info.details)) { addDose(sessionDose, info.dose); if (info.primary.some((muscle) => target.includes(muscle))) sessionPatterns.add(info.pattern); }
    } else {
      const history = histories.get(set.exerciseId) ?? []; history.push(set); histories.set(set.exerciseId, history);
      const ids = exercisesByWorkout.get(set.workoutId) ?? new Set<string>(); ids.add(set.exerciseId); exercisesByWorkout.set(set.workoutId, ids);
      const equipment = info?.exercise.equipment;
      if (equipment && equipment !== 'body only' && age <= 90 * day) {
        const workouts = equipmentWorkouts.get(equipment) ?? new Set<string>(); workouts.add(set.workoutId); equipmentWorkouts.set(equipment, workouts);
      }
    }
    if (info && age <= 7 * day && isResistance(info.details)) {
      addDose(weeklyDose, info.dose);
      if (set.workoutId !== workoutId && age <= 2 * day) addDose(recentDose, info.dose);
    }
  }
  const sessionMinutes = Math.max(15, Math.min(context.sessionMinutes ?? 45, 120));
  const baseSessionDose = sessionMinutes <= 30 ? 3 : sessionMinutes < 60 ? 5 : sessionMinutes < 90 ? 6 : 8;
  const trainingDays = Math.max(1, Math.min(context.trainingDays ?? 3, 5));
  // Infrequent training needs more work per visit; frequent training can spread the same work across visits.
  const desiredSessionDose = Math.max(2, baseSessionDose + 3 - trainingDays);
  // Estimate muscle exposure from distinct completed workouts, not set count.
  // Without recent history, assume the default P/P/L rotation (core can span all
  // three splits); a custom split conservatively starts at one weekly exposure.
  const desiredWeeklyDose = new Map(target.map((muscle) => {
    const scheduledShare = definition && !defaultWorkoutSplits.some(({ id }) => id === definition.id)
      ? 1 / trainingDays
      : muscle === 'abdominals' ? 1 : defaultWorkoutSplits.filter(({ muscles }) => muscles.includes(muscle)).length / defaultWorkoutSplits.length;
    const share = recentWorkouts.size ? (muscleWorkouts.get(muscle)?.size ?? 0) / recentWorkouts.size : scheduledShare;
    const frequency = Math.max(1, trainingDays * share);
    return [muscle, muscle === 'abdominals' ? Math.max(2, frequency) : desiredSessionDose * frequency];
  }));
  const remainingSessionDose = (muscle: string) => Math.max(0, (muscle === 'abdominals' ? 1 : desiredSessionDose) - (sessionDose.get(muscle) ?? 0));
  const sessionCovered = () => target.every((muscle) => remainingSessionDose(muscle) === 0);
  if (!rankOnly && sessionCovered()) return [];
  const excluded = new Set(context.excludedExerciseIds);
  const recentRatings = latestRatings(muscleRatings, now, workoutId);
  const cohortCoverage = context.cohortHints?.optIn && (context.cohortHints.peerCount ?? 0) >= 5 ? context.cohortHints.muscleCoverage : undefined;
  const routineExerciseIds = new Set(context.routineExerciseIdsBySplit?.[split]);
  const favoriteExerciseIds = new Set([...context.favoriteExerciseIds ?? [], ...routineExerciseIds]);
  const feedbackByExercise = new Map<string, RecommendationFeedback[]>();
  for (const item of feedback) {
    // Rejections in this workout apply immediately; positive signals wait for completion.
    if (item.createdAt > now || (item.workoutId === workoutId && !['impression', 'removed', 'replaced', 'skipped'].includes(item.action))) continue;
    const items = feedbackByExercise.get(item.exerciseId) ?? []; items.push(item); feedbackByExercise.set(item.exerciseId, items);
  }
  const candidates = [...metadata.values()].filter(({ exercise, details }) => {
    const level = typeof details.level === 'string' ? details.level : '';
    return isEligibleForSplit(details, target, context) && (rankOnly || !currentIds.has(exercise.id)) && !excluded.has(exercise.id)
      && !((!context.experience || context.experience === 'new') && !exercise.isFeatured && /intermediate|expert|advanced/.test(level))
      && recoveryFatigueFor(details, recentRatings, now) < severeFatigue;
  }).map(({ exercise, details, dose, pattern, primary: allPrimary }) => {
    const primary = allPrimary.filter((muscle) => target.includes(muscle));
    const fatigue = recoveryFatigueFor(details, recentRatings, now);
    const prescription = resolveExercisePrescription(exercise, context, fatigue + 1);
    const history = (histories.get(exercise.id) ?? []).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.workoutId.localeCompare(b.workoutId) || (a.weight ?? 0) - (b.weight ?? 0) || (a.reps ?? 0) - (b.reps ?? 0));
    const latestWeightedSet = history.findLast((set) => typeof set.weight === 'number' && set.weight > 0);
    const relativeLoadPercent = latestWeightedSet && Number.isFinite(context.weightLb) && context.weightLb! > 0 ? Math.round(latestWeightedSet.weight! / context.weightLb! * 100) : undefined;
    const hoursSinceUse = history.at(-1) ? (now.getTime() - history.at(-1)!.completedAt.getTime()) / 3_600_000 : Infinity;
    const recoveryPenalty = (fatigue >= moderateFatigue ? fatigue * 20 : 0) + [...dose].reduce((sum, [muscle, amount]) => sum + (recentDose.get(muscle) ?? 0) * amount * 6, 0)
      + (hoursSinceUse < 48 ? (48 - hoursSinceUse) / 8 : 0);
    const sessions = completedSessions(history);
    const sessionPreference = sessions.slice(-6).reduce((total, session) => total + 3 * preferenceRecency(session.completedAt, now), 0);
    const progressionSessions = sessions.filter((session) => session.performance !== null && now.getTime() - session.completedAt.getTime() <= 90 * day).slice(-6);
    const progressionPreference = isProgressing(progressionSessions)
      ? 4 * progressionSessions.reduce((total, session) => total + preferenceRecency(session.completedAt, now), 0) / progressionSessions.length : 0;
    const exerciseFeedback = feedbackByExercise.get(exercise.id) ?? [];
    const impressions = new Map<string, RecommendationFeedback>();
    for (const item of exerciseFeedback) if (item.action === 'impression' && (!impressions.has(item.workoutId) || item.createdAt < impressions.get(item.workoutId)!.createdAt)) impressions.set(item.workoutId, item);
    const weightedFeedback = (actions: readonly RecommendationFeedbackAction[]) => exerciseFeedback
      .filter((item) => actions.includes(item.action) && (item.action !== 'skipped' || (impressions.get(item.workoutId)?.createdAt.getTime() ?? Infinity) <= item.createdAt.getTime()))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.workoutId.localeCompare(b.workoutId) || a.action.localeCompare(b.action)).slice(0, 3)
      .reduce((total, item) => {
        const weight = { manual: 3, skipped: -4 / Math.sqrt(item.rank ?? impressions.get(item.workoutId)?.rank ?? 1), removed: -8, replaced: -9 }[item.action as 'manual' | 'skipped' | 'removed' | 'replaced'];
        return total + weight * preferenceRecency(item.createdAt, now);
      }, 0);
    const manualPreference = weightedFeedback(['manual']);
    const rejectionPreference = weightedFeedback(['removed', 'replaced']);
    const skipPenalty = weightedFeedback(['skipped']);
    const goalBonus = context.goals?.some((goal) => /strong/i.test(goal)) && details.mechanic === 'compound' ? 2
      : context.goals?.some((goal) => /muscle|bigger/i.test(goal)) ? primary.length
        : context.goals?.some((goal) => /lean|lose fat|health|fitness/i.test(goal)) && (details.mechanic === 'compound' || exercise.equipment === 'body only') ? 1 : 0;
    const cohortBonus = cohortCoverage ? Math.min(2, primary.reduce((sum, muscle) => sum + Math.max(0, Math.min(1, cohortCoverage[muscle] ?? 0)), 0)) : 0;
    const equipmentBonus = Math.min(equipmentWorkouts.get(exercise.equipment)?.size ?? 0, 3) * 2;
    // Fade catalog and saved-preference priors with recent evidence, not lifetime counts.
    const sessionEvidence = sessions.reduce((total, session) => total + preferenceRecency(session.completedAt, now), 0);
    const manualEvidence = exerciseFeedback.filter(({ action }) => action === 'manual').reduce((total, item) => total + preferenceRecency(item.createdAt, now), 0);
    const rejectionEvidence = exerciseFeedback.filter(({ action, workoutId: id, createdAt }) => action === 'removed' || action === 'replaced' || (action === 'skipped' && (impressions.get(id)?.createdAt.getTime() ?? Infinity) <= createdAt.getTime()))
      .reduce((total, item) => total + preferenceRecency(item.createdAt, now), 0);
    const featuredBonus = exercise.isFeatured ? 1 + 7 * (1 - Math.min(1, sessionEvidence + rejectionEvidence)) : 0;
    const favoritePrior = favoriteExerciseIds.has(exercise.id) ? Math.max(0, 20 * Math.pow(.5, (sessionEvidence + manualEvidence) / 6) + rejectionPreference) : 0;
    const preference = sessionPreference + progressionPreference + manualPreference + favoritePrior + rejectionPreference;
    const relatedWorkouts = sessions.map(({ workoutId: id, completedAt }) => ({ ids: exercisesByWorkout.get(id)!, weight: preferenceRecency(completedAt, now) }));
    return { exercise, dose, primary, pattern, fatigue, prescription, relativeLoadPercent, recoveryPenalty, preference, skipPenalty, goalBonus, cohortBonus, equipmentBonus, featuredBonus, favoritePrior, relatedWorkouts };
  });
  const anchorIds = new Set(currentIds);
  const scoreCandidate = (candidate: typeof candidates[number]) => {
    const { exercise, dose, primary, pattern, fatigue, prescription, relativeLoadPercent, recoveryPenalty, preference, skipPenalty, goalBonus, cohortBonus, equipmentBonus, featuredBonus, favoritePrior, relatedWorkouts } = candidate;
    // Average useful coverage by muscle dose so extra catalog tags cannot inflate it.
    // Keep actual per-muscle dose unchanged for history and planned volume.
    const totalDose = [...dose.values()].reduce((sum, amount) => sum + amount, 0);
    const sessionNeed = [...dose].reduce((sum, [muscle, amount]) => sum + Math.min(Math.max(0, (muscle === 'abdominals' ? 1 : desiredSessionDose) - (sessionDose.get(muscle) ?? 0)), amount * prescription.sets), 0) / totalDose;
    const weeklyNeed = [...dose].reduce((sum, [muscle, amount]) => sum + Math.min(Math.max(0, (desiredWeeklyDose.get(muscle) ?? 0) - (weeklyDose.get(muscle) ?? 0)), amount * prescription.sets), 0) / totalDose;
    const patternBonus = sessionPatterns.has(pattern) ? 0 : 3;
    let redundantExercises = 0;
    for (const id of anchorIds) {
      const other = metadata.get(id);
      if (id !== exercise.id && other?.pattern === pattern && other.primary.some((muscle) => primary.includes(muscle))) redundantExercises++;
    }
    let togetherCount = 0;
    for (const { ids, weight } of relatedWorkouts) {
      if ([...anchorIds].some((id) => id !== exercise.id && ids.has(id))) togetherCount += weight;
    }
    const togetherBonus = Math.min(togetherCount, 4) * 2;
    const score = (sessionNeed * 18 + weeklyNeed * 2 + patternBonus + preference + skipPenalty + togetherBonus + goalBonus + cohortBonus + equipmentBonus + featuredBonus - recoveryPenalty - redundantExercises * 5) / prescription.estimatedMinutes;
    const mostNeeded = primary.slice().sort((a, b) => (sessionDose.get(a) ?? 0) - (sessionDose.get(b) ?? 0))[0] ?? split;
    return { exercise, dose, pattern, score, prescription, relativeLoadPercent, reason: fatigue >= moderateFatigue ? `Lower volume while your ${labelMuscle(mostNeeded)} recovers` : favoritePrior ? routineExerciseIds.has(exercise.id) ? 'Part of your usual routine' : 'One of your favorites' : sessionNeed > 0 ? `Build your ${labelMuscle(mostNeeded)} work` : weeklyNeed > 0 ? `Support this week's ${labelMuscle(mostNeeded)} work` : 'Continue your recent training pattern' };
  };
  const compare = (a: ReturnType<typeof scoreCandidate>, b: ReturnType<typeof scoreCandidate>) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name) || a.exercise.id.localeCompare(b.exercise.id);
  const toRecommendation = ({ exercise, reason, score, relativeLoadPercent, prescription }: ReturnType<typeof scoreCandidate>): ExerciseRecommendation => ({ exercise, reason, score, relativeLoadPercent, ...prescription });
  // Catalog ranking scores all eligible movements against the actual session, without reserving planned dose or time.
  if (rankOnly) return candidates.map(scoreCandidate).sort(compare).map(toRecommendation);
  const suggested: ExerciseRecommendation[] = [];
  const completedMinutes = [...currentSetCounts].reduce((minutes, [exerciseId, sets]) => {
    const exercise = metadata.get(exerciseId)?.exercise ?? { detailsJson: '{}' };
    const { restSeconds } = resolveExercisePrescription(exercise, context);
    return minutes + estimateExerciseMinutes(sets, restSeconds);
  }, 0);
  let remainingMinutes = Math.max(0, sessionMinutes - completedMinutes);
  while (suggested.length < limit && candidates.length && !sessionCovered()) {
    let winner: ReturnType<typeof scoreCandidate> | undefined; let winnerIndex = -1;
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]!;
      // Weekly need and preference bonuses cannot exceed this session's dose.
      const sets = Math.min(candidate.prescription.sets, ...[...candidate.dose].map(([muscle, amount]) => Math.floor((remainingSessionDose(muscle) + 1e-9) / amount)));
      if (sets < 1) continue;
      const prescription = { ...candidate.prescription, sets, estimatedMinutes: estimateExerciseMinutes(sets, candidate.prescription.restSeconds) };
      const item = scoreCandidate({ ...candidate, prescription });
      if (item.score > 0 && item.prescription.estimatedMinutes <= remainingMinutes && (!winner || compare(item, winner) < 0)) { winner = item; winnerIndex = index; }
    }
    if (!winner) break;
    suggested.push(toRecommendation(winner));
    addDose(sessionDose, winner.dose, winner.prescription.sets); addDose(weeklyDose, winner.dose, winner.prescription.sets);
    remainingMinutes -= winner.prescription.estimatedMinutes;
    anchorIds.add(winner.exercise.id); sessionPatterns.add(winner.pattern); candidates.splice(winnerIndex, 1);
  }
  return suggested;
}

/** Balances logged dose and reserves enough time for each workout suggestion. */
export function getExerciseRecommendations(
  exercises: readonly Exercise[], sets: readonly RecommendationSet[], muscleRatings: readonly MuscleExhaustionRating[],
  workoutId: string, split: string, limit = 3, now = new Date(), context: RecommendationContext = {},
  feedback: readonly RecommendationFeedback[] = [], definition?: WorkoutSplitDefinition,
): ExerciseRecommendation[] {
  return recommendExercises(exercises, sets, muscleRatings, workoutId, split, limit, now, context, feedback, definition);
}

/** Ranks every eligible catalog movement, including logged movements and regardless of remaining session time. */
export function getRankedExercises(
  exercises: readonly Exercise[], sets: readonly RecommendationSet[], muscleRatings: readonly MuscleExhaustionRating[],
  workoutId: string, split: string, now = new Date(), context: RecommendationContext = {},
  feedback: readonly RecommendationFeedback[] = [], definition?: WorkoutSplitDefinition,
): ExerciseRecommendation[] {
  return recommendExercises(exercises, sets, muscleRatings, workoutId, split, Infinity, now, context, feedback, definition, true);
}
