import { averageCoverage, coverageColor, muscleCoverage, splitCoverage, trainingOverview, trainingTotalLabel, weeklyChartExtrema, weeklyTrainingHistory, weekStreak } from './training-overview';
import type { WorkoutVisitSummary, WorkoutVisitExerciseDetail } from '../db';
import type { Exercise } from '../db/exercise-catalog';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }

const date = (day: number) => new Date(2026, 8, day, 12);
const visit = (id: string, day: number, split: 'push' | 'pull' | 'legs', sets: number, volume: number): WorkoutVisitSummary => ({ workout: { id, split, createdAt: date(day), endedAt: date(day) }, sets, volume, exercises: 1, reps: 10 });
const exercises = [{ id: 'bench', area: 'CHEST', detailsJson: JSON.stringify({ primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] }) }] as Exercise[];
const details: Record<string, WorkoutVisitExerciseDetail[]> = {
  old: [{ id: 'bench', name: 'Bench', sets: [{ number: 1, weight: 100, reps: 5 }] }],
  now: [{ id: 'bench', name: 'Bench', sets: [{ number: 1, weight: 100, reps: 5 }, { number: 2, weight: 100, reps: 5 }] }],
};
const overview = trainingOverview([visit('old', -6, 'push', 1, 500), visit('now', 22, 'pull', 2, 1000)], (id) => details[id], exercises, date(29));
const history = weeklyTrainingHistory([visit('ancient', -400, 'push', 1, 500), visit('recent', 22, 'pull', 2, 1000), visit('active', 29, 'push', 3, 1500)], date(29));
assert(history.length > 52 && history[0].workouts === 1, 'all history includes workouts older than a year');
assert(history.at(-1)?.sets === 3 && history.reduce((total, week) => total + week.workouts, 0) === 3, 'weekly history includes completed workouts from the current week');
assert(weeklyTrainingHistory([], date(29)).length === 52, 'empty fixed ranges show 52 weeks including this week');
assert(JSON.stringify(weeklyChartExtrema([{ workouts: 0, sets: 0, volume: 0 }, { workouts: 1, sets: 2, volume: 500 }, { workouts: 1, sets: 4, volume: 900 }, { workouts: 1, sets: 2, volume: 500 }], 'sets')) === JSON.stringify([3, 2]), 'chart labels use the latest logged low and high, ignoring empty weeks');
assert(JSON.stringify(weeklyChartExtrema([], 'volume')) === JSON.stringify([-1, -1]), 'empty chart has no extrema labels');
assert(JSON.stringify(overview.previous) === JSON.stringify({ workouts: 1, sets: 1, volume: 500 }), 'previous totals match History');
assert(JSON.stringify(overview.current) === JSON.stringify({ workouts: 1, sets: 2, volume: 1000 }), 'current totals match History');
assert(overview.weeks.length === 8, 'aggregation check');
assert(overview.weeks.filter((week) => week.workouts === 0).length === 6, 'aggregation check');
assert(overview.weeks[6].splits.pull.sets === 2, 'completed-week aggregation check');
assert(overview.weeks[6].muscles.chest === 2, 'completed-week muscle aggregation check');
assert(overview.weeks[6].muscles.triceps === 1, 'completed-week muscle aggregation check');
assert(overview.weeks[6].splits.pull.muscles.chest === 2, 'muscle exposure stays with its logged split');
const extended = trainingOverview([visit('old', -6, 'push', 1, 500), visit('now', 22, 'pull', 2, 1000)], (id) => details[id], exercises, date(29), undefined, 13);
assert(extended.weeks.length === 13 && extended.weeks[7].coverage.chest > 0, 'extended coverage includes older completed weeks');
assert(JSON.stringify(extended.current) === JSON.stringify(overview.current), 'extended history keeps the recent summary unchanged');
const monthBoundary = trainingOverview([], () => [], [], new Date(2026, 9, 1), undefined, 13);
assert(monthBoundary.weeks[0].start.getDay() === 1 && monthBoundary.weeks.at(-1)?.start.getTime() === new Date(2026, 8, 28).getTime(), 'weeks stay aligned across month boundaries, ending in the current week');
assert(overview.inProgress === overview.weeks.at(-1) && overview.inProgress.workouts === 0, 'this-week totals share the final chart week');
const coverage = splitCoverage(overview.weeks, [
  { id: 'push', name: 'Push', muscles: ['chest', 'triceps'] },
  { id: 'pull', name: 'Pull', muscles: ['chest', 'biceps'] },
]);
assert(coverage[0].percentage === 0, 'a split with no recent work has no coverage');
assert(Math.round(muscleCoverage(overview.weeks.slice(4), 'chest', 'pull')) === 7, 'multiweek coverage averages independently capped weekly percentages');
assert(coverage[1].musclePercentages.biceps === 0, 'untrained muscles contribute zero percent');
assert(coverage[1].percentage === 3, 'split coverage averages each muscle percentage, including partial progress');
assert(averageCoverage(overview.weeks.slice(4), ['chest', 'triceps']) === 5, 'overall coverage averages the given muscles');
assert(averageCoverage(overview.weeks.slice(4), ['chest', 'triceps', 'biceps']) === 3, 'the muscle list decides the overall figure, so screens must share it');
assert(averageCoverage(overview.weeks.slice(4), []) === 0, 'no muscles means no coverage');

