import { exerciseCatalog, exerciseRequiresWeight, type Exercise } from '@/db/exercise-catalog';
import { getExerciseRecommendations, getProgressiveOverloadRecommendation, getRecommendedWorkoutSplit, type RecommendationFeedback, type RecommendationSet } from './exercise-recommendations';

function assert(condition: unknown, message = 'assertion failed'): asserts condition { if (!condition) throw new Error(message); }
function equal<T>(actual: T, expected: T) { assert(actual === expected, `expected ${String(expected)}, got ${String(actual)}`); }
function deepEqual(actual: unknown, expected: unknown) { equal(JSON.stringify(actual), JSON.stringify(expected)); }

const now = new Date('2026-09-07T12:00:00Z');
assert(!exerciseRequiresWeight({ equipment: 'body only' }), 'body-only exercises should not require weight');
assert(exerciseRequiresWeight({ equipment: 'barbell' }), 'weighted exercises should still require weight');
const exercise = (id: string, name: string, primary: string[], secondary: string[] = [], category = 'strength'): Exercise => ({
  id, name, area: 'TEST', mark: 'TE', color: '#000', equipment: 'barbell', isFeatured: 0,
  detailsJson: JSON.stringify({ primaryMuscles: primary, secondaryMuscles: secondary, category, level: 'beginner', mechanic: 'compound' }),
});
const bench = exercise('bench', 'Bench Press', ['chest'], ['shoulders', 'triceps']);
const shoulderPress = exercise('shoulder', 'Shoulder Press', ['shoulders'], ['triceps']);
const pushdown = exercise('pushdown', 'Triceps Pushdown', ['triceps']);
const bodyPushdown = { ...pushdown, id: 'body-pushdown', equipment: 'body only' };
const fly = exercise('fly', 'Chest Fly', ['chest']);
const squat = exercise('squat', 'Barbell Squat', ['quadriceps'], ['glutes']);
const deadlift = exercise('deadlift', 'Deadlift', ['hamstrings'], ['glutes', 'lower back']);
const stretch = exercise('stretch', 'Quad Stretch', ['quadriceps'], [], 'stretching');
const jump = exercise('jump', 'Box Jump', ['quadriceps'], [], 'plyometrics');
const carry = exercise('carry', 'Farmer Carry', ['forearms'], [], 'strongman');
const plank = exercise('plank', 'Plank', ['abdominals']);
const expertPush = { ...bench, id: 'expert-push', detailsJson: JSON.stringify({ primaryMuscles: ['chest'], secondaryMuscles: [], category: 'strength', level: 'expert', mechanic: 'compound' }) };
const malformed = { ...squat, id: 'malformed', detailsJson: 'null' };
const set = (exerciseId: string, workoutId: string, daysAgo = 0, weight = 100, reps = 8): RecommendationSet => ({
  exerciseId, workoutId, weight, reps, completedAt: new Date(now.getTime() - daysAgo * 86_400_000),
});
const feedback = (exerciseId: string, action: RecommendationFeedback['action'], daysAgo: number, workoutId = `feedback-${daysAgo}`): RecommendationFeedback => ({
  workoutId, exerciseId, action, createdAt: new Date(now.getTime() - daysAgo * 86_400_000),
});

equal(getRecommendedWorkoutSplit([], now), 'push');
equal(getRecommendedWorkoutSplit([{ split: 'push', completedAt: now, sets: 8 }], now), 'pull');
equal(getRecommendedWorkoutSplit([
  { split: 'push', completedAt: now, sets: 8 },
  { split: 'pull', completedAt: new Date(now.getTime() - 86_400_000), sets: 8 },
], now), 'legs');
const crossSplitFatigue = [{ workoutId: 'legs', split: 'legs' as const, muscle: 'shoulders', exhaustion: 4, completedAt: now }];
equal(getRecommendedWorkoutSplit([], now, crossSplitFatigue), 'pull');

