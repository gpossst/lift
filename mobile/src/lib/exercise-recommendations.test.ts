import { exerciseCatalog, exerciseRequiresWeight, type Exercise } from '@/db/exercise-catalog';
import { getExerciseRecommendations, getRankedExercises, getProgressiveOverloadRecommendation as recommendProgressiveOverload, getProgressiveOverloadLoadOptions, getRecommendedWorkoutSplit, type RecommendationFeedback, type RecommendationSet } from './exercise-recommendations';

function assert(condition: unknown, message = 'assertion failed'): asserts condition { if (!condition) throw new Error(message); }
function equal<T>(actual: T, expected: T) { assert(actual === expected, `expected ${String(expected)}, got ${String(actual)}`); }
function deepEqual(actual: unknown, expected: unknown) { equal(JSON.stringify(actual), JSON.stringify(expected)); }

const now = new Date('2026-09-07T12:00:00Z');
const getProgressiveOverloadRecommendation: typeof recommendProgressiveOverload = (history, prescription, options) => recommendProgressiveOverload(history, prescription, { now, ...options });
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
const crossSplitFatigue = [{ workoutId: 'legs', split: 'legs' as const, muscle: 'shoulders', exhaustion: 8, completedAt: now }];
equal(getRecommendedWorkoutSplit([], now, crossSplitFatigue), 'pull');
const customUpper = { id: 'custom:upper', name: 'Upper', muscles: ['chest', 'lats'] };
const customLower = { id: 'custom:lower', name: 'Lower', muscles: ['quadriceps', 'hamstrings'] };
equal(getRecommendedWorkoutSplit([{ split: customUpper.id, completedAt: now, sets: 8 }], now, [], [customUpper, customLower]), customLower.id);
deepEqual(getExerciseRecommendations([bench, squat, deadlift], [], [], 'today', customUpper.id, 3, now, {}, [], customUpper).map((item) => item.exercise.id), ['bench']);
deepEqual(getExerciseRecommendations([bench, plank], [], [], 'today', customUpper.id, 3, now, {}, [], customUpper).map((item) => item.exercise.id), ['bench']);

const freshLegs = getExerciseRecommendations([squat, deadlift, stretch], [], [], 'today', 'legs', 3, now);
deepEqual(freshLegs.map((item) => item.exercise.id).sort(), ['deadlift', 'squat']);
equal(getExerciseRecommendations([malformed, stretch], [], [], 'today', 'legs', 3, now).length, 0);
equal(getExerciseRecommendations([expertPush], [], [], 'today', 'push', 1, now).length, 0);
equal(getExerciseRecommendations([expertPush], [], [], 'today', 'push', 1, now, { experience: 'experienced' }).length, 1);
equal(getExerciseRecommendations([jump], [], [], 'today', 'legs', 1, now).length, 0);
equal(getExerciseRecommendations([jump], [], [], 'today', 'legs', 1, now, { goals: ['Get lean'] }).length, 1);
equal(getExerciseRecommendations([carry], [], [], 'today', 'pull', 1, now).length, 0);
equal(getExerciseRecommendations([carry], [], [], 'today', 'pull', 1, now, { experience: 'experienced' }).length, 1);
// Logged work counts toward the session even when the planner would not suggest it.
equal(getExerciseRecommendations([expertPush, fly], [1, 2, 3].map(() => set('expert-push', 'today')), [], 'today', 'push', 3, now, { sessionMinutes: 30 }).length, 0);
// Accumulated fractional dose must not make the plan depend on set order.
const lateral = exercise('lateral', 'Lateral Raise', ['shoulders']);
const pressSets = [1, 2, 3, 4].map(() => set('shoulder', 'today')); const benchSets = Array.from({ length: 20 }, () => set('bench', 'today'));
for (const logged of [[...pressSets, ...benchSets], [...benchSets, ...pressSets]]) {
  deepEqual(getExerciseRecommendations([bench, shoulderPress, lateral], logged, [], 'today', 'push', 3, now, { sessionMinutes: 120 }).map((item) => `${item.exercise.id}x${item.sets}`), ['lateralx1']);
}

const afterBench = getExerciseRecommendations([bench, shoulderPress, pushdown, fly], [set('bench', 'today')], [], 'today', 'push', 2, now);
deepEqual(afterBench.map((item) => item.exercise.id).sort(), ['fly', 'shoulder']);

// Equivalent patterns must produce the same diversity bonus and redundancy
// penalty, both for catalog metadata and older/custom rows without it.
const withPattern = (item: Exercise, movementPattern: unknown): Exercise => ({
  ...item, detailsJson: JSON.stringify({ ...JSON.parse(item.detailsJson!), movementPattern }),
});
const patternScore = (item: Exercise, anchor: Exercise, split: string) => getRankedExercises(
  [anchor, item], [set(anchor.id, 'today')], [], 'today', split, now, { experience: 'experienced' }, [],
  { id: split, name: split, muscles: ['chest', 'shoulders', 'triceps', 'lats', 'middle back'] },
).find((result) => result.exercise.id === item.id)!.score;
const row = exercise('row', 'Cable Row', ['lats']);
const pullup = exercise('pullup', 'Pull-Up', ['lats']);
for (const [name, pattern, anchors] of [
  ['Seated Dumbbell Press', 'vertical press', [bench, shoulderPress]],
  ['Arnold Dumbbell Press', 'vertical press', [bench, shoulderPress]],
  ['Chin-Up', 'vertical pull', [row, pullup]],
  ['Chin Ups', 'vertical pull', [row, pullup]],
] as const) {
  const item = exercise(`test:${name}`, name, pattern === 'vertical press' ? ['shoulders'] : ['lats']);
  for (const anchor of anchors) for (const split of ['push', 'pull', 'custom:upper']) {
    equal(patternScore(item, anchor, split), patternScore(withPattern(item, pattern), anchor, split));
    equal(patternScore(withPattern(item, 'invalid'), anchor, split), patternScore(item, anchor, split));
    equal(patternScore(withPattern(item, null), anchor, split), patternScore(item, anchor, split));
  }
}
for (const [sourceId, pattern, anchor] of [
  ['Seated_Dumbbell_Press', 'vertical press', shoulderPress],
  ['Arnold_Dumbbell_Press', 'vertical press', shoulderPress],
  ['Chin-Up', 'vertical pull', pullup],
] as const) {
  const item = exerciseCatalog.find((candidate) => candidate.id === `free_exercise_db:${sourceId}`)!;
  equal(JSON.parse(item.detailsJson!).movementPattern, pattern);
  // An ambiguous name must not override the catalog's explicit classification.
  equal(patternScore({ ...item, name: 'Bench Press' }, anchor, 'custom:upper'), patternScore(item, anchor, 'custom:upper'));
}
const mislabeledBench = withPattern(bench, 'vertical press');
assert(patternScore(mislabeledBench, shoulderPress, 'push') < patternScore(bench, shoulderPress, 'push'), 'explicit metadata should control redundancy even when the name suggests another pattern');
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
assert(Math.abs(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] })[0]!.score - baselineFly - 2) < 1e-10, 'saved preferences add a 20-point prior');
assert(getExerciseRecommendations([fly], [set('fly', 'favorite-1', 8), set('fly', 'favorite-2', 9), set('fly', 'favorite-3', 10)], [], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] })[0]!.score > baselineFly + 2, 'regular completion should strengthen a favorite beyond its prior');
const rejectedFavorite = [feedback('fly', 'replaced', 2), feedback('fly', 'removed', 4), feedback('fly', 'replaced', 6)];
equal(
  getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] }, rejectedFavorite)[0]!.score,
  getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, {}, rejectedFavorite)[0]!.score,
);
equal(getExerciseRecommendations([fly, shoulderPress], [], [{ workoutId: 'recent', split: 'push', muscle: 'chest', exhaustion: 10, completedAt: now }], 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] })[0]!.exercise.id, 'shoulder');

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

