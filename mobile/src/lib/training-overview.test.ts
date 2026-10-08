import { compareCoverage, coverageDays, coveragePlan, coverageSummary, muscleCoverage, trainingOverview, trainingTotalLabel, weeklyChartExtrema, weeklyTrainingHistory, weekStreak } from './training-overview';
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
const extended = trainingOverview([visit('old', -6, 'push', 1, 500), visit('now', 22, 'pull', 2, 1000)], (id) => details[id], exercises, date(29), 13);
assert(extended.weeks.length === 13 && extended.weeks[7].muscles.chest > 0, 'extended history includes older completed weeks');
assert(JSON.stringify(extended.current) === JSON.stringify(overview.current), 'extended history keeps the recent summary unchanged');
const monthBoundary = trainingOverview([], () => [], [], new Date(2026, 9, 1), 13);
assert(monthBoundary.weeks[0].start.getDay() === 1 && monthBoundary.weeks.at(-1)?.start.getTime() === new Date(2026, 8, 28).getTime(), 'weeks stay aligned across month boundaries, ending in the current week');
assert(overview.inProgress === overview.weeks.at(-1) && overview.inProgress.workouts === 0, 'this-week totals share the final chart week');
const currentOnly = trainingOverview([visit('today', 29, 'push', 4, 3200)], () => [{ id: 'bench', name: 'Bench', sets: [1, 2, 3, 4].map((number) => ({ number, weight: 100, reps: 8 })) }], exercises, date(29));
assert(currentOnly.inProgress.workouts === 1 && currentOnly.current.workouts === 1 && currentOnly.inProgress.muscles.chest === 4, "a workout completed today appears in the current total and this week's sets");

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

const malformed = trainingOverview([visit('now', 22, 'pull', 1, 100)], () => [{ id: 'bench', name: 'Bench', sets: [{ number: 1, weight: 0, reps: 8 }] }], [
  { id: 'bench', area: 'CHEST', detailsJson: '{"primaryMuscles":"broken","secondaryMuscles":[null,3]}' },
] as Exercise[], date(29));
assert(malformed.weeks[6].muscles.chest === 1, 'malformed muscle metadata falls back to a safe area muscle');

// Sept 29 2026 is a Tuesday; Sunday-start weeks begin Sept 27, 20, 13, 6.
assert(weekStreak([date(28), date(21), date(14), date(1)], date(29)) === 3, 'streak counts consecutive weeks through this week');
assert(weekStreak([date(21), date(15)], date(29)) === 2, 'an empty current week does not break the streak yet');
assert(weekStreak([date(14)], date(29)) === 0, 'a missed full week resets the streak');

assert(trainingTotalLabel('workouts', 1, 'past month') === 'workout · past month', 'a single workout is singular');
assert(trainingTotalLabel('sets', 1, 'all time') === 'set · all time', 'a single set is singular');
assert(trainingTotalLabel('workouts', 0, 'past year') === 'workouts · past year', 'zero stays plural');
assert(trainingTotalLabel('volume', 1, 'past month') === 'volume · past month', 'volume has no plural');

// Coverage: every logged set counts once, whatever the reps.
const bench = (id: string, reps: number, count: number) => [{ id: 'bench', name: id, sets: Array.from({ length: count }, (_, index) => ({ number: index + 1, weight: 100, reps })) }];
const repRanges = trainingOverview([visit('heavy', 22, 'push', 4, 0), visit('light', 23, 'push', 4, 0)], (id) => bench(id, id === 'heavy' ? 3 : 15, 4), exercises, date(29));
assert(repRanges.weeks[6].muscles.chest === 8 && repRanges.weeks[6].muscles.triceps === 4, 'sets of 3 and 15 reps each earn one set, secondary muscles half');

const ppl = [{ id: 'push', muscles: ['chest', 'shoulders', 'triceps'] }, { id: 'pull', muscles: ['lats', 'forearms', 'neck'] }, { id: 'legs', muscles: ['quadriceps'] }];
const defaultPlan = coveragePlan({ goals: ['Build muscle'], experience: 'some', trainingDays: 3 }, ppl);
assert(JSON.stringify(defaultPlan.targets.get('chest')) === JSON.stringify({ min: 8, max: 16 }), 'Build muscle with some experience targets 8-16 sets');
assert(JSON.stringify(defaultPlan.targets.get('forearms')) === JSON.stringify({ min: 3, max: 5 }), 'accessory muscles get the scaled support range');
assert(JSON.stringify(defaultPlan.targets.get('abdominals')) === JSON.stringify({ min: 8, max: 16 }), 'default splits train abs, matching the recommender');
assert(!defaultPlan.targets.has('neck'), 'default splits leave neck outside the plan');
assert(defaultPlan.windowDays === 15, 'three slots on three days use two weeks plus a day');
const customPlan = coveragePlan({ goals: ['Feel healthier', 'Get stronger'], experience: 'experienced', trainingDays: 3 }, ['a', 'b', 'c', 'd'].map((id) => ({ id: `custom:${id}`, muscles: ['chest', 'neck'] })));
assert(JSON.stringify(customPlan.targets.get('chest')) === JSON.stringify({ min: 6, max: 12 }), 'the most demanding goal wins');
assert(customPlan.targets.has('neck') && !customPlan.targets.has('abdominals'), 'custom splits keep exactly the muscles they list');
assert(customPlan.windowDays === 20, 'a four-slot rotation on three days spans two rotations plus a day');
assert(JSON.stringify(coveragePlan({ experience: 'new' }, ppl).targets.get('chest')) === JSON.stringify({ min: 2, max: 5 }), 'no goal falls back to Feel healthier, scaled for new lifters');