const freshLegs = getExerciseRecommendations([squat, deadlift, stretch], [], [], 'today', 'legs', 3, now);
deepEqual(freshLegs.map((item) => item.exercise.id).sort(), ['deadlift', 'squat']);
equal(getExerciseRecommendations([malformed, stretch], [], [], 'today', 'legs', 3, now).length, 0);
equal(getExerciseRecommendations([expertPush], [], [], 'today', 'push', 1, now).length, 0);
equal(getExerciseRecommendations([expertPush], [], [], 'today', 'push', 1, now, { experience: 'experienced' }).length, 1);
equal(getExerciseRecommendations([jump], [], [], 'today', 'legs', 1, now).length, 0);
equal(getExerciseRecommendations([jump], [], [], 'today', 'legs', 1, now, { goals: ['Get lean'] }).length, 1);
equal(getExerciseRecommendations([carry], [], [], 'today', 'pull', 1, now).length, 0);
equal(getExerciseRecommendations([carry], [], [], 'today', 'pull', 1, now, { experience: 'experienced' }).length, 1);

const afterBench = getExerciseRecommendations([bench, shoulderPress, pushdown, fly], [set('bench', 'today')], [], 'today', 'push', 2, now);
deepEqual(afterBench.map((item) => item.exercise.id).sort(), ['pushdown', 'shoulder']);
const yesterdayBench = [set('bench', 'yesterday', 1), set('bench', 'yesterday', 1), set('bench', 'yesterday', 1)];
equal(getExerciseRecommendations([fly, shoulderPress, bench], yesterdayBench, [], 'today', 'push', 1, now, { excludedExerciseIds: ['bench'] })[0]?.exercise.id, 'shoulder');

const excludedCannotCover = getExerciseRecommendations([bench, shoulderPress, pushdown], [set('bench', 'today')], [], 'today', 'push', 2, now, { excludedExerciseIds: ['shoulder'] });
equal(excludedCannotCover[0]?.exercise.id, 'pushdown');
deepEqual(getExerciseRecommendations([pushdown, bodyPushdown], [], [], 'today', 'push', 2, now).map((item) => item.exercise.id).sort(), ['body-pushdown', 'pushdown']);

const progressingBench = Array.from({ length: 6 }, (_, index) => set('bench', `old-${index}`, 10 - index, 100 + index * 10));
const continuity = getExerciseRecommendations([bench, fly], progressingBench, [], 'today', 'push', 1, now);
equal(continuity[0]?.exercise.id, 'bench');
equal(
  getExerciseRecommendations([bench], [...progressingBench].reverse(), [], 'today', 'push', 1, now)[0]!.score,
  getExerciseRecommendations([bench], progressingBench, [], 'today', 'push', 1, now)[0]!.score,
);

const baselineFly = getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now)[0]!.score;
const completedFly = getExerciseRecommendations([fly], [set('fly', 'one', 8), set('fly', 'two', 9), set('fly', 'three', 10)], [], 'today', 'push', 1, now)[0]!.score;
assert(completedFly > baselineFly, 'repeatedly completed exercises should gain continuity');
const oneVisitFly = getExerciseRecommendations([fly], Array.from({ length: 6 }, () => set('fly', 'one', 8)), [], 'today', 'push', 1, now)[0]!.score;
assert(oneVisitFly <= completedFly, 'many sets in one visit should not look like more completed workouts');
equal(oneVisitFly, getExerciseRecommendations([fly], [set('fly', 'one', 8)], [], 'today', 'push', 1, now)[0]!.score);
assert(
  getExerciseRecommendations([fly], [set('fly', 'recent', 8)], [], 'today', 'push', 1, now)[0]!.score
    > getExerciseRecommendations([fly], [set('fly', 'old', 80)], [], 'today', 'push', 1, now)[0]!.score,
  'recent sessions should provide more preference evidence than old sessions',
);
const legacyFeedbackFly = getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, [feedback('fly', 'accepted', 2), feedback('fly', 'completed', 4)])[0]!.score;
equal(legacyFeedbackFly, baselineFly);