// Preference evidence decays with a fixed clock, including bonuses and prior fading.
const rawPreferenceScore = (history: RecommendationSet[] = [], events: RecommendationFeedback[] = [], favorite = false, item = fly) => {
  const result = getRankedExercises([item, { ...bench, equipment: 'body only' }], history, [], 'today', 'push', now, { favoriteExerciseIds: favorite ? [item.id] : [] }, events).find(({ exercise }) => exercise.id === item.id)!;
  return result.score * result.estimatedMinutes;
};
const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-10, `expected approximately ${expected}, got ${actual}`);
// Removing an exercise in the active workout lowers it right away.
assert(rawPreferenceScore([], [feedback('fly', 'removed', 0, 'today')]) < rawPreferenceScore(), 'current-workout removal should apply immediately');
// A swipe skip without a rank inherits the rank of its impression.
{
  const impression = { ...feedback('fly', 'impression', 1), rank: 3 }; const skip = feedback('fly', 'skipped', 1);
  close(rawPreferenceScore([], [impression, skip]), rawPreferenceScore([], [impression, { ...skip, rank: 3 }]));
  assert(rawPreferenceScore([], [impression, skip]) > rawPreferenceScore([], [impression, { ...skip, rank: 1 }]), 'rank-three skip should cost less than rank one');
}
const ancientDays = (now.getTime() - new Date('2020-01-01T12:00:00Z').getTime()) / 86_400_000;
const pairedBonus = (daysAgo: number, copies = 1) => {
  const pairs = Array.from({ length: copies }, (_, index) => [set('fly', `pair-${index}`, daysAgo), set('bench', `pair-${index}`, daysAgo)]).flat();
  const unpaired = pairs.map((item) => item.exerciseId === 'bench' ? { ...item, workoutId: `solo-${item.workoutId}` } : item);
  return rawPreferenceScore([set('bench', 'today'), ...pairs]) - rawPreferenceScore([set('bench', 'today'), ...unpaired]);
};
close(pairedBonus(8), 2 * Math.pow(.5, 8 / 30));
close(pairedBonus(38), pairedBonus(8) / 2);
close(pairedBonus(8, 10), 8);
close(pairedBonus(ancientDays, 10), 0);
const progressionBonus = (daysAgo: number) => {
  const progressing = [3, 2, 1].map((offset, index) => set('fly', `trend-${index}`, daysAgo + offset, 100 + index * 10));
  return rawPreferenceScore(progressing) - rawPreferenceScore(progressing.map((item) => ({ ...item, weight: 100 })));
};
assert(progressionBonus(8) > 0, 'recent progress should earn a bonus');
close(progressionBonus(38), progressionBonus(8) / 2);
close(progressionBonus(ancientDays), 0);
const staleProgress = [3, 2, 1].map((offset, index) => set('fly', `stale-${index}`, ancientDays + offset, 100 + index * 10));
close(rawPreferenceScore([...staleProgress, set('fly', 'return', 8, 150)]), rawPreferenceScore([...staleProgress.map((item) => ({ ...item, weight: 100 })), set('fly', 'return', 8, 150)]));
for (const action of ['removed', 'replaced', 'skipped'] as const) {
  const events = (daysAgo: number) => [feedback(featuredFly.id, 'impression', daysAgo), feedback(featuredFly.id, action, daysAgo)];
  const baseline = rawPreferenceScore([], [], false, featuredFly);
  close(rawPreferenceScore([], events(ancientDays), false, featuredFly), baseline);
  close(baseline - rawPreferenceScore([], events(30), false, featuredFly), (baseline - rawPreferenceScore([], events(0), false, featuredFly)) / 2);
}
close(rawPreferenceScore([], [feedback(featuredFly.id, 'skipped', 0)], false, featuredFly), rawPreferenceScore([], [], false, featuredFly));
close(rawPreferenceScore([set(featuredFly.id, 'ancient', ancientDays)], [], false, featuredFly), rawPreferenceScore([], [], false, featuredFly));
for (const source of ['sessions', 'manual'] as const) {
  const priorBonus = (daysAgo: number) => {
    const history = source === 'sessions' ? Array.from({ length: 6 }, (_, index) => set('fly', `prior-${index}`, daysAgo)) : [];
    const events = source === 'manual' ? Array.from({ length: 6 }, (_, index) => feedback('fly', 'manual', daysAgo, `prior-${index}`)) : [];
    return rawPreferenceScore(history, events, true) - rawPreferenceScore(history, events);
  };
  close(priorBonus(0), 10);
  close(priorBonus(30), 20 * Math.pow(.5, .5));
  close(priorBonus(ancientDays), 20);
}

