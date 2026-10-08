import type { Exercise } from '@/db/exercise-catalog';
import type { WorkoutVisitSummary, WorkoutVisitExerciseDetail } from '@/db';

type Totals = { workouts: number; sets: number; volume: number };
type SplitTotals = Totals & { muscles: Record<string, number> };
/** `muscles` holds credited sets: 1 per set for a primary muscle, 0.5 for a secondary one. */
type Week = Totals & { start: Date; splits: Record<string, SplitTotals>; muscles: Record<string, number> };
type Exposure = { at: Date; muscles: Record<string, number> };
export type CoverageStatus = 'below' | 'onTrack' | 'above' | 'building' | 'outside';
export type MuscleTarget = { min: number; max: number };
export type MuscleCoverage = { muscle: string; setsPerWeek: number; thisWeekSets: number; target: MuscleTarget | null; status: CoverageStatus };
export type CoveragePlan = { windowDays: number; targets: ReadonlyMap<string, MuscleTarget> };
type CoveragePreferences = { goals?: readonly string[]; experience?: 'new' | 'some' | 'experienced'; trainingDays?: number };
type SplitDefinition = { id: string; muscles: readonly string[] };

// Weekly credited sets per muscle by goal. Product heuristics informed by
// volume dose-response research, not individual prescriptions.
const goalRanges = { muscle: [10, 20], strength: [6, 12], health: [3, 8] } as const;
// Accessory muscles get a support range: compound lifts usually cover them
// through secondary credit, so the goal range would leave them blue forever.
const supportRange = [3, 6] as const;
const accessoryMuscles = new Set(['forearms', 'lower back', 'abductors', 'adductors', 'neck']);
const experienceScale = { new: .6, some: .8, experienced: 1 } as const;
const day = 86_400_000;
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const emptyTotals = (): Totals => ({ workouts: 0, sets: 0, volume: 0 });
const add = (target: Totals, sets: number, volume: number) => { target.workouts += 1; target.sets += sets; target.volume += volume; };

/** Calendar weeks through this week, counting workouts completed so far. */
export function weeklyTrainingHistory(visits: readonly WorkoutVisitSummary[], now = new Date()) {
  const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  currentWeekStart.setDate(currentWeekStart.getDate() - (currentWeekStart.getDay() + 6) % 7);
  const earliest = new Date(currentWeekStart);
  earliest.setDate(earliest.getDate() - 7 * 51);
  for (const visit of visits) {
    const date = visit.workout.endedAt ?? visit.workout.createdAt;
    if (date > now || date >= currentWeekStart || date >= earliest) continue;
    earliest.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    earliest.setDate(earliest.getDate() - (earliest.getDay() + 6) % 7);
  }
  const weeks: (Totals & { start: Date })[] = [];
  for (const start = new Date(earliest); start <= currentWeekStart; start.setDate(start.getDate() + 7)) {
    weeks.push({ start: new Date(start), ...emptyTotals() });
  }
  const byStart = new Map(weeks.map((week) => [week.start.getTime(), week]));
  for (const visit of visits) {
    const date = visit.workout.endedAt ?? visit.workout.createdAt;
    if (date > now || date < earliest) continue;
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const week = byStart.get(start.getTime());
    if (week) add(week, visit.sets, visit.volume);
  }
  return weeks;
}

export function weeklyChartExtrema(weeks: readonly Totals[], metric: keyof Totals) {
  let low = -1;
  let high = -1;
  weeks.forEach((week, index) => {
    if (!week.workouts) return;
    if (low < 0 || week[metric] <= weeks[low][metric]) low = index;
    if (high < 0 || week[metric] >= weeks[high][metric]) high = index;
  });
  return [low, high] as const;
}

