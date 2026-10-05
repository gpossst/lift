import type { Exercise } from '@/db/exercise-catalog';
import { getRankedExercises, resolveExercisePrescription, getProgressiveOverloadRecommendation as recommend, type ProgressiveOverloadSet } from './exercise-recommendations';

function equal<T>(actual: T, expected: T) { if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`); }
function deepEqual(actual: unknown, expected: unknown) { equal(JSON.stringify(actual), JSON.stringify(expected)); }
const now = new Date('2026-09-07T12:00:00Z');
const getProgressiveOverloadRecommendation: typeof recommend = (history, prescription, options) => recommend(history, prescription, { now, ...options });
const bench: Exercise = { id: 'bench', name: 'Bench Press', area: 'TEST', mark: 'TE', color: '#000', equipment: 'barbell', isFeatured: 0,
  detailsJson: JSON.stringify({ primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'], mechanic: 'compound', category: 'strength', level: 'beginner' }) };
const malformed = { ...bench, detailsJson: 'null' };
const session = (workoutId: string, daysAgo: number, weight: number, reps: number[]) => reps.map((reps, index) => ({
  exerciseId: bench.id, workoutId, weight, reps, setNumber: index + 1, completedAt: new Date(now.getTime() - daysAgo * 86_400_000),
}));
const ramp: ProgressiveOverloadSet[] = [80, 90, 100].map((weight, index) => ({ ...session('ramp', 1, weight, [8])[0]!, setNumber: index + 1 }));
const todaySet = { ...session('today', 0, 80, [8])[0]! };
const currentOptions = { currentWorkoutId: 'today', setNumber: 2 };

// All exercise entry paths resolve the planner's prescription, without route overrides.
for (const context of [
  {}, { goals: ['Get stronger'], experience: 'new' as const, trainingDays: 2 },
  { goals: ['Build muscle'], experience: 'experienced' as const, trainingDays: 5 },
]) {
  for (const exhaustion of [undefined, 2]) {
    const ratings = exhaustion === undefined ? [] : [{ workoutId: 'recovery', split: 'push', muscle: 'chest', exhaustion, completedAt: now }];
    const recommendation = getRankedExercises([bench], [], ratings, 'today', 'push', now, context)[0]!;
    const prescription = resolveExercisePrescription(bench, context, exhaustion);
    deepEqual({ sets: recommendation.sets, reps: recommendation.reps, restSeconds: recommendation.restSeconds, estimatedMinutes: recommendation.estimatedMinutes }, prescription);
  }
}
deepEqual(resolveExercisePrescription(bench, { goals: ['Get stronger'], experience: 'new', trainingDays: 2 }), {
  sets: 3, reps: { min: 4, max: 6 }, restSeconds: 180, estimatedMinutes: 13,
});
deepEqual(resolveExercisePrescription(malformed), {
  sets: 2, reps: { min: 10, max: 15 }, restSeconds: 75, estimatedMinutes: 6,
});

// Goal transitions rebase historical weighted reps without increasing load from an old ceiling.
const strengthPrescription = resolveExercisePrescription(bench, { goals: ['Get stronger'] });
const musclePrescription = resolveExercisePrescription(bench, { goals: ['Build muscle'] });
for (const setNumber of [undefined, 1, 2, 3, 4]) {
  const strength = getProgressiveOverloadRecommendation(session('muscle-goal', 1, 100, [12, 12, 12]), strengthPrescription, { setNumber });
  equal(strength.weight, 100);
  equal(strength.reps, 6);
  equal(strength.action, 'retain');
  const muscle = getProgressiveOverloadRecommendation(session('strength-goal', 1, 100, [4, 5, 6]), musclePrescription, { setNumber });
  equal(muscle.weight, 100);
  equal(muscle.reps, 8);
  equal(muscle.action, 'retain');
}
const transitionedRamp = ramp.map((item, index) => ({ ...item, reps: [12, 10, 8][index] }));
for (const previous of transitionedRamp) {
  const recommendation = getProgressiveOverloadRecommendation(transitionedRamp, strengthPrescription, { setNumber: previous.setNumber });
  equal(recommendation.weight, previous.weight);
  equal(recommendation.reps, 6);
}
const explicitTransitionAdjustment = getProgressiveOverloadRecommendation([
  ...session('muscle-goal', 1, 100, [12, 12, 12]), { ...todaySet, weight: 95, reps: 9 },
], strengthPrescription, currentOptions);
equal(explicitTransitionAdjustment.weight, 95);
equal(explicitTransitionAdjustment.reps, 9);
equal(getProgressiveOverloadRecommendation(session('strength-top', 1, 100, [6, 6, 6]), strengthPrescription).weight, 105);
equal(getProgressiveOverloadRecommendation(session('old-goal', 1, 100, [12, 12, 12]), strengthPrescription, { exhaustion: 4 }).action, 'deload');

console.log('Exercise prescription tests passed');