const noContext = getExerciseRecommendations([bench, shoulderPress], [], [], 'today', 'push', 2, now);
const emptyContext = getExerciseRecommendations([bench, shoulderPress], [], [], 'today', 'push', 2, now, {});
deepEqual(noContext, emptyContext);
const oldRating = [{ workoutId: 'old', split: 'push' as const, muscle: 'shoulders', exhaustion: 10, completedAt: new Date(now.getTime() - 21 * 86_400_000) }];
deepEqual(noContext, getExerciseRecommendations([bench, shoulderPress], [], oldRating, 'today', 'push', 2, now));
deepEqual(noContext, getExerciseRecommendations([bench, shoulderPress], [set('shoulder', 'future', -1)], [], 'today', 'push', 2, now));
const crossSplitRating = [{ workoutId: 'legs-yesterday', split: 'legs' as const, muscle: 'shoulders', exhaustion: 10, completedAt: new Date(now.getTime() - 86_400_000) }];
assert(getRankedExercises([shoulderPress], [], crossSplitRating, 'today', 'push', now)[0]!.score < getExerciseRecommendations([shoulderPress], [], [], 'today', 'push', 1, now)[0]!.score, 'overlapping muscle fatigue should cross split labels');
const severeChest = [{ workoutId: 'pull-today', split: 'pull' as const, muscle: 'chest', exhaustion: 8, completedAt: now }];
equal(getExerciseRecommendations([fly], [], severeChest, 'today', 'push', 1, now, { favoriteExerciseIds: ['fly'] }).length, 0);
const severeLowerBack = [{ workoutId: 'pull-today', split: 'pull' as const, muscle: 'lower back', exhaustion: 8, completedAt: now }];
equal(getExerciseRecommendations([deadlift], [], severeLowerBack, 'today', 'legs', 1, now).length, 0);
const moderateLowerBack = [{ ...severeLowerBack[0]!, exhaustion: 5 }];
equal(getRankedExercises([deadlift], [], moderateLowerBack, 'today', 'legs', now)[0]!.sets, 2);
const moderateShoulders = [{ workoutId: 'legs-yesterday', split: 'legs' as const, muscle: 'shoulders', exhaustion: 8, completedAt: new Date(now.getTime() - 86_400_000) }];
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

// Score the prescription's marginal benefit per minute, rather than the whole deficit.
const isolationFly = { ...fly, id: 'isolation-fly', detailsJson: JSON.stringify({ primaryMuscles: ['chest'], mechanic: 'isolation' }) };
const doseRanking = getRankedExercises([fly, isolationFly], [], [], 'today', 'push', now);
const compoundDose = doseRanking.find(({ exercise: item }) => item.id === fly.id)!;
const isolationDose = doseRanking.find(({ exercise: item }) => item.id === isolationFly.id)!;
equal(compoundDose.score, (3 * 18 + 3 * 2 + 3) / compoundDose.estimatedMinutes);
equal(isolationDose.score, (2 * 18 + 2 * 2 + 3) / isolationDose.estimatedMinutes);
assert(isolationDose.score > compoundDose.score, 'a shorter prescription can deliver more benefit per minute despite fewer sets');
equal(getExerciseRecommendations([fly, isolationFly], [], [], 'today', 'push', 1, now)[0]!.exercise.id, isolationFly.id);
const strengthDose = getRankedExercises([fly], [], [], 'today', 'push', now, { goals: ['Get stronger'] })[0]!;
equal(strengthDose.score, (3 * 18 + 3 * 2 + 3 + 2) / strengthDose.estimatedMinutes);
assert(strengthDose.score < compoundDose.score, 'longer rest should reduce benefit per minute even with a goal bonus');
const secondaryDose = getRankedExercises([bench], [], [], 'today', 'push', now)[0]!;
assert(Math.abs(secondaryDose.score - compoundDose.score) < 1e-10, 'secondary tags do not inflate equally useful coverage');
const coveredChest = Array.from({ length: 4 }, () => set('fly', 'today'));
const remainingDose = getRankedExercises([fly], coveredChest, [], 'today', 'push', now)[0]!;
equal(remainingDose.score, (1 * 18 + 1 * 2) / remainingDose.estimatedMinutes);
const marginalPlan = getExerciseRecommendations([fly, isolationFly], [], [], 'today', 'push', 2, now);
equal(marginalPlan[1]!.score, (3 * 20 - 5) / marginalPlan[1]!.estimatedMinutes);
// Once only one set remains useful, extra prescribed sets get no credit.
const nearTarget = getRankedExercises([fly, isolationFly], coveredChest, [], 'today', 'push', now);
assert(nearTarget.find(({ exercise: item }) => item.id === isolationFly.id)!.score > remainingDose.score, 'shorter work should win near the target to reduce overshoot');

const shortWorkout = getExerciseRecommendations([bench, shoulderPress, pushdown, fly], [], [], 'today', 'push', Infinity, now, { sessionMinutes: 15 });
assert(shortWorkout.reduce((minutes, item) => minutes + item.estimatedMinutes, 0) <= 15, 'recommendations should fit the session');
assert(shortWorkout.every((item) => item.sets > 0 && item.reps.min <= item.reps.max && item.restSeconds > 0), 'every recommendation should include a prescription');
const plannedChestDose = getExerciseRecommendations([bench, fly], [], [], 'today', 'push', 2, now, { sessionMinutes: 60 });
equal(plannedChestDose.length, 2);
assert(plannedChestDose.reduce((total, item) => total + item.sets, 0) >= 6, 'multiple chest exercises should reserve their planned sets');
// Logged work uses the same rest, work, setup, and rounding as proposed work.
const timedIsolation = { ...shoulderPress, detailsJson: JSON.stringify({ primaryMuscles: ['shoulders'], mechanic: 'isolation' }) };
for (const { loggedExercise, goals, completedMinutes } of [
  { loggedExercise: bench, goals: ['Get stronger'], completedMinutes: 17 },
  { loggedExercise: bench, goals: [], completedMinutes: 13 },
  { loggedExercise: isolationFly, goals: ['Get stronger'], completedMinutes: 10 },
]) {
  const loggedSets = Array.from({ length: 4 }, () => set(loggedExercise.id, 'today'));
  const recommendWithin = (sessionMinutes: number) => getExerciseRecommendations(
    [loggedExercise, timedIsolation], loggedSets, [], 'today', 'push', Infinity, now, { goals, sessionMinutes },
  );
  const exactFit = recommendWithin(completedMinutes + 6);
  equal(exactFit.length, 1);
  equal(exactFit[0]!.estimatedMinutes, 6);
  equal(recommendWithin(completedMinutes + 5).length, 0);
}
// Weekly deficits and strong preferences must not push a session past eight chest sets.
const chestCatalog = Array.from({ length: 8 }, (_, index) => exercise(`chest-${index}`, `Chest Press ${index}`, ['chest']));
const chestContext = { sessionMinutes: 90, trainingDays: 3, favoriteExerciseIds: chestCatalog.map(({ id }) => id) };
const weeklyChestHistory = chestCatalog.slice(0, 3).map(({ id }, index) => set(id, `weekly-${index}`, 8 + index));
const cappedChest = getExerciseRecommendations(chestCatalog, weeklyChestHistory, [], 'today', 'push', Infinity, now, chestContext);
deepEqual(cappedChest.map(({ sets }) => sets), [3, 3, 2]);
equal(cappedChest.reduce((total, item) => total + item.sets, 0), 8);
equal(cappedChest.at(-1)!.estimatedMinutes, 7);
const partialChest = Array.from({ length: 7 }, () => set('chest-0', 'today'));
const finalChest = getExerciseRecommendations(chestCatalog, [...weeklyChestHistory, ...partialChest], [], 'today', 'push', Infinity, now, chestContext);
equal(finalChest.length, 1);
equal(finalChest[0]!.sets, 1);
equal(finalChest[0]!.estimatedMinutes, 5);
equal(getExerciseRecommendations(chestCatalog, [...partialChest, set('chest-0', 'today')], [], 'today', 'push', Infinity, now, chestContext).length, 0);
equal(getRankedExercises(chestCatalog, partialChest, [], 'today', 'push', now, chestContext).length, chestCatalog.length);
// Fractional secondary dose also limits prescriptions, and saturated muscles do not block unrelated work.
const partialShoulders = Array.from({ length: 7 }, () => set('shoulder', 'today'));
const fractionalChest = getExerciseRecommendations([bench, { ...bench, id: 'other-bench' }, fly, shoulderPress], [...partialShoulders, ...Array.from({ length: 6 }, () => set('bench', 'today'))], [], 'today', 'push', Infinity, now, chestContext);
equal(fractionalChest.length, 1);
equal(fractionalChest[0]!.exercise.id, 'fly');
equal(fractionalChest[0]!.sets, 2);
const corePlan = getExerciseRecommendations([plank, { ...plank, id: 'other-plank' }], [], [], 'today', 'push', Infinity, now, chestContext);
equal(corePlan.length, 1);
equal(corePlan[0]!.sets, 1);
const lowFrequencyDose = getExerciseRecommendations([bench, shoulderPress, pushdown, fly], [], [], 'today', 'push', 3, now, { sessionMinutes: 60, trainingDays: 1 });
const highFrequencyDose = getExerciseRecommendations([bench, shoulderPress, pushdown, fly], [], [], 'today', 'push', 3, now, { sessionMinutes: 60, trainingDays: 5 });
assert(JSON.stringify(lowFrequencyDose.map(({ exercise, sets }) => [exercise.id, sets])) !== JSON.stringify(highFrequencyDose.map(({ exercise, sets }) => [exercise.id, sets])), 'training frequency should change the per-session recommendation plan');