const rated = trainingOverview([visit('now', 22, 'pull', 2, 1000)], (id) => details[id], exercises, date(29), () => [
  { id: 'chest', name: 'Chest', area: 'CHEST', exhaustion: 3 },
  { id: 'biceps', name: 'Biceps', area: 'ARMS', exhaustion: 4 },
]);
const ratedCoverage = splitCoverage(rated.weeks, [{ id: 'pull', name: 'Pull', muscles: ['chest', 'triceps', 'biceps'] }])[0];
assert(Math.round(ratedCoverage.musclePercentages.chest) === 7 && ratedCoverage.musclePercentages.biceps === 0, 'exhaustion ratings do not change coverage');
assert(ratedCoverage.percentage === 3, 'split coverage averages the capped muscle percentages');
assert(rated.weeks[6].muscles.chest === 2, 'estimated set counts remain unchanged by coverage scoring');

const varied = trainingOverview([visit('now', 22, 'pull', 2, 1200)], () => [{ id: 'bench', name: 'Bench', sets: [{ number: 1, weight: 100, reps: 8 }, { number: 2, weight: 50, reps: 8 }] }], exercises, date(29));
assert(varied.weeks[6].coverage.chest === varied.weeks[6].coverage.triceps * 2, 'primary and secondary exposure weights are preserved without within-session load scoring');

const fourSetSession = trainingOverview([visit('four', 22, 'push', 4, 3200)], () => [{ id: 'bench', name: 'Bench', sets: [1, 2, 3, 4].map((number) => ({ number, weight: 100, reps: 8 })) }], exercises, date(29));
assert(Math.round(muscleCoverage(fourSetSession.weeks.slice(6, 7), 'chest')) === 89, 'four sets of eight earn about 89% for one week');
assert(Math.round(muscleCoverage(fourSetSession.weeks.slice(4), 'chest')) === 22, 'one such session earns about 22% across a four-week window');
const repeatedSession = trainingOverview([8, 15, 22, 29].map((day) => visit(`repeat-${day}`, day, 'push', 4, 3200)), () => [{ id: 'bench', name: 'Bench', sets: [1, 2, 3, 4].map((number) => ({ number, weight: 100, reps: 8 })) }], exercises, date(29));
assert(Math.round(muscleCoverage(repeatedSession.weeks.slice(4), 'chest')) === 89, 'consistent weekly training can score above 80% without reaching 100%');
const saturatedSession = trainingOverview([visit('many', 22, 'push', 10, 8000)], () => [{ id: 'bench', name: 'Bench', sets: Array.from({ length: 10 }, (_, index) => ({ number: index + 1, weight: 100, reps: 8 })) }], exercises, date(29));
assert(muscleCoverage(saturatedSession.weeks.slice(4), 'chest') === 25, 'extra sets in one week cannot replace training in the other three weeks');
const currentOnly = trainingOverview([visit('today', 29, 'push', 4, 3200)], () => [{ id: 'bench', name: 'Bench', sets: [1, 2, 3, 4].map((number) => ({ number, weight: 100, reps: 8 })) }], exercises, date(29));
assert(currentOnly.inProgress.workouts === 1 && currentOnly.current.workouts === 1 && currentOnly.weeks.at(-1)?.workouts === 1, 'a workout completed today appears in the current total and chart');
assert(Math.round(muscleCoverage(currentOnly.weeks.slice(4), 'chest')) === 22, 'a workout completed today immediately contributes to four-week coverage');