const cableFly = { ...fly, id: 'cable-fly', name: 'Cable Fly' };
const dumbbellFly = { ...fly, id: 'dumbbell-fly', name: 'Dumbbell Fly', equipment: 'dumbbell' };
const cablePushdown = { ...pushdown, id: 'cable-pushdown', equipment: 'cable' };
const familiarEquipment = getExerciseRecommendations(
  [{ ...cableFly, equipment: 'cable' }, dumbbellFly, cablePushdown],
  [set('cable-pushdown', 'equipment-history', 30)], [], 'today', 'push', 1, now,
  { excludedExerciseIds: ['cable-pushdown'] },
);
equal(familiarEquipment[0]!.exercise.id, 'cable-fly');
const rejectionHistory = [feedback('fly', 'removed', 2), feedback('fly', 'removed', 4), feedback('cable-fly', 'impression', 2), feedback('cable-fly', 'skipped', 2)];
const rejected = getExerciseRecommendations([fly, cableFly], [], [], 'today', 'push', 2, now, {}, rejectionHistory);
assert(rejected.find((item) => item.exercise.id === 'fly')!.score < rejected.find((item) => item.exercise.id === 'cable-fly')!.score, 'removals should penalize more than skips');
assert(rejected.every((item) => item.score < getExerciseRecommendations([fly, cableFly], [], [], 'today', 'push', 2, now).find((baseline) => baseline.exercise.id === item.exercise.id)!.score), 'removed and skipped exercises should lose rank');
equal(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, [feedback('fly', 'skipped', 2)])[0]!.score, baselineFly);
const featuredFly = { ...fly, id: 'featured-fly', isFeatured: 1 };
equal(getExerciseRecommendations([featuredFly, fly], [], [], 'today', 'push', 1, now, {}, [feedback('featured-fly', 'removed', 2)])[0]!.exercise.id, 'fly');
equal(getExerciseRecommendations([featuredFly, fly], [], [], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] })[0]!.exercise.id, 'fly');
equal(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] })[0]!.reason, 'One of your favorites');
equal(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] })[0]!.score - baselineFly, 10);
assert(getExerciseRecommendations([fly], [set('fly', 'favorite-1', 8), set('fly', 'favorite-2', 9), set('fly', 'favorite-3', 10)], [], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] })[0]!.score > baselineFly + 10, 'regular completion should strengthen a favorite beyond its prior');
const rejectedFavorite = [feedback('fly', 'replaced', 2), feedback('fly', 'removed', 4), feedback('fly', 'replaced', 6)];
equal(
  getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] }, rejectedFavorite)[0]!.score,
  getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, rejectedFavorite)[0]!.score,
);
equal(getExerciseRecommendations([fly, shoulderPress], [], [{ workoutId: 'recent', split: 'push', muscle: 'chest', exhaustion: 5, completedAt: now }], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] })[0]!.exercise.id, 'shoulder');

const manualFly = getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, [feedback('fly', 'manual', 2)])[0]!.score;
assert(manualFly > baselineFly, 'manually added exercises should gain rank');
const threeManual = Array.from({ length: 3 }, (_, index) => feedback('fly', 'manual', index + 1, `manual-${index}`));
const sixManual = Array.from({ length: 6 }, (_, index) => feedback('fly', 'manual', index + 1, `manual-${index}`));
equal(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, threeManual)[0]!.score, getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, sixManual)[0]!.score);
assert(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, [feedback('fly', 'manual', 2)])[0]!.score > getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, [feedback('fly', 'manual', 62)])[0]!.score, 'recent feedback should outweigh old feedback');
assert(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, [feedback('fly', 'removed', 2)])[0]!.score < getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, [feedback('fly', 'removed', 62)])[0]!.score, 'recent removals should outweigh old removals');
const trainedTogether = getExerciseRecommendations(
  [bench, fly, cableFly],
  [set('bench', 'today'), set('bench', 'paired', 8), set('fly', 'paired', 8), set('cable-fly', 'solo', 8)],
  [], 'today', 'push', 2, now,
);
assert(trainedTogether.find((item) => item.exercise.id === 'fly')!.score > trainedTogether.find((item) => item.exercise.id === 'cable-fly')!.score, 'exercises frequently trained with the current workout should gain rank');