// Three training days in a P/P/L rotation mean one weekly chest exposure.
const frequencyCatalog = [fly, ...[
  exercise('history-push', 'Historical Push', ['chest'], ['shoulders']),
  exercise('history-pull', 'Historical Pull', ['lats']),
  exercise('history-legs', 'Historical Legs', ['quadriceps']),
].map((item) => ({ ...item, equipment: 'body only' }))];
const frequencyScore = (history: RecommendationSet[], trainingDays = 3) => getRankedExercises(
  frequencyCatalog, history, [], 'today', 'push', now, { trainingDays },
).find(({ exercise: item }) => item.id === fly.id)!.score;
const pplHistory = [set('history-push', 'push', 8), set('history-pull', 'pull', 9), set('history-legs', 'legs', 10)];
equal(frequencyScore([]), (3 * 18 + 3 * 2 + 3) / 10);
equal(frequencyScore(pplHistory), frequencyScore([]));
const fullBodyHistory = ['push', 'pull', 'legs'].flatMap((id, index) => [
  set('history-push', id, 8 + index), set('history-pull', id, 8 + index), set('history-legs', id, 8 + index),
]);
// Larger weekly targets cannot add benefit beyond this prescription's dose.
equal(frequencyScore(fullBodyHistory), frequencyScore(pplHistory));
const weeklyChestWork = Array.from({ length: 4 }, () => set('history-push', 'push', 3));
assert(Math.abs(frequencyScore([...fullBodyHistory, ...weeklyChestWork]) - frequencyScore([...pplHistory, ...weeklyChestWork]) - (3 - 1) * 2 / 10) < 1e-10, 'weekly exposure should matter when remaining weekly work is below the planned dose');
const completedChestDose = Array.from({ length: 5 }, () => set('history-push', 'today'));
const chestReason = (history: RecommendationSet[]) => getRankedExercises(
  frequencyCatalog, [...history, ...completedChestDose], [], 'today', 'push', now,
).find(({ exercise: item }) => item.id === fly.id)!.reason;
equal(chestReason(pplHistory), 'Continue your recent training pattern');
equal(chestReason(fullBodyHistory), "Support this week's Chest work");
// Six sets in one workout still represent one muscle exposure.
equal(frequencyScore([...pplHistory, ...Array.from({ length: 5 }, () => pplHistory[0]!)]), frequencyScore(pplHistory));
equal(frequencyScore([...pplHistory].reverse()), frequencyScore(pplHistory));
// Future, stale, unknown, and non-resistance sets cannot inflate frequency.
equal(frequencyScore([
  ...pplHistory, set('history-push', 'future', -1),
  set('history-push', 'stale', 29), set('unknown', 'unknown', 8),
]), frequencyScore(pplHistory));
// Today's sets affect session coverage but must not change the frequency estimate.
equal(frequencyScore([...pplHistory, set('history-push', 'today', 8)]), frequencyScore(pplHistory) - (3 + 5) / 10);
const withStretch = getRankedExercises([...frequencyCatalog, { ...stretch, equipment: 'body only' }], [...pplHistory, set('stretch', 'mobility', 8)], [], 'today', 'push', now)
  .find(({ exercise: item }) => item.id === fly.id)!;
equal(withStretch.score, frequencyScore(pplHistory));
// Different muscles can have different frequencies, including secondary exposure.
const shoulderOnly = exercise('shoulder-only', 'Shoulder Isolation', ['shoulders']);
const historicalShoulder = { ...shoulderOnly, id: 'history-shoulder', equipment: 'body only' };
const shoulderScore = (history: RecommendationSet[]) => getRankedExercises(
  [...frequencyCatalog, shoulderOnly, historicalShoulder], history, [], 'today', 'push', now,
).find(({ exercise: item }) => item.id === shoulderOnly.id)!.score;
equal(shoulderScore(pplHistory), frequencyScore(pplHistory));
equal(shoulderScore([...pplHistory, set('history-shoulder', 'pull', 9)]), shoulderScore(pplHistory));
// Cold-start custom splits do not assume every training day trains their muscles.
equal(getRankedExercises([fly], [], [], 'today', customUpper.id, now, { trainingDays: 3 }, [], customUpper)[0]!.score, frequencyScore([]));
// More training days reduce the prescription as well as scaling the weekly target.
equal(frequencyScore([], 5), (2 * 18 + 2 * 2 + 3) / 7);
equal(getExerciseRecommendations([bench], [set('bench', 'previous')], [], 'today', 'push', 1, now, { weightLb: 160 })[0]!.relativeLoadPercent, 63);
equal(getExerciseRecommendations([bench], [set('bench', 'previous')], [], 'today', 'push', 1, now)[0]!.relativeLoadPercent, undefined);

