import type { Exercise } from '@/db/exercise-catalog';
import type { WorkoutVisitSummary, WorkoutVisitExerciseDetail, WorkoutMuscleRating } from '@/db';

type Totals = { workouts: number; sets: number; volume: number };
type SplitTotals = Totals & { muscles: Record<string, number>; coverage: Record<string, number> };
type Week = Totals & { start: Date; splits: Record<string, SplitTotals>; muscles: Record<string, number>; coverage: Record<string, number> };
// Six effective sets is a demanding weekly target: four sets of eight reps
// score about 89%, while five reach the cap.
export const COVERAGE_TARGET = 6;
const coveragePercentage = (dose: number) => Math.min(100, Math.max(0, dose / COVERAGE_TARGET * 100));
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

/** Coverage and totals through this week; the final week's target is still in progress. */
export function trainingOverview(
  visits: readonly WorkoutVisitSummary[],
  detailsForVisit: (workoutId: string) => WorkoutVisitExerciseDetail[],
  exercises: readonly Exercise[],
  now = new Date(),
  _ratingsForVisit: (workoutId: string) => WorkoutMuscleRating[] = () => [],
  weekCount = 8,
) {
  const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  currentWeekStart.setDate(currentWeekStart.getDate() - (currentWeekStart.getDay() + 6) % 7);
  const start = new Date(currentWeekStart);
  start.setDate(start.getDate() - 7 * (weekCount - 1));
  const weeks: Week[] = Array.from({ length: weekCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index * 7);
    return { start: date, ...emptyTotals(), splits: {}, muscles: {}, coverage: {} };
  });
  const inProgress = weeks[weeks.length - 1];
  const catalog = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  for (const visit of visits) {
    const date = visit.workout.endedAt ?? visit.workout.createdAt;
    if (date > now || date < weeks[0].start) continue;
    const index = weeks.findLastIndex((week) => date >= week.start);
    const week = weeks[index];
    add(week, visit.sets, visit.volume);
    const split = week.splits[visit.workout.split] ??= { ...emptyTotals(), muscles: {}, coverage: {} };
    add(split, visit.sets, visit.volume);
    const visitCoverage: Record<string, number> = {};
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
      const primaryMuscles = validMuscles(details.primaryMuscles);
      const secondaryMuscles = validMuscles(details.secondaryMuscles);
      const exposure = new Map<string, number>();
      for (const muscle of primaryMuscles) exposure.set(muscle, 1);
      for (const muscle of secondaryMuscles) if (!exposure.has(muscle)) exposure.set(muscle, .5);
      if (!exposure.size) exposure.set(item.area.toLowerCase(), 1);
      const qualifyingSets = exercise.sets.filter((set) => Number.isFinite(set.reps) && set.reps > 0);
      const dose = qualifyingSets.reduce((total, set) => {
        const repDose = Math.max(.5, Math.min(1.5, set.reps / 6));
        return total + repDose;
      }, 0);
      if (dose === 0) continue;
      for (const [muscle, share] of exposure) {
        const sets = qualifyingSets.length * share;
        week.muscles[muscle] = (week.muscles[muscle] ?? 0) + sets;
        split.muscles[muscle] = (split.muscles[muscle] ?? 0) + sets;
        visitCoverage[muscle] = (visitCoverage[muscle] ?? 0) + dose * share;
      }
    }
    for (const [muscle, dose] of Object.entries(visitCoverage)) {
      week.coverage[muscle] = (week.coverage[muscle] ?? 0) + dose;
      split.coverage[muscle] = (split.coverage[muscle] ?? 0) + dose;
    }
  }
  const sum = (items: readonly Week[]): Totals => items.reduce((total, week) => ({ workouts: total.workouts + week.workouts, sets: total.sets + week.sets, volume: total.volume + week.volume }), emptyTotals());
  return { weeks, inProgress, previous: sum(weeks.slice(-8, -4)), current: sum(weeks.slice(-4)) };
}

export function muscleCoverage(weeks: readonly Week[], muscle: string, split?: string) {
  if (!weeks.length) return 0;
  return weeks.reduce((total, week) => total + coveragePercentage((split ? week.splits[split]?.coverage[muscle] : week.coverage[muscle]) ?? 0), 0) / weeks.length;
}

/** Headline coverage: the rounded mean across `muscles`. Every overall figure goes through this so screens can't disagree. */
export function averageCoverage(weeks: readonly Week[], muscles: readonly string[], split?: string) {
  return muscles.length ? Math.round(muscles.reduce((sum, muscle) => sum + muscleCoverage(weeks, muscle, split), 0) / muscles.length) : 0;
}

/** Body-map fill: the neutral `empty` fill at 0%, blending to `full` (the accent) at the weekly target. Both are #RRGGBB. */
export function coverageColor(value: number, empty: string, full: string) {
  const progress = Math.max(0, Math.min(100, value)) / 100;
  const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const to = channels(full);
  return `#${channels(empty).map((channel, index) => Math.round(channel + (to[index] - channel) * progress).toString(16).padStart(2, '0')).join('')}`;
}

/** Caption beside a chart total, e.g. "workout · past month". */
export const trainingTotalLabel = (metric: keyof Totals, total: number, range: string) => `${total === 1 && metric !== 'volume' ? metric.slice(0, -1) : metric} · ${range}`;

export function splitCoverage(weeks: readonly Week[], definitions: readonly { id: string; name: string; muscles: readonly string[] }[]) {
  const current = weeks.slice(4);
  return definitions.map(({ id, name, muscles }) => {
    const musclePercentages = Object.fromEntries(muscles.map((muscle) => [muscle, muscleCoverage(current, muscle, id)]));
    return { id, name, musclePercentages, percentage: averageCoverage(current, muscles, id) };
  });
}

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