const noContext = getExerciseRecommendations([bench, shoulderPress], [], [], 'today', 'push', 2, now);
const emptyContext = getExerciseRecommendations([bench, shoulderPress], [], [], 'today', 'push', 2, now, {});
deepEqual(noContext, emptyContext);
const oldRating = [{ workoutId: 'old', split: 'push' as const, muscle: 'shoulders', exhaustion: 5, completedAt: new Date(now.getTime() - 21 * 86_400_000) }];
deepEqual(noContext, getExerciseRecommendations([bench, shoulderPress], [], oldRating, 'today', 'push', 2, now));
deepEqual(noContext, getExerciseRecommendations([bench, shoulderPress], [set('shoulder', 'future', -1)], [], 'today', 'push', 2, now));
const crossSplitRating = [{ workoutId: 'legs-yesterday', split: 'legs' as const, muscle: 'shoulders', exhaustion: 5, completedAt: new Date(now.getTime() - 86_400_000) }];
assert(getExerciseRecommendations([shoulderPress], [], crossSplitRating, 'today', 'push', 1, now)[0]!.score < getExerciseRecommendations([shoulderPress], [], [], 'today', 'push', 1, now)[0]!.score, 'overlapping muscle fatigue should cross split labels');
const severeChest = [{ workoutId: 'pull-today', split: 'pull' as const, muscle: 'chest', exhaustion: 4, completedAt: now }];
equal(getExerciseRecommendations([fly], [], severeChest, 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] }).length, 0);
const severeLowerBack = [{ workoutId: 'pull-today', split: 'pull' as const, muscle: 'lower back', exhaustion: 4, completedAt: now }];
equal(getExerciseRecommendations([deadlift], [], severeLowerBack, 'today', 'legs', 1, now).length, 0);
const moderateLowerBack = [{ ...severeLowerBack[0]!, exhaustion: 3 }];
equal(getExerciseRecommendations([deadlift], [], moderateLowerBack, 'today', 'legs', 1, now)[0]!.sets, 2);
const moderateShoulders = [{ workoutId: 'legs-yesterday', split: 'legs' as const, muscle: 'shoulders', exhaustion: 4, completedAt: new Date(now.getTime() - 86_400_000) }];
const recoveredShoulders = [{ ...moderateShoulders[0]!, completedAt: new Date(now.getTime() - 7 * 86_400_000) }];
equal(getExerciseRecommendations([shoulderPress], [], moderateShoulders, 'today', 'push', 1, now)[0]!.sets, 2);
deepEqual(getExerciseRecommendations([shoulderPress], [], recoveredShoulders, 'today', 'push', 1, now), getExerciseRecommendations([shoulderPress], [], [], 'today', 'push', 1, now));

const coreWithoutHistory = getExerciseRecommendations([plank], [], [], 'today', 'push', 1, now)[0]!;
const coreWithPullHistory = getExerciseRecommendations([plank], [set('plank', 'pull-last-week', 2, 0, 30)], [], 'today', 'push', 1, now)[0]!;
assert(coreWithPullHistory.score < coreWithoutHistory.score, 'core work should count across splits');
const cohortBase = getExerciseRecommendations([shoulderPress], [], [], 'today', 'push', 1, now);
deepEqual(cohortBase, getExerciseRecommendations([shoulderPress], [], [], 'today', 'push', 1, now, { cohortHints: { optIn: false, peerCount: 10, muscleCoverage: { shoulders: 1 } } }));
deepEqual(cohortBase, getExerciseRecommendations([shoulderPress], [], [], 'today', 'push', 1, now, { cohortHints: { optIn: true, peerCount: 4, muscleCoverage: { shoulders: 1 } } }));
assert(getExerciseRecommendations([shoulderPress], [], [], 'today', 'push', 1, now, { cohortHints: { optIn: true, peerCount: 5, muscleCoverage: { shoulders: 1 } } })[0]!.score > cohortBase[0]!.score);