const defaultPrescription = { sets: 3, reps: { min: 6, max: 10 } };
deepEqual(getProgressiveOverloadRecommendation([], defaultPrescription), {
  reps: 6, sets: 3, action: 'start', reason: 'Start conservatively and choose a comfortable weight',
});
const session = (workoutId: string, daysAgo: number, weight: number, reps: number[], exerciseId = 'bench') => reps.map((count) => set(exerciseId, workoutId, daysAgo, weight, count));
deepEqual(getProgressiveOverloadRecommendation(session('top', 1, 100, [10, 10, 10]), defaultPrescription), {
  weight: 105, reps: 6, sets: 3, action: 'increase', reason: 'Increase the load after reaching the top of the rep range',
});
// Bodyweight progression continues beyond the original ceiling without inventing a load.
for (const setNumber of [undefined, 1, 2, 3]) {
  deepEqual(getProgressiveOverloadRecommendation(session('bodyweight-top', 1, 0, [10, 10, 10]), defaultPrescription, { setNumber }), {
    weight: 0, reps: 11, sets: 3, action: 'increase', reason: 'Add one rep per set after reaching the top of the bodyweight rep range',
  });
}
equal(getProgressiveOverloadRecommendation(session('bodyweight-next', 1, 0, [11, 11, 11]), defaultPrescription).reps, 12);
equal(getProgressiveOverloadRecommendation(session('bodyweight-uneven', 1, 0, [12, 11, 10]), defaultPrescription).reps, 11);
for (const reps of [[10, 10], [10, 10, 9]]) {
  equal(getProgressiveOverloadRecommendation(session('bodyweight-incomplete', 1, 0, reps), defaultPrescription).action, 'retain');
}
for (const exhaustion of [2.5, 4]) {
  const recommendation = getProgressiveOverloadRecommendation(session('bodyweight-top', 1, 0, [10, 10, 10]), defaultPrescription, { exhaustion });
  equal(recommendation.weight, 0);
  equal(recommendation.reps, 6);
  equal(recommendation.sets, 2);
  equal(recommendation.action, exhaustion === 4 ? 'deload' : 'reduce');
}
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
// Fatigue limits apply after misses, stable performance, and successful progression.
for (const history of [
  [...session('miss-1', 2, 100, [5, 5, 5]), ...session('miss-2', 1, 100, [5, 4, 5])],
  session('steady', 1, 100, [8, 8, 8]),
  session('top', 1, 100, [10, 10, 10]),
]) {
  deepEqual(getProgressiveOverloadRecommendation(history, defaultPrescription, { exhaustion: 4 }), {
    weight: 85, reps: 6, sets: 2, action: 'deload', reason: 'Take a lighter session while the muscles involved recover',
  });
  deepEqual(getProgressiveOverloadRecommendation(history, defaultPrescription, { exhaustion: 2.5 }), {
    weight: 90, reps: 6, sets: 2, action: 'reduce', reason: 'Reduce load and volume while the muscles involved recover',
  });
}
for (const exhaustion of [2.5, 4]) {
  const bodyweightMisses = [...session('miss-1', 2, 0, [5, 5]), ...session('miss-2', 1, 0, [5, 4])];
  const recommendation = getProgressiveOverloadRecommendation(bodyweightMisses, { ...defaultPrescription, sets: 2 }, { exhaustion });
  equal(recommendation.weight, 0);
  // Fatigue limits must preserve an already lower volume.
  equal(recommendation.sets, 1);
  equal(recommendation.action, exhaustion === 4 ? 'deload' : 'reduce');
  equal(getProgressiveOverloadRecommendation([], defaultPrescription, { exhaustion }).sets, 2);
}
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
  assert(fresh.length > 0, `${split} should have useful recommendations`);
  assert(fresh.every(({ exercise: item }) => {
    const details = JSON.parse(item.detailsJson ?? '{}');
    return details.category !== 'stretching' && details.category !== 'cardio' && details.category !== 'strongman' && details.level !== 'expert';
  }), `${split} defaults should avoid mobility, cardio, strongman, and expert movements`);
}

// Each load tier progresses independently once a full session is completed.
const mixedLoads = [set('bench', 'mixed', 1, 100, 10), ...session('mixed', 1, 50, [10, 10])];
deepEqual(getProgressiveOverloadRecommendation(mixedLoads, defaultPrescription), {
  weight: 105, reps: 6, sets: 3, action: 'increase', reason: 'Increase the load after reaching the top of the rep range',
});
deepEqual(getProgressiveOverloadRecommendation([...mixedLoads].reverse(), defaultPrescription), getProgressiveOverloadRecommendation(mixedLoads, defaultPrescription));
equal(getProgressiveOverloadRecommendation([set('bench', 'warmup', 1, 50, 5), ...session('warmup', 1, 100, [10, 10, 10])], defaultPrescription).action, 'increase');
equal(getProgressiveOverloadRecommendation([set('bench', 'high-rep-warmup', 1, 50, 40), ...session('high-rep-warmup', 1, 100, [8, 8, 8])], defaultPrescription).weight, 100);
equal(getProgressiveOverloadRecommendation([
  ...session('miss-heavy-1', 2, 100, [5, 5, 5]), ...session('miss-heavy-1', 2, 50, [15, 15]),
  ...session('miss-heavy-2', 1, 100, [5, 5, 5]), ...session('miss-heavy-2', 1, 50, [15, 15]),
], defaultPrescription).action, 'reduce');