/** Weekly totals and credited muscle sets through this week; the final week is still in progress. */
export function trainingOverview(
  visits: readonly WorkoutVisitSummary[],
  detailsForVisit: (workoutId: string) => WorkoutVisitExerciseDetail[],
  exercises: readonly Exercise[],
  now = new Date(),
  weekCount = 8,
) {
  const currentWeekStart = startOfDay(now);
  currentWeekStart.setDate(currentWeekStart.getDate() - (currentWeekStart.getDay() + 6) % 7);
  const start = new Date(currentWeekStart);
  start.setDate(start.getDate() - 7 * (weekCount - 1));
  const weeks: Week[] = Array.from({ length: weekCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index * 7);
    return { start: date, ...emptyTotals(), splits: {}, muscles: {} };
  });
  const inProgress = weeks[weeks.length - 1];
  const catalog = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  // Every past visit, so coverage windows can reach further back than the charted weeks.
  const exposures: Exposure[] = [];
  let firstWorkoutAt: Date | undefined;
  for (const visit of visits) {
    const date = visit.workout.endedAt ?? visit.workout.createdAt;
    if (date > now) continue;
    if (!firstWorkoutAt || date < firstWorkoutAt) firstWorkoutAt = date;
    const index = date < weeks[0].start ? -1 : weeks.findLastIndex((week) => date >= week.start);
    const week = weeks[index];
    const split = week && (week.splits[visit.workout.split] ??= { ...emptyTotals(), muscles: {} });
    if (week) { add(week, visit.sets, visit.volume); add(split!, visit.sets, visit.volume); }
    const credited: Record<string, number> = {};
    for (const exercise of detailsForVisit(visit.workout.id)) {
      const item = catalog.get(exercise.id);
      if (!item) continue;
      let metadata: unknown;
      try { metadata = JSON.parse(item.detailsJson ?? '{}'); } catch { /* Unknown catalog metadata. */ }
      if (!metadata || typeof metadata !== 'object') metadata = {};
      const details = metadata as { category?: unknown; primaryMuscles?: unknown; secondaryMuscles?: unknown };
      if (details.category === 'stretching' || details.category === 'cardio') continue;
      const validMuscles = (value: unknown) => Array.isArray(value)
        ? value.filter((muscle): muscle is string => typeof muscle === 'string' && muscle.trim().length > 0)
        : [];
      const exposure = new Map<string, number>();
      for (const muscle of validMuscles(details.primaryMuscles)) exposure.set(muscle, 1);
      for (const muscle of validMuscles(details.secondaryMuscles)) if (!exposure.has(muscle)) exposure.set(muscle, .5);
      if (!exposure.size) exposure.set(item.area.toLowerCase(), 1);
      // Every logged set counts the same: hard sets across rep ranges build muscle similarly, and the app records no effort.
      const sets = exercise.sets.filter((set) => Number.isFinite(set.reps) && set.reps > 0).length;
      if (!sets) continue;
      for (const [muscle, share] of exposure) credited[muscle] = (credited[muscle] ?? 0) + sets * share;
    }
    if (week) for (const [muscle, sets] of Object.entries(credited)) {
      week.muscles[muscle] = (week.muscles[muscle] ?? 0) + sets;
      split!.muscles[muscle] = (split!.muscles[muscle] ?? 0) + sets;
    }
    exposures.push({ at: date, muscles: credited });
  }
  const sum = (items: readonly Week[]): Totals => items.reduce((total, week) => ({ workouts: total.workouts + week.workouts, sets: total.sets + week.sets, volume: total.volume + week.volume }), emptyTotals());
  return { weeks, inProgress, previous: sum(weeks.slice(-8, -4)), current: sum(weeks.slice(-4)), exposures, firstWorkoutAt, now };
}
export type TrainingOverview = ReturnType<typeof trainingOverview>;

/**
 * Goal-driven weekly set ranges for the muscles in the active split rotation.
 * The window spans two full rotations (at least two weeks) plus a day, so a
 * muscle trained once per rotation isn't "below" on the morning it's due.
 */
export function coveragePlan(preferences: CoveragePreferences, schedule: readonly SplitDefinition[]): CoveragePlan {
  const goals = preferences.goals ?? [];
  const [min, max] = goals.some((goal) => /muscle|bigger/i.test(goal)) ? goalRanges.muscle
    : goals.some((goal) => /strong|lean|lose fat/i.test(goal)) ? goalRanges.strength
      : goalRanges.health;
  const scale = experienceScale[preferences.experience ?? 'some'];
  const days = Math.max(1, Math.min(5, Number.isFinite(preferences.trainingDays) ? preferences.trainingDays! : 3));
  const muscles = new Set(schedule.flatMap((split) => split.muscles));
  // Default splits train abs every day (see the recommender) and list neck, which almost nothing trains.
  if (schedule.some((split) => !split.id.startsWith('custom:'))) { muscles.add('abdominals'); muscles.delete('neck'); }
  const targets = new Map([...muscles].map((muscle) => {
    const [low, high] = accessoryMuscles.has(muscle) ? supportRange : [min, max];
    return [muscle, { min: Math.ceil(low * scale), max: Math.ceil(high * scale) }];
  }));
  return { windowDays: Math.max(14, Math.ceil(14 * Math.max(1, schedule.length) / days)) + 1, targets };
}

