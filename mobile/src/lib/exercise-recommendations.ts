import type { Exercise } from '@/db/exercise-catalog';

export type RecommendationSet = { exerciseId: string; workoutId: string; completedAt: Date; weight?: number; reps?: number };
export type MuscleExhaustionRating = { workoutId: string; split: keyof typeof musclesBySplit; muscle: string; exhaustion: number; completedAt: Date };
export type WorkoutFocusHistory = { split: keyof typeof musclesBySplit; completedAt: Date; sets: number; exhaustion?: number };
export type RecommendationFeedbackAction = 'accepted' | 'completed' | 'impression' | 'replaced' | 'removed' | 'skipped' | 'manual';
export type RecommendationFeedback = {
  workoutId: string; exerciseId: string; action: RecommendationFeedbackAction; createdAt: Date; rank?: number;
};
/** Optional preferences; callers can add these independently as they become available. */
export type RecommendationContext = {
  goals?: readonly string[]; experience?: 'new' | 'some' | 'experienced'; trainingDays?: number; sessionMinutes?: number;
  favoriteExerciseIds?: readonly string[]; excludedExerciseIds?: readonly string[];
  cohortHints?: { optIn?: boolean; peerCount?: number; muscleCoverage?: Readonly<Record<string, number>> };
};
export type ExerciseRecommendation = {
  exercise: Exercise; reason: string; score: number;
  sets: number; reps: { min: number; max: number }; restSeconds: number; estimatedMinutes: number;
};
export type ProgressiveOverloadRecommendation = {
  weight?: number; reps: number; sets: number;
  action: 'start' | 'increase' | 'retain' | 'reduce' | 'deload'; reason: string;
};
export type ProgressiveOverloadSet = Pick<RecommendationSet, 'workoutId' | 'completedAt' | 'weight' | 'reps'>;
export type ProgressiveOverloadPrescription = Pick<ExerciseRecommendation, 'sets' | 'reps'>;

const musclesBySplit = {
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['lats', 'middle back', 'lower back', 'traps', 'biceps', 'forearms'],
  legs: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors'],
} as const;
const day = 86_400_000;
const moderateFatigue = .75;
const severeFatigue = 2.5;