// Preserve ramps and back-offs by set number, including tied timestamps.
const ramp = [[80, 9], [90, 9], [100, 8]].map(([weight, reps], index) => ({
  ...set('bench', 'ramp', 1, weight, reps), setNumber: index + 1,
}));
for (const previous of ramp) {
  const recommendation = getProgressiveOverloadRecommendation([...ramp].reverse(), defaultPrescription, { setNumber: previous.setNumber });
  equal(recommendation.weight, previous.weight);
  equal(recommendation.reps, previous.reps);
  equal(recommendation.action, 'retain');
}
const backOff = ramp.map((item, index) => ({ ...item, weight: [100, 90, 80][index], reps: [6, 8, 9][index] }));
for (const previous of backOff) {
  const recommendation = getProgressiveOverloadRecommendation(backOff, defaultPrescription, { setNumber: previous.setNumber });
  equal(recommendation.weight, previous.weight);
  equal(recommendation.reps, previous.reps);
}
equal(getProgressiveOverloadRecommendation(ramp, defaultPrescription, { setNumber: 4 }).weight, 100);
equal(getProgressiveOverloadRecommendation(ramp, defaultPrescription, { setNumber: 4 }).reps, 8);
const chronologicalRamp = ramp.map(({ setNumber, ...item }) => ({ ...item, completedAt: new Date(item.completedAt.getTime() + setNumber * 60_000) }));
equal(getProgressiveOverloadRecommendation([...chronologicalRamp].reverse(), defaultPrescription, { setNumber: 1 }).weight, 80);
const currentRamp = ramp.map((item, index) => ({ ...item, workoutId: 'today', completedAt: now, weight: index === 0 ? 80 : 200 }));
equal(getProgressiveOverloadRecommendation([...ramp, ...currentRamp], defaultPrescription, { currentWorkoutId: 'today', setNumber: 2 }).weight, 90);

// Today's adjustments carry forward without replacing the historical sequence.
const currentOptions = { currentWorkoutId: 'today', setNumber: 2 };
const todaySet = { ...set('bench', 'today', 0, 80, 8), setNumber: 1 };
const flatHistory = session('steady', 1, 100, [8, 8, 8]);
for (const weight of [80, 120, 0]) {
  const adjusted = getProgressiveOverloadRecommendation([...flatHistory, { ...todaySet, weight }], defaultPrescription, currentOptions);
  equal(adjusted.weight, weight);
  equal(adjusted.reps, 8);
  equal(adjusted.action, 'retain');
}
equal(getProgressiveOverloadRecommendation([...flatHistory, todaySet], defaultPrescription, { currentWorkoutId: 'today' }).weight, 80);
equal(getProgressiveOverloadRecommendation([...flatHistory, todaySet], defaultPrescription, { ...currentOptions, setNumber: 1 }).weight, 100);
equal(getProgressiveOverloadRecommendation([...flatHistory, { ...todaySet, reps: NaN }], defaultPrescription, currentOptions).weight, 100);
equal(getProgressiveOverloadRecommendation([todaySet], defaultPrescription, currentOptions).weight, 80);
equal(getProgressiveOverloadRecommendation([todaySet], defaultPrescription, currentOptions).reps, 8);
for (const sequence of [ramp, backOff]) {
  const logged = { ...todaySet, weight: sequence[0]!.weight! - 10, reps: sequence[0]!.reps };
  equal(getProgressiveOverloadRecommendation([...sequence, logged], defaultPrescription, currentOptions).weight, sequence[1]!.weight! - 10);
  equal(getProgressiveOverloadRecommendation([...sequence, logged], defaultPrescription, currentOptions).reps, sequence[1]!.reps);
}
// Repeated loads retain exact manual entries instead of rounding them upward.
for (const loadOptions of [{}, getProgressiveOverloadLoadOptions({ equipment: 'barbell', detailsJson: null })]) {
  for (const weight of [82.5, 83, 20]) {
    const logged = { ...todaySet, weight };
    const next = getProgressiveOverloadRecommendation([...flatHistory, logged], defaultPrescription, { ...currentOptions, ...loadOptions });
    equal(next.weight, weight);
    equal(next.reps, logged.reps);
    const third = getProgressiveOverloadRecommendation([
      ...flatHistory, logged, { ...logged, setNumber: 2 },
    ], defaultPrescription, { ...currentOptions, ...loadOptions, setNumber: 3 });
    equal(third.weight, weight);
  }
}
const laterAdjustment = { ...todaySet, setNumber: 2, weight: 85, reps: 7 };
const adjustedHistory = [...flatHistory, todaySet, laterAdjustment];
const adjustedNext = getProgressiveOverloadRecommendation(adjustedHistory, defaultPrescription, { ...currentOptions, setNumber: 3 });
equal(adjustedNext.weight, 85);
equal(adjustedNext.reps, 7);
deepEqual(getProgressiveOverloadRecommendation([...adjustedHistory].reverse(), defaultPrescription, { ...currentOptions, setNumber: 3 }), adjustedNext);
// Following an increase or fatigue prescription must not apply it again.
equal(getProgressiveOverloadRecommendation([...session('top', 1, 100, [10, 10, 10]), { ...todaySet, weight: 105, reps: 6 }], defaultPrescription, currentOptions).weight, 105);
equal(getProgressiveOverloadRecommendation([...flatHistory, { ...todaySet, weight: 90, reps: 6 }], defaultPrescription, { ...currentOptions, exhaustion: 2.5 }).weight, 90);
const progressedRamp = [ramp[0]!, ...session('ramp', 1, 100, [10, 10, 10]).map((item, index) => ({ ...item, setNumber: index + 2 }))];
equal(getProgressiveOverloadRecommendation(progressedRamp, defaultPrescription, { setNumber: 1 }).weight, 80);
equal(getProgressiveOverloadRecommendation(progressedRamp, defaultPrescription, { setNumber: 2 }).weight, 105);
equal(getProgressiveOverloadRecommendation(ramp, defaultPrescription, { setNumber: 1, exhaustion: 4 }).weight, 70);
const bodyweightSequence = ramp.map((item, index) => ({ ...item, weight: 0, reps: [12, 10, 8][index] }));
equal(getProgressiveOverloadRecommendation(bodyweightSequence, defaultPrescription, { setNumber: 1 }).reps, 12);
equal(getProgressiveOverloadRecommendation(bodyweightSequence, defaultPrescription, { setNumber: 3 }).reps, 8);
equal(getProgressiveOverloadRecommendation([], defaultPrescription, { setNumber: 1 }).action, 'start');

for (const sequence of [ramp, backOff]) {
  const successful = sequence.map((item) => ({ ...item, reps: 10 }));
  for (const previous of successful) {
    const recommendation = getProgressiveOverloadRecommendation([...successful].reverse(), defaultPrescription, { setNumber: previous.setNumber });
    equal(recommendation.weight, previous.weight! + 5);
    equal(recommendation.reps, 6);
    equal(recommendation.action, 'increase');
  }
  equal(getProgressiveOverloadRecommendation(successful, defaultPrescription).weight, 105);
  equal(getProgressiveOverloadRecommendation(successful.slice(0, 2), defaultPrescription, { setNumber: 1 }).action, 'retain');
  equal(getProgressiveOverloadRecommendation(successful, defaultPrescription, { setNumber: 1, exhaustion: 4 }).action, 'deload');
}