/** Local calendar days with training history, counting today and the day of the first workout. */
const historyDays = (overview: TrainingOverview) => overview.firstWorkoutAt
  ? Math.round((startOfDay(overview.now).getTime() - startOfDay(overview.firstWorkoutAt).getTime()) / day) + 1
  : 0;

/**
 * Days the weekly average covers: the plan's window, or less for newer users so
 * their weeks aren't diluted by days before they started. Never under a week, so
 * one early session can't extrapolate into a huge weekly figure.
 */
export const coverageDays = (overview: TrainingOverview, plan: CoveragePlan) => Math.max(7, Math.min(plan.windowDays, historyDays(overview)));

export function muscleCoverage(overview: TrainingOverview, muscle: string, plan: CoveragePlan): MuscleCoverage {
  const days = coverageDays(overview, plan);
  const windowStart = startOfDay(overview.now);
  windowStart.setDate(windowStart.getDate() - (days - 1));
  const sets = overview.exposures.reduce((total, { at, muscles }) => at >= windowStart ? total + (muscles[muscle] ?? 0) : total, 0);
  const setsPerWeek = sets * 7 / days;
  const target = plan.targets.get(muscle) ?? null;
  // Below waits until one full rotation has had a chance to train the muscle; above and on track show from day one.
  const rotationDays = (plan.windowDays - 1) / 2;
  const status: CoverageStatus = !target ? 'outside'
    : setsPerWeek > target.max ? 'above'
      : setsPerWeek >= target.min ? 'onTrack'
        : historyDays(overview) >= rotationDays ? 'below' : 'building';
  return { muscle, setsPerWeek, thisWeekSets: overview.inProgress.muscles[muscle] ?? 0, target, status };
}

const statusOrder: readonly CoverageStatus[] = ['above', 'below', 'building', 'onTrack', 'outside'];
const distance = ({ setsPerWeek, target }: MuscleCoverage) => !target ? -setsPerWeek : setsPerWeek > target.max ? setsPerWeek / target.max : target.min / Math.max(setsPerWeek, .1);
/** Needs-attention first: above, below, building, on track, then muscles outside the plan; furthest from range first. */
export const compareCoverage = (a: MuscleCoverage, b: MuscleCoverage) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || distance(b) - distance(a) || a.muscle.localeCompare(b.muscle);

export function coverageSummary(coverage: readonly MuscleCoverage[]) {
  const counts: Record<CoverageStatus, number> = { below: 0, onTrack: 0, above: 0, building: 0, outside: 0 };
  for (const { status } of coverage) counts[status] += 1;
  return { ...counts, planned: coverage.length - counts.outside };
}

export const coverageStatusLabel: Record<CoverageStatus, string> = { below: 'Below goal', onTrack: 'On track', above: 'Above goal', building: 'Gathering history', outside: 'Not in plan' };
/** Fixed status colors, independent of the accent so blue/yellow accents can't blur meaning. `null` uses the neutral fill. */
export const coverageStatusColor: Record<CoverageStatus, string | null> = { below: '#5194FF', onTrack: '#3FB97A', above: '#FF9A3D', building: null, outside: null };
/** Credited sets to one decimal: secondary work makes half sets common. */
export const formatSets = (sets: number) => String(Math.round(sets * 10) / 10);

/** Caption beside a chart total, e.g. "workout · past month". */
export const trainingTotalLabel = (metric: keyof Totals, total: number, range: string) => `${total === 1 && metric !== 'volume' ? metric.slice(0, -1) : metric} · ${range}`;

/** Consecutive Sunday-start weeks with a workout, counting back from this week (or last week while this one is still empty). */
export function weekStreak(dates: readonly Date[], now = new Date()) {
  const weekStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay()).getTime();
  const weeks = new Set(dates.map(weekStart));
  const cursor = new Date(weekStart(now));
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  for (; weeks.has(cursor.getTime()); cursor.setDate(cursor.getDate() - 7)) streak += 1;
  return streak;
}