const history2 = (sets: Record<number, number>) => trainingOverview([visit('start', 1, 'push', 1, 0), ...Object.keys(sets).map((day) => visit(`d${day}`, Number(day), 'push', 0, 0))], (id) => id === 'start' ? [] : bench(id, 8, sets[Number(id.slice(1))]), exercises, date(29));
// Window: Sept 15-29 (15 days). Sept 1 is outside it, so history is complete.
const below = muscleCoverage(history2({ 22: 8, 29: 8 }), 'chest', defaultPlan);
assert(below.status === 'below' && Math.abs(below.setsPerWeek - 16 * 7 / 15) < 1e-9 && below.thisWeekSets === 8, 'under the range with full history is below goal');
assert(muscleCoverage(history2({ 15: 2, 22: 8, 29: 8 }), 'chest', defaultPlan).status === 'onTrack', 'the first day of the window counts');
assert(muscleCoverage(history2({ 22: 20, 29: 20 }), 'chest', defaultPlan).status === 'above', 'beyond the range is above goal, uncapped');
assert(muscleCoverage(history2({ 22: 8 }), 'biceps', defaultPlan).status === 'outside', 'muscles outside the plan have no status');

const newUser = trainingOverview([visit('first', 26, 'push', 4, 0)], (id) => bench(id, 8, 4), exercises, date(29));
assert(muscleCoverage(newUser, 'chest', defaultPlan).status === 'building', 'less than one rotation of history is gathering, not below');
assert(muscleCoverage(newUser, 'chest', defaultPlan).setsPerWeek === 4, 'early history averages over at least a week, never extrapolating upward');
// Started Sept 20: ten days of history, so ten days' sets average over ten days rather than the 15-day window.
const recentStart = trainingOverview([visit('first', 20, 'push', 6, 0), visit('second', 27, 'push', 6, 0)], (id) => bench(id, 8, 6), exercises, date(29));
assert(coverageDays(recentStart, defaultPlan) === 10 && Math.abs(muscleCoverage(recentStart, 'chest', defaultPlan).setsPerWeek - 12 * 7 / 10) < 1e-9, 'newer users average since their first workout');
assert(muscleCoverage(recentStart, 'chest', defaultPlan).status === 'onTrack', 'a new user training to plan is on track, not diluted below');
assert(muscleCoverage(recentStart, 'quadriceps', defaultPlan).status === 'below', 'after one rotation an untrained planned muscle is below goal');
assert(coverageDays(history2({ 22: 8 }), defaultPlan) === 15, 'long histories use the full window');
const eagerUser = trainingOverview([visit('first', 22, 'push', 40, 0)], (id) => bench(id, 8, 40), exercises, date(29));
assert(muscleCoverage(eagerUser, 'chest', defaultPlan).status === 'above', 'above goal shows from day one');

// A muscle trained every Monday evening is not below goal on Monday morning.
const at = (day: number, hour: number) => new Date(2026, 8, day, hour);
const mondays = trainingOverview([31, 14, 21].map((day, index) => ({ ...visit(`m${day}`, day, 'push', 5, 0), workout: { id: `m${day}`, split: 'push' as const, createdAt: index ? at(day, 18) : new Date(2026, 7, 31, 18), endedAt: index ? at(day, 18) : new Date(2026, 7, 31, 18) } })), (id) => bench(id, 8, 5), exercises, at(28, 8));
assert(muscleCoverage(mondays, 'chest', coveragePlan({}, ppl)).status === 'onTrack', 'the extra window day keeps both previous Mondays in range');

const shortChart = trainingOverview([visit('start', 1, 'push', 1, 0), visit('older', 17, 'push', 6, 0)], (id) => bench(id, 8, id === 'older' ? 6 : 0), exercises, date(29), 1);
assert(muscleCoverage(shortChart, 'chest', defaultPlan).setsPerWeek > 0, 'coverage windows reach beyond the charted weeks');
const futureOnly = trainingOverview([visit('future', 30, 'push', 4, 0)], (id) => bench(id, 8, 4), exercises, date(29));
assert(futureOnly.exposures.length === 0 && muscleCoverage(futureOnly, 'chest', defaultPlan).status === 'building', 'future workouts are ignored');

const sample = (['onTrack', 'outside', 'below', 'above', 'building', 'below'] as const).map((status, index) => ({ muscle: `m${index}`, setsPerWeek: index, thisWeekSets: 0, target: status === 'outside' ? null : { min: 8, max: 16 }, status }));
assert(JSON.stringify(coverageSummary(sample)) === JSON.stringify({ below: 2, onTrack: 1, above: 1, building: 1, outside: 1, planned: 5 }), 'summary counts each status and the planned muscles');
assert(JSON.stringify([...sample].sort(compareCoverage).map(({ status }) => status)) === JSON.stringify(['above', 'below', 'below', 'building', 'onTrack', 'outside']), 'needs-attention muscles sort first');
assert([...sample].sort(compareCoverage)[1].muscle === 'm2', 'the muscle furthest below its range comes first');