// A miss at one tier neither blocks another tier nor borrows its successful reps.
const partialBackOff = backOff.map((item) => ({ ...item, reps: item.weight === 100 ? 5 : 10 }));
const repeatedBackOff = [...partialBackOff.map((item) => ({ ...item, workoutId: 'older-back-off', completedAt: new Date(item.completedAt.getTime() - 86_400_000) })), ...partialBackOff];
equal(getProgressiveOverloadRecommendation(repeatedBackOff, defaultPrescription, { setNumber: 1 }).action, 'reduce');
equal(getProgressiveOverloadRecommendation(repeatedBackOff, defaultPrescription, { setNumber: 2 }).weight, 95);
equal(getProgressiveOverloadRecommendation(repeatedBackOff, defaultPrescription, { setNumber: 3 }).weight, 85);
const repeatedTier = [...session('repeated-tier', 1, 100, [10, 10]), ...session('repeated-tier', 1, 90, [10, 8])];
equal(getProgressiveOverloadRecommendation(repeatedTier, defaultPrescription).weight, 105);
equal(getProgressiveOverloadRecommendation(repeatedTier, defaultPrescription, { setNumber: 3 }).weight, 90);

// Library sorting scores all eligible movements rather than consuming a workout plan.
const rankCatalog = [bench, shoulderPress, pushdown, fly, plank];
const fullRanking = getRankedExercises(rankCatalog, [], [], 'today', 'push', now, { sessionMinutes: 15 });
equal(fullRanking.length, rankCatalog.length);
assert(fullRanking.length > getExerciseRecommendations(rankCatalog, [], [], 'today', 'push', Infinity, now, { sessionMinutes: 15 }).length, 'catalog ranks beyond the session time budget');
const completedCoverage = [
  ...Array.from({ length: 24 }, () => set('bench', 'today')),
  ...Array.from({ length: 24 }, () => set('shoulder', 'today')),
  ...Array.from({ length: 24 }, () => set('pushdown', 'today')),
  ...Array.from({ length: 3 }, () => set('plank', 'today', 0, 0, 30)),
];
equal(getExerciseRecommendations(rankCatalog, completedCoverage, [], 'today', 'push', Infinity, now).length, 0);
equal(getRankedExercises(rankCatalog, completedCoverage, [], 'today', 'push', now).length, rankCatalog.length);
assert(getRankedExercises(rankCatalog, completedCoverage, [], 'today', 'push', now).some(({ score }) => score <= 0), 'catalog retains eligible movements with nonpositive scores');
const visibleRanking = getRankedExercises(rankCatalog, [], [], 'today', 'push', now, { sessionMinutes: 15, excludedExerciseIds: ['bench', 'pushdown'] });
deepEqual(visibleRanking, fullRanking.filter(({ exercise }) => !['bench', 'pushdown'].includes(exercise.id)));
const benchTwin = { ...bench, id: 'bench-twin' };
const soloHistory = [set('bench', 'solo-previous', 8)];
const loggedScore = getRankedExercises([bench, benchTwin], [...soloHistory, set('bench', 'today')], [], 'today', 'push', now).find(({ exercise }) => exercise.id === 'bench')!.score;
const twinScore = getRankedExercises([bench, benchTwin], [...soloHistory, set('bench-twin', 'today')], [], 'today', 'push', now).find(({ exercise }) => exercise.id === 'bench')!.score;
equal(loggedScore, twinScore + 5 / 10);
const rankingHistory = [...progressingBench, ...yesterdayBench, set('fly', 'paired', 8), set('bench', 'paired', 8), set('bench', 'today')];
deepEqual(getRankedExercises(rankCatalog, rankingHistory, [], 'today', 'push', now, {}, rejectionHistory), getRankedExercises(rankCatalog, [...rankingHistory].reverse(), [], 'today', 'push', now, {}, [...rejectionHistory].reverse()));
deepEqual(getExerciseRecommendations(rankCatalog, rankingHistory, [], 'today', 'push', 3, now, {}, rejectionHistory), getExerciseRecommendations(rankCatalog, [...rankingHistory].reverse(), [], 'today', 'push', 3, now, {}, [...rejectionHistory].reverse()));
const sameNameExercises = [{ ...fly, id: 'z-fly' }, { ...fly, id: 'a-fly' }];
deepEqual(getRankedExercises(sameNameExercises, [], [], 'today', 'push', now).map(({ exercise }) => exercise.id), ['a-fly', 'z-fly']);
equal(getExerciseRecommendations([...sameNameExercises].reverse(), [], [], 'today', 'push', 1, now)[0]!.exercise.id, 'a-fly');

// The database adapter and library screen use the full-ranking entry point.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
} });
const db = await import('../db/index.web');
const rankedWorkout = db.createWorkout('push');
const dbRanking = db.getRankedExercises(rankedWorkout.id, 'push', { sessionMinutes: 15 });
assert(dbRanking.length > db.getExerciseRecommendations(rankedWorkout.id, 'push', Infinity, { sessionMinutes: 15 }).length, 'database exposes full catalog ranking');
const loggedExerciseId = dbRanking[0]!.exercise.id;
for (let number = 1; number <= 8; number++) db.saveWorkoutSet({ exerciseId: loggedExerciseId, workoutId: rankedWorkout.id, setNumber: number, weight: 100, reps: 8, completedAt: new Date() });
equal(db.getExerciseRecommendations(rankedWorkout.id, 'push', Infinity, { sessionMinutes: 15 }).length, 0);
equal(db.getRankedExercises(rankedWorkout.id, 'push', { sessionMinutes: 15 }).length, dbRanking.length);
assert(db.getRankedExercises(rankedWorkout.id, 'push').some(({ exercise }) => exercise.id === loggedExerciseId), 'database ranks logged movements when the session has no time left');
equal(db.getRankedExercises(rankedWorkout.id, 'push', { excludedExerciseIds: db.getExercises().filter(({ id }) => id !== loggedExerciseId).map(({ id }) => id) }).length, 1);

const routineContext = { routineExerciseIdsBySplit: { push: ['fly'] } };
assert(Math.abs(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, routineContext)[0]!.score - baselineFly - 2) < 1e-10, 'saved preferences add a 20-point prior');
equal(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, routineContext)[0]!.reason, 'Part of your usual routine');
equal(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, { routineExerciseIdsBySplit: { pull: ['fly'] } })[0]!.score, baselineFly);
assert(Math.abs(getExerciseRecommendations([fly], [], [], 'today', 'push', 1, now, { ...routineContext, favoriteExerciseIds: ['fly'] })[0]!.score - baselineFly - 2) < 1e-10, 'saved preferences add a 20-point prior');
equal(getExerciseRecommendations([fly], [], severeChest, 'today', 'push', 1, now, routineContext).length, 0);