// Reproduce the production report: only Sept 24 counted, while the three
// completed sessions in the week of Sept 28 disappeared from coverage.
const reportedVisits = [visit('push-old', 24, 'push', 8, 7700), visit('push-new', 28, 'push', 20, 8200), visit('legs', 29, 'legs', 18, 26000), visit('pull', 31, 'pull', 15, 9300)];
const reportedExercises = [
  { id: 'push', area: 'CHEST', detailsJson: JSON.stringify({ primaryMuscles: ['chest'] }) },
  { id: 'legs', area: 'LEGS', detailsJson: JSON.stringify({ primaryMuscles: ['quadriceps'] }) },
  { id: 'pull', area: 'BACK', detailsJson: JSON.stringify({ primaryMuscles: ['lats'] }) },
] as Exercise[];
const reported = trainingOverview(reportedVisits, (id) => [{ id: id.startsWith('push') ? 'push' : id, name: id, sets: [{ number: 1, weight: 100, reps: 8 }] }], reportedExercises, date(31));
assert(reported.inProgress.workouts === 3 && reported.current.workouts === 4, 'this-week count and four-week total include all reported sessions');
assert(reported.current.sets === 61 && reported.current.volume === 51200, 'recent sets and volume match History');
const reportedSplits = splitCoverage(reported.weeks, [
  { id: 'push', name: 'Push', muscles: ['chest'] },
  { id: 'pull', name: 'Pull', muscles: ['lats'] },
  { id: 'legs', name: 'Legs', muscles: ['quadriceps'] },
]);
assert(reportedSplits.every((split) => split.percentage > 0), 'recent Pull and Legs workouts immediately contribute to split scores');
assert(weeklyTrainingHistory(reportedVisits, date(31)).slice(-4).reduce((total, week) => total + week.workouts, 0) === 4, 'the training chart includes the same four workouts as History');
const monday = new Date(2026, 8, 28);
const boundaryVisits = [visit('sunday', 27, 'push', 1, 100), { ...visit('monday', 28, 'pull', 1, 200), workout: { id: 'monday', split: 'pull' as const, createdAt: monday, endedAt: monday } }, visit('future', 29, 'push', 1, 300)];
const boundaryHistory = weeklyTrainingHistory(boundaryVisits, monday);
assert(boundaryHistory.at(-2)?.volume === 100 && boundaryHistory.at(-1)?.volume === 200, 'Monday midnight starts the current week and future workouts remain excluded');

const excluded = trainingOverview([visit('now', 22, 'pull', 3, 900)], () => [
  { id: 'stretch', name: 'Stretch', sets: [{ number: 1, weight: 0, reps: 20 }] },
  { id: 'cardio', name: 'Cardio', sets: [{ number: 1, weight: 0, reps: 20 }] },
  { id: 'zero', name: 'Zero reps', sets: [{ number: 1, weight: 100, reps: 0 }] },
], [
  { id: 'stretch', area: 'LEGS', detailsJson: JSON.stringify({ category: 'stretching', primaryMuscles: ['hamstrings'] }) },
  { id: 'cardio', area: 'CORE', detailsJson: JSON.stringify({ category: 'cardio', primaryMuscles: ['abdominals'] }) },
  { id: 'zero', area: 'CHEST', detailsJson: JSON.stringify({ category: 'strength', primaryMuscles: ['chest'] }) },
] as Exercise[], date(29));
assert(excluded.weeks[6].muscles.hamstrings === undefined && excluded.weeks[6].muscles.abdominals === undefined && excluded.weeks[6].muscles.chest === undefined, 'stretching, cardio and zero-rep sets do not count as muscle sets');
assert(excluded.weeks[6].coverage.hamstrings === undefined && excluded.weeks[6].coverage.abdominals === undefined && excluded.weeks[6].coverage.chest === undefined, 'stretching, cardio and zero-rep sets do not earn coverage');

const malformed = trainingOverview([visit('now', 22, 'pull', 1, 100)], () => [{ id: 'bench', name: 'Bench', sets: [{ number: 1, weight: 0, reps: 8 }] }], [
  { id: 'bench', area: 'CHEST', detailsJson: '{"primaryMuscles":"broken","secondaryMuscles":[null,3]}' },
] as Exercise[], date(29));
assert(malformed.weeks[6].coverage.chest > 0, 'malformed muscle metadata falls back to a safe area muscle');

// Sept 29 2026 is a Tuesday; Sunday-start weeks begin Sept 27, 20, 13, 6.
assert(weekStreak([date(28), date(21), date(14), date(1)], date(29)) === 3, 'streak counts consecutive weeks through this week');
assert(weekStreak([date(21), date(15)], date(29)) === 2, 'an empty current week does not break the streak yet');
assert(weekStreak([date(14)], date(29)) === 0, 'a missed full week resets the streak');

assert(coverageColor(0, '#E3E5DF', '#FFCC4A') === '#e3e5df', 'an untrained muscle keeps the neutral body fill');
assert(coverageColor(100, '#E3E5DF', '#FFCC4A') === '#ffcc4a', 'a muscle on target is the full accent');
assert(coverageColor(50, '#000000', '#FFCC4A') === '#806625', 'coverage blends evenly toward the accent');
assert(coverageColor(140, '#E3E5DF', '#FFCC4A') === '#ffcc4a' && coverageColor(-5, '#E3E5DF', '#FFCC4A') === '#e3e5df', 'coverage outside 0-100 is clamped');
assert(trainingTotalLabel('workouts', 1, 'past month') === 'workout · past month', 'a single workout is singular');
assert(trainingTotalLabel('sets', 1, 'all time') === 'set · all time', 'a single set is singular');
assert(trainingTotalLabel('workouts', 0, 'past year') === 'workouts · past year', 'zero stays plural');
assert(trainingTotalLabel('volume', 1, 'past month') === 'volume · past month', 'volume has no plural');