const shortWorkout = getExerciseRecommendations([bench, shoulderPress, pushdown, fly], [], [], 'today', 'push', Infinity, now, { sessionMinutes: 15 });
assert(shortWorkout.reduce((minutes, item) => minutes + item.estimatedMinutes, 0) <= 15, 'recommendations should fit the session');
assert(shortWorkout.every((item) => item.sets > 0 && item.reps.min <= item.reps.max && item.restSeconds > 0), 'every recommendation should include a prescription');
const plannedChestDose = getExerciseRecommendations([bench, fly], [], [], 'today', 'push', 2, now, { sessionMinutes: 60 });
equal(plannedChestDose.length, 2);
assert(plannedChestDose.reduce((total, item) => total + item.sets, 0) >= 6, 'multiple chest exercises should reserve their planned sets');

const defaultPrescription = { sets: 3, reps: { min: 6, max: 10 } };
deepEqual(getProgressiveOverloadRecommendation([], defaultPrescription), {
  reps: 6, sets: 3, action: 'start', reason: 'Start conservatively and choose a comfortable weight',
});
const session = (workoutId: string, daysAgo: number, weight: number, reps: number[], exerciseId = 'bench') => reps.map((count) => set(exerciseId, workoutId, daysAgo, weight, count));
deepEqual(getProgressiveOverloadRecommendation(session('top', 1, 100, [10, 10, 10]), defaultPrescription), {
  weight: 105, reps: 6, sets: 3, action: 'increase', reason: 'Increase the load after reaching the top of the rep range',
});
deepEqual(getProgressiveOverloadRecommendation([
  ...session('miss-1', 2, 100, [5, 5, 5]), ...session('miss-2', 1, 100, [5, 4, 5]),
], defaultPrescription), {
  weight: 90, reps: 6, sets: 3, action: 'reduce', reason: 'Reduce the load after repeatedly missing the rep range',
});
deepEqual(getProgressiveOverloadRecommendation([
  ...session('steady-1', 2, 100, [8, 8, 8]), ...session('steady-2', 1, 100, [8, 8, 8]),
], defaultPrescription), {
  weight: 100, reps: 8, sets: 3, action: 'retain', reason: 'Keep the current prescription while performance is stable',
});
deepEqual(getProgressiveOverloadRecommendation(session('steady', 1, 100, [8, 8, 8]), defaultPrescription, { exhaustion: 2.5 }), {
  weight: 90, reps: 6, sets: 2, action: 'reduce', reason: 'Reduce load and volume while the muscles involved recover',
});
deepEqual(getProgressiveOverloadRecommendation([
  ...session('decline-1', 3, 100, [10, 10, 10]), ...session('decline-2', 2, 100, [9, 9, 9]), ...session('decline-3', 1, 100, [8, 8, 8]),
], defaultPrescription, { exhaustion: 4 }), {
  weight: 85, reps: 6, sets: 2, action: 'deload', reason: 'Take a lighter session after sustained decline and high exhaustion',
});
deepEqual(
  getProgressiveOverloadRecommendation([
    ...session('decline-3', 1, 100, [8, 8, 8]), ...session('decline-1', 3, 100, [10, 10, 10]), ...session('decline-2', 2, 100, [9, 9, 9]),
  ], defaultPrescription, { exhaustion: 4 }),
  getProgressiveOverloadRecommendation([
    ...session('decline-1', 3, 100, [10, 10, 10]), ...session('decline-2', 2, 100, [9, 9, 9]), ...session('decline-3', 1, 100, [8, 8, 8]),
  ], defaultPrescription, { exhaustion: 4 }),
);
deepEqual(getProgressiveOverloadRecommendation(session('top', 1, 100, [6, 6, 6]), { sets: 3, reps: { min: 4, max: 6 } }), {
  weight: 105, reps: 4, sets: 3, action: 'increase', reason: 'Increase the load after reaching the top of the rep range',
});

for (const split of ['push', 'pull', 'legs'] as const) {
  const fresh = getExerciseRecommendations(exerciseCatalog, [], [], 'today', split, 3, now);
  assert(fresh[0]?.exercise.isFeatured === 1, `${split} should start with an approachable catalog anchor`);
  assert(fresh.every(({ exercise: item }) => {
    const details = JSON.parse(item.detailsJson ?? '{}');
    return details.category !== 'stretching' && details.category !== 'cardio' && details.category !== 'strongman' && details.level !== 'expert';
  }), `${split} defaults should avoid mobility, cardio, strongman, and expert movements`);
}