// Explicit preferences outrank equally useful unfamiliar movements regardless of tag count.
const routineMovement = exercise('routine-movement', 'Routine Press', ['chest']);
const catalogVariants = [
  exercise('secondary-tags', 'Catalog Press', ['chest'], ['shoulders', 'triceps']),
  exercise('primary-tags', 'Catalog Press', ['chest', 'shoulders', 'triceps']),
  exercise('duplicate-tags', 'Catalog Press', ['chest', 'chest'], ['shoulders', 'triceps', 'triceps', 'chest']),
];
for (const unfamiliar of catalogVariants) {
  const catalog = [unfamiliar, routineMovement];
  const baseline = getRankedExercises(catalog, [], [], 'today', 'push', now);
  assert(Math.abs(baseline[0]!.score - baseline[1]!.score) < 1e-10, 'extra tags must not inflate fresh coverage');
  for (const context of [
    { routineExerciseIdsBySplit: { push: [routineMovement.id] } },
    { favoriteExerciseIds: [routineMovement.id] },
  ]) {
    equal(getRankedExercises(catalog, [], [], 'today', 'push', now, context)[0]!.exercise.id, routineMovement.id);
    equal(getExerciseRecommendations(catalog, [], [], 'today', 'push', 1, now, context)[0]!.exercise.id, routineMovement.id);
  }
}
// Normalization still favors useful coverage over a saved movement whose chest work is complete.
const coveredRoutine = Array.from({ length: 5 }, () => set(routineMovement.id, 'today'));
equal(getRankedExercises([routineMovement, shoulderPress], coveredRoutine, [], 'today', 'push', now, {
  routineExerciseIdsBySplit: { push: [routineMovement.id] },
})[0]!.exercise.id, shoulderPress.id);

// Reductions respect equipment floors, fractional increments, and discrete loads.
for (const exhaustion of [2.5, 4]) {
  equal(getProgressiveOverloadRecommendation(session('light', 1, 2.5, [8, 8, 8]), defaultPrescription, { exhaustion }).weight, 2.5);
  const barOptions = getProgressiveOverloadLoadOptions({ equipment: 'barbell', detailsJson: null });
  equal(getProgressiveOverloadRecommendation(session('empty-bar', 1, 45, [8, 8, 8]), defaultPrescription, { ...barOptions, exhaustion }).weight, 45);
  equal(getProgressiveOverloadRecommendation(session('bar', 1, 100, [8, 8, 8]), defaultPrescription, { ...barOptions, exhaustion }).weight, exhaustion === 4 ? 85 : 90);
  equal(getProgressiveOverloadRecommendation(session('light', 1, 12.5, [8, 8, 8]), defaultPrescription, {
    exhaustion, weightIncrement: 2.5, minimumWeight: 2.5,
  }).weight, 10);
}
const minimumMisses = getProgressiveOverloadRecommendation([
  ...session('light-miss-1', 2, 2.5, [4, 4, 4]), ...session('light-miss-2', 1, 2.5, [4, 4, 4]),
], defaultPrescription, { weightIncrement: 2.5, minimumWeight: 2.5 });
equal(minimumMisses.weight, 2.5);
equal(minimumMisses.sets, 2);
const discreteLoads = { minimumWeight: 2.5, availableWeights: [20, 2.5, 7.5, 12.5, 20, 0, NaN, Infinity] };
equal(getProgressiveOverloadRecommendation(session('discrete', 1, 12.5, [8, 8, 8]), defaultPrescription, { ...discreteLoads, exhaustion: 4 }).weight, 7.5);
equal(getProgressiveOverloadRecommendation(session('discrete', 1, 12.5, [10, 10, 10]), defaultPrescription, discreteLoads).weight, 20);
equal(getProgressiveOverloadRecommendation(session('maximum', 1, 20, [10, 10, 10]), defaultPrescription, discreteLoads).action, 'retain');
equal(getProgressiveOverloadRecommendation(session('body', 1, 0, [8, 8, 8]), defaultPrescription, { ...discreteLoads, exhaustion: 4 }).weight, 0);
for (const equipment of ['dumbbell', 'cable']) {
  const loadOptions = getProgressiveOverloadLoadOptions({ equipment, detailsJson: JSON.stringify({ mechanic: 'isolation' }) });
  equal(loadOptions.weightIncrement, 2.5);
  equal(getProgressiveOverloadRecommendation(session('small-increase', 1, 2.5, [10, 10, 10]), defaultPrescription, loadOptions).weight, 5);
}
equal(getProgressiveOverloadRecommendation(session('off-grid', 1, 12.5, [8, 8, 8]), defaultPrescription, {
  exhaustion: 2.5, minimumWeight: 5, weightIncrement: 5,
}).weight, 10);

// Recency limits and return sessions use a fixed clock.
equal(getProgressiveOverloadRecommendation(session('recent-top', 13, 100, [10, 10, 10]), defaultPrescription).weight, 105);
for (const [daysAgo, expectedWeight] of [[14, 90], [27, 90], [28, 85], [90, 85]]) {
  const returning = getProgressiveOverloadRecommendation(session('returning', daysAgo, 100, [10, 10, 10]), defaultPrescription);
  equal(returning.action, 'reduce'); equal(returning.weight, expectedWeight);
  equal(returning.reps, 6); equal(returning.sets, 2);
}
for (const daysAgo of [91, -1]) {
  const expired = getProgressiveOverloadRecommendation(session('expired', daysAgo, 100, [10, 10, 10]), defaultPrescription);
  equal(expired.action, 'start'); equal(expired.weight, undefined);
}
equal(getProgressiveOverloadRecommendation([
  ...session('old-miss', 20, 100, [5, 5, 5]), ...session('new-miss', 1, 100, [5, 5, 5]),
], defaultPrescription).action, 'retain');
equal(getProgressiveOverloadRecommendation([
  ...session('old-success', 91, 200, [10, 10, 10]), ...session('fresh', 1, 100, [8, 8, 8]),
], defaultPrescription).weight, 100);
equal(getProgressiveOverloadRecommendation(session('body-return', 14, 0, [15, 15, 15]), defaultPrescription).weight, 0);
equal(getProgressiveOverloadRecommendation(session('return-minimum', 28, 45, [10, 10, 10]), defaultPrescription, getProgressiveOverloadLoadOptions({ equipment: 'barbell', detailsJson: '{}' })).weight, 45);
equal(getProgressiveOverloadRecommendation(session('return-fatigue', 28, 100, [10, 10, 10]), defaultPrescription, { exhaustion: 4 }).weight, 85);
equal(getProgressiveOverloadRecommendation(ramp.map((set) => ({ ...set, completedAt: new Date(now.getTime() - 14 * 86_400_000) })), defaultPrescription, { setNumber: 1 }).weight, 70);