/** Converts a 1-5 check-in to a rapidly decaying fatigue signal (roughly a two-day time constant). */
export function getEffectiveExhaustion(exhaustion: number, completedAt: Date, now = new Date()) {
  const ageDays = Math.max(0, (now.getTime() - completedAt.getTime()) / day);
  return 1 + Math.max(0, exhaustion - 1) * Math.exp(-ageDays / 2);
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

export function getRecommendedWorkoutSplit(history: readonly WorkoutFocusHistory[], now = new Date(), muscleRatings: readonly MuscleExhaustionRating[] = []): keyof typeof musclesBySplit {
  const ratings = latestRatings(muscleRatings, now);
  return (Object.keys(musclesBySplit) as (keyof typeof musclesBySplit)[]).map((split, order) => {
    const visits = history.filter((visit) => visit.split === split && visit.completedAt <= now);
    const latest = visits.reduce<WorkoutFocusHistory | null>((result, visit) => !result || visit.completedAt > result.completedAt ? visit : result, null);
    const ageDays = latest ? Math.max(0, (now.getTime() - latest.completedAt.getTime()) / day) : 7;
    const weeklySets = visits.filter((visit) => now.getTime() - visit.completedAt.getTime() <= 7 * day).reduce((total, visit) => total + visit.sets, 0);
    const fatigue = musclesBySplit[split].reduce((total, muscle) => total + fatigueSignal(ratings.get(muscle), now) * 8, 0);
    return { split, order, score: Math.min(ageDays, 7) * 2 - weeklySets - fatigue };
  }).sort((a, b) => b.score - a.score || a.order - b.order)[0]!.split;
}
function detailsFor(exercise: Exercise): Record<string, unknown> {
  try {
    const details: unknown = JSON.parse(exercise.detailsJson ?? '{}');
    return details && typeof details === 'object' && !Array.isArray(details) ? details as Record<string, unknown> : {};
  } catch { return {}; }
}
function musclesFor(exercise: Exercise, field: 'primaryMuscles' | 'secondaryMuscles') {
  const muscles = detailsFor(exercise)[field];
  return Array.isArray(muscles) ? muscles.filter((muscle): muscle is string => typeof muscle === 'string') : [];
}
function isResistance(exercise: Exercise) {
  const category = detailsFor(exercise).category;
  return category !== 'stretching' && category !== 'cardio';
}
function isEligibleForSplit(exercise: Exercise, split: keyof typeof musclesBySplit, context: RecommendationContext = {}) {
  const details = detailsFor(exercise);
  const category = details.category;
  const level = details.level;
  const conditioningGoal = context.goals?.some((goal) => /lean|lose fat|health|fitness/i.test(goal));
  if (level === 'expert' && context.experience !== 'experienced') return false;
  if (category === 'strongman' && context.experience !== 'experienced') return false;
  if (category === 'plyometrics' && !conditioningGoal && context.experience !== 'experienced') return false;
  return isResistance(exercise) && musclesFor(exercise, 'primaryMuscles').some((muscle) => muscle === 'abdominals' || musclesBySplit[split].includes(muscle as never));
}
function doseFor(exercise: Exercise, split: keyof typeof musclesBySplit) {
  const target = [...musclesBySplit[split], 'abdominals']; const dose = new Map<string, number>();
  for (const muscle of musclesFor(exercise, 'primaryMuscles')) if (target.includes(muscle as never)) dose.set(muscle, 1);
  for (const muscle of musclesFor(exercise, 'secondaryMuscles')) if (target.includes(muscle as never)) dose.set(muscle, Math.max(dose.get(muscle) ?? 0, .15));
  return dose;
}
function recoveryFatigueFor(exercise: Exercise, ratings: ReadonlyMap<string, MuscleExhaustionRating>, now: Date) {
  return Math.max(0,
    ...musclesFor(exercise, 'primaryMuscles').map((muscle) => fatigueSignal(ratings.get(muscle), now)),
    ...musclesFor(exercise, 'secondaryMuscles').map((muscle) => fatigueSignal(ratings.get(muscle), now)),
  );
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
function isProgressing(sets: readonly RecommendationSet[]) {
  const values = completedSessions(sets).flatMap((session) => session.performance === null ? [] : [session.performance]).slice(-6); if (values.length < 3) return false;
  const midpoint = Math.floor(values.length / 2); const average = (items: number[]) => items.reduce((sum, value) => sum + value, 0) / items.length;
  return average(values.slice(midpoint)) > average(values.slice(0, midpoint)) * 1.02;
}
function movementPattern(exercise: Exercise, split: keyof typeof musclesBySplit) {
  const name = exercise.name.toLowerCase();
  if (musclesFor(exercise, 'primaryMuscles').includes('abdominals')) return 'core';
  if (split === 'legs') return /deadlift|good morning|hip thrust|pull through|swing/.test(name) ? 'hinge' : /squat|lunge|step.?up|leg press/.test(name) ? 'squat' : 'accessory';
  if (split === 'push') return /overhead|military|shoulder press/.test(name) ? 'vertical press' : /press|push.?up/.test(name) ? 'horizontal press' : 'accessory';
  return /pull.?up|pulldown/.test(name) ? 'vertical pull' : /row/.test(name) ? 'row' : 'accessory';
}

function prescriptionFor(exercise: Exercise, context: RecommendationContext) {
  const compound = detailsFor(exercise).mechanic === 'compound';
  const strength = context.goals?.some((goal) => /strong/i.test(goal));
  const muscle = context.goals?.some((goal) => /muscle|bigger/i.test(goal));
  const sets = context.experience === 'new' ? 2 : compound ? 3 : 2;
  const reps = strength && compound ? { min: 4, max: 6 } : muscle ? { min: 8, max: 12 } : compound ? { min: 6, max: 10 } : { min: 10, max: 15 };
  const restSeconds = strength && compound ? 180 : compound ? 120 : 75;
  const estimatedMinutes = Math.ceil(1.5 + sets * (restSeconds + 45) / 60);
  return { sets, reps, restSeconds, estimatedMinutes };
}

/** Recommends the next working set from completed sessions, never guessing a first-time load. */
export function getProgressiveOverloadRecommendation(
  history: readonly ProgressiveOverloadSet[],
  prescription: ProgressiveOverloadPrescription,
  options: { exhaustion?: number; weightIncrement?: number; currentWorkoutId?: string } = {},
): ProgressiveOverloadRecommendation {
  const increment = Number.isFinite(options.weightIncrement) && options.weightIncrement! > 0 ? options.weightIncrement! : 5;
  const valid = history.filter((set) => set.workoutId !== options.currentWorkoutId && Number.isFinite(set.weight) && set.weight! >= 0 && Number.isFinite(set.reps) && set.reps! > 0)
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.workoutId.localeCompare(b.workoutId));
  if (!valid.length) return {
    reps: prescription.reps.min, sets: (options.exhaustion ?? 0) >= moderateFatigue + 1 ? Math.min(prescription.sets, 2) : prescription.sets,
    action: 'start', reason: (options.exhaustion ?? 0) >= moderateFatigue + 1 ? 'Start with less volume while the muscles involved recover' : 'Start conservatively and choose a comfortable weight',
  };

  const byWorkout = new Map<string, ProgressiveOverloadSet[]>();
  for (const set of valid) byWorkout.set(set.workoutId, [...(byWorkout.get(set.workoutId) ?? []), set]);
  const sessions = [...byWorkout.entries()].sort(([aId, a], [bId, b]) => a[0]!.completedAt.getTime() - b[0]!.completedAt.getTime() || aId.localeCompare(bId)).map(([, sets]) => sets);
  const latest = sessions.at(-1)!;
  const workingSet = latest.reduce((best, set) => performance(set)! > performance(best)! ? set : best);
  const weight = workingSet.weight!;
  const reps = Math.max(prescription.reps.min, Math.min(prescription.reps.max, Math.round(latest.reduce((sum, set) => sum + set.reps!, 0) / latest.length)));
  const lighterWeight = (percentage: number) => weight === 0 ? 0 : Math.max(0, Math.min(weight - increment, Math.round(weight * percentage / increment) * increment));
  const sessionPerformance = (sets: readonly ProgressiveOverloadSet[]) => Math.max(...sets.map((set) => performance(set)!));
  const recent = sessions.slice(-3);
  const declining = recent.length === 3 && recent.slice(1).every((session, index) => sessionPerformance(session) < sessionPerformance(recent[index]!) * .98);

  if (declining && (options.exhaustion ?? 0) >= severeFatigue + 1) return {
    weight: lighterWeight(.85), reps: prescription.reps.min, sets: Math.min(prescription.sets, 2), action: 'deload', reason: 'Take a lighter session after sustained decline and high exhaustion',
  };
  const missedRecently = sessions.slice(-2).length === 2 && sessions.slice(-2).every((session) => session.reduce((sum, set) => sum + set.reps!, 0) / session.length < prescription.reps.min);
  if (missedRecently) return {
    weight: lighterWeight(.9), reps: prescription.reps.min, sets: weight === 0 ? Math.max(1, prescription.sets - 1) : prescription.sets, action: 'reduce', reason: weight === 0 ? 'Use one fewer set after repeatedly missing the rep range' : 'Reduce the load after repeatedly missing the rep range',
  };
  if ((options.exhaustion ?? 0) >= severeFatigue + 1) return {
    weight: lighterWeight(.85), reps: prescription.reps.min, sets: Math.min(prescription.sets, 2), action: 'deload', reason: 'Take a lighter session while the muscles involved recover',
  };
  if ((options.exhaustion ?? 0) >= moderateFatigue + 1) return {
    weight: lighterWeight(.9), reps: prescription.reps.min, sets: Math.min(prescription.sets, 2), action: 'reduce', reason: 'Reduce load and volume while the muscles involved recover',
  };
  if (weight > 0 && latest.length >= prescription.sets && latest.every((set) => set.reps! >= prescription.reps.max)) return {
    weight: weight + increment, reps: prescription.reps.min, sets: prescription.sets, action: 'increase', reason: 'Increase the load after reaching the top of the rep range',
  };
  return { weight, reps, sets: prescription.sets, action: 'retain', reason: 'Keep the current prescription while performance is stable' };
}

/** A small, local planner: it balances logged dose and reserves enough time for each suggestion. */
export function getExerciseRecommendations(
  exercises: readonly Exercise[], sets: readonly RecommendationSet[], muscleRatings: readonly MuscleExhaustionRating[],
  workoutId: string, split: keyof typeof musclesBySplit, limit = 3, now = new Date(), context: RecommendationContext = {},
  feedback: readonly RecommendationFeedback[] = [],
): ExerciseRecommendation[] {
  const mainTarget = musclesBySplit[split]; const target = [...mainTarget, 'abdominals']; const currentSets = sets.filter((set) => set.workoutId === workoutId && set.completedAt <= now);
  const currentIds = new Set(currentSets.map((set) => set.exerciseId)); const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const sessionDose = new Map<string, number>(target.map((muscle) => [muscle, 0])); const weeklyDose = new Map<string, number>(target.map((muscle) => [muscle, 0])); const recentDose = new Map<string, number>(target.map((muscle) => [muscle, 0])); const sessionPatterns = new Set<string>();
  const weekAgo = now.getTime() - 7 * day;
  const addDose = (destination: Map<string, number>, exercise: Exercise) => doseFor(exercise, split).forEach((amount, muscle) => destination.set(muscle, (destination.get(muscle) ?? 0) + amount));
  for (const set of currentSets) { const exercise = byId.get(set.exerciseId); if (exercise && isEligibleForSplit(exercise, split, context)) { addDose(sessionDose, exercise); sessionPatterns.add(movementPattern(exercise, split)); } }
  for (const set of sets) {
    const exercise = byId.get(set.exerciseId);
    if (!exercise || set.completedAt > now || set.completedAt.getTime() < weekAgo || !isResistance(exercise)) continue;
    addDose(weeklyDose, exercise);
    if (set.workoutId !== workoutId && now.getTime() - set.completedAt.getTime() <= 2 * day) addDose(recentDose, exercise);
  }
  const sessionMinutes = Math.max(15, Math.min(context.sessionMinutes ?? 45, 120));
  const desiredSessionDose = sessionMinutes <= 30 ? 3 : sessionMinutes < 60 ? 5 : sessionMinutes < 90 ? 6 : 8;
  const desiredWeeklyDose = desiredSessionDose * Math.max(2, Math.min(context.trainingDays ?? 3, 5));
  if (mainTarget.every((muscle) => (sessionDose.get(muscle) ?? 0) >= desiredSessionDose) && (sessionDose.get('abdominals') ?? 0) >= 1) return [];
  const excluded = new Set(context.excludedExerciseIds);
  const recentRatings = latestRatings(muscleRatings, now, workoutId);
  const cohortCoverage = context.cohortHints?.optIn && (context.cohortHints.peerCount ?? 0) >= 5 ? context.cohortHints.muscleCoverage : undefined;
  const favoriteExerciseIds = new Set(context.favoriteExerciseIds);
  const equipmentWorkouts = new Map<string, Set<string>>();
  for (const set of sets) {
    if (set.workoutId === workoutId || set.completedAt > now || now.getTime() - set.completedAt.getTime() > 90 * day) continue;
    const equipment = byId.get(set.exerciseId)?.equipment;
    if (!equipment || equipment === 'body only') continue;
    const workouts = equipmentWorkouts.get(equipment) ?? new Set<string>(); workouts.add(set.workoutId); equipmentWorkouts.set(equipment, workouts);
  }
  const candidates = exercises.filter((exercise) => {
    const details = detailsFor(exercise); const level = typeof details.level === 'string' ? details.level : '';
    return isEligibleForSplit(exercise, split, context) && !currentIds.has(exercise.id) && !excluded.has(exercise.id)
      && !((!context.experience || context.experience === 'new') && !exercise.isFeatured && /intermediate|expert|advanced/.test(level))
      && recoveryFatigueFor(exercise, recentRatings, now) < severeFatigue;
  });
  const histories = new Map(candidates.map((exercise) => [exercise.id, sets.filter((set) => set.exerciseId === exercise.id && set.workoutId !== workoutId && set.completedAt <= now).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.workoutId.localeCompare(b.workoutId))]));
  const feedbackByExercise = new Map<string, RecommendationFeedback[]>();
  for (const item of feedback) {
    if (item.createdAt > now || item.workoutId === workoutId) continue;
    feedbackByExercise.set(item.exerciseId, [...(feedbackByExercise.get(item.exerciseId) ?? []), item]);
  }
  const exercisesByWorkout = new Map<string, Set<string>>();
  for (const set of sets) {
    if (set.workoutId === workoutId || set.completedAt > now) continue;
    const ids = exercisesByWorkout.get(set.workoutId) ?? new Set<string>(); ids.add(set.exerciseId); exercisesByWorkout.set(set.workoutId, ids);
  }
  const suggested: ExerciseRecommendation[] = [];
  let remainingMinutes = Math.max(0, sessionMinutes - currentSets.length * 2.5 - currentIds.size * 1.5);
  while (suggested.length < limit && candidates.length) {
    const ranked = candidates.map((exercise) => {
      const dose = doseFor(exercise, split); const primary = musclesFor(exercise, 'primaryMuscles').filter((muscle) => target.includes(muscle as never));
      const fatigue = recoveryFatigueFor(exercise, recentRatings, now);
      const basePrescription = prescriptionFor(exercise, context);
      const prescription = fatigue >= moderateFatigue ? {
        ...basePrescription,
        sets: Math.max(1, basePrescription.sets - 1),
        estimatedMinutes: Math.ceil(1.5 + Math.max(1, basePrescription.sets - 1) * (basePrescription.restSeconds + 45) / 60),
      } : basePrescription;
      const sessionNeed = [...dose].reduce((sum, [muscle, amount]) => sum + Math.max(0, (muscle === 'abdominals' ? 1 : desiredSessionDose) - (sessionDose.get(muscle) ?? 0)) * amount, 0);
      const weeklyNeed = [...dose].reduce((sum, [muscle, amount]) => sum + Math.max(0, (muscle === 'abdominals' ? Math.max(2, context.trainingDays ?? 3) : desiredWeeklyDose) - (weeklyDose.get(muscle) ?? 0)) * amount, 0);
      const history = histories.get(exercise.id)!;
      const hoursSinceUse = history.at(-1) ? (now.getTime() - history.at(-1)!.completedAt.getTime()) / 3_600_000 : Infinity;
      const recoveryPenalty = (fatigue >= moderateFatigue ? fatigue * 25 : 0) + [...dose].reduce((sum, [muscle, amount]) => sum + (recentDose.get(muscle) ?? 0) * amount * 6, 0)
        + (hoursSinceUse < 48 ? (48 - hoursSinceUse) / 8 : 0);
      const pattern = movementPattern(exercise, split); const patternBonus = sessionPatterns.has(pattern) ? 0 : 3;
      const redundantExercises = [...currentIds, ...suggested.map(({ exercise: item }) => item.id)].reduce((count, id) => {
        const other = byId.get(id); if (!other || movementPattern(other, split) !== pattern) return count;
        return count + (musclesFor(other, 'primaryMuscles').some((item) => primary.includes(item)) ? 1 : 0);
      }, 0);
      const sessions = completedSessions(history);
      const recentCompletedSessions = sessions.slice(-6);
      const sessionPreference = recentCompletedSessions.reduce((total, session) => total + 3 * Math.pow(.5, Math.max(0, now.getTime() - session.completedAt.getTime()) / day / 30), 0);
      const progressionPreference = isProgressing(history) ? 4 : 0;
      const exerciseFeedback = feedbackByExercise.get(exercise.id) ?? [];
      const impressions = new Map(exerciseFeedback.filter(({ action }) => action === 'impression').map(({ workoutId: id, createdAt }) => [id, createdAt]));
      const weightedFeedback = (actions: readonly RecommendationFeedbackAction[]) => exerciseFeedback
        .filter((item) => actions.includes(item.action) && (item.action !== 'skipped' || (impressions.get(item.workoutId)?.getTime() ?? Infinity) <= item.createdAt.getTime()))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.workoutId.localeCompare(b.workoutId) || a.action.localeCompare(b.action)).slice(0, 3)
        .reduce((total, item) => {
          const ageDays = Math.max(0, (now.getTime() - item.createdAt.getTime()) / day);
          const weight = { manual: 3, skipped: -4 / Math.sqrt(item.rank ?? 1), removed: -8, replaced: -9 }[item.action as 'manual' | 'skipped' | 'removed' | 'replaced'];
          return total + weight * Math.pow(.5, ageDays / 30);
        }, 0);
      const manualPreference = weightedFeedback(['manual']);
      const rejectionPreference = weightedFeedback(['removed', 'replaced']);
      const skipPenalty = weightedFeedback(['skipped']);
      const anchorIds = new Set([...currentIds, ...suggested.map((item) => item.exercise.id)]);
      const togetherBonus = Math.min(4, [...exercisesByWorkout.values()].filter((ids) => ids.has(exercise.id) && [...anchorIds].some((id) => ids.has(id))).length) * 2;
      const goalBonus = context.goals?.some((goal) => /strong/i.test(goal)) && detailsFor(exercise).mechanic === 'compound' ? 2
        : context.goals?.some((goal) => /muscle|bigger/i.test(goal)) ? primary.length
          : context.goals?.some((goal) => /lean|lose fat|health|fitness/i.test(goal)) && (detailsFor(exercise).mechanic === 'compound' || exercise.equipment === 'body only') ? 1 : 0;
      const cohortBonus = cohortCoverage ? Math.min(2, primary.reduce((sum, muscle) => sum + Math.max(0, Math.min(1, cohortCoverage[muscle] ?? 0)), 0)) : 0;
      const equipmentBonus = Math.min(equipmentWorkouts.get(exercise.equipment)?.size ?? 0, 3) * 2;
      // Catalog featured movements are approachable anchors for a lifter with
      // no history; personal continuity naturally outweighs this over time.
      const wasRejected = exerciseFeedback.some(({ action, workoutId: id, createdAt }) => action === 'removed' || action === 'replaced' || (action === 'skipped' && (impressions.get(id)?.getTime() ?? Infinity) <= createdAt.getTime()));
      const featuredBonus = exercise.isFeatured && !history.length && !wasRejected ? 8 : exercise.isFeatured ? 1 : 0;
      const favoritePrior = favoriteExerciseIds.has(exercise.id) ? Math.max(0, 10 * Math.pow(.5, (sessions.length + exerciseFeedback.filter(({ action }) => action === 'manual').length) / 6) + rejectionPreference) : 0;
      const preference = sessionPreference + progressionPreference + manualPreference + favoritePrior + rejectionPreference;
      const score = sessionNeed * 18 + weeklyNeed * 2 + patternBonus + preference + skipPenalty + togetherBonus + goalBonus + cohortBonus + equipmentBonus + featuredBonus - recoveryPenalty - redundantExercises * 5;
      const mostNeeded = primary.sort((a, b) => (sessionDose.get(a) ?? 0) - (sessionDose.get(b) ?? 0))[0] ?? split;
      return { exercise, dose, pattern, score, prescription, reason: fatigue >= moderateFatigue ? `Lower volume while your ${labelMuscle(mostNeeded)} recovers` : favoritePrior ? 'One of your favorites' : sessionNeed > 0 ? `Build your ${labelMuscle(mostNeeded)} work` : weeklyNeed > 0 ? `Support this week's ${labelMuscle(mostNeeded)} work` : 'Continue your recent training pattern' };
    }).sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
    const winner = ranked.find((item) => item.score > 0 && item.prescription.estimatedMinutes <= remainingMinutes); if (!winner) break;
    suggested.push({ exercise: winner.exercise, reason: winner.reason, score: winner.score, ...winner.prescription });
    winner.dose.forEach((amount, muscle) => { const plannedDose = amount * winner.prescription.sets; sessionDose.set(muscle, (sessionDose.get(muscle) ?? 0) + plannedDose); weeklyDose.set(muscle, (weeklyDose.get(muscle) ?? 0) + plannedDose); });
    remainingMinutes -= winner.prescription.estimatedMinutes;
    sessionPatterns.add(winner.pattern); candidates.splice(candidates.indexOf(winner.exercise), 1);
  }
  return suggested;
}
