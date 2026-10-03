import type { WorkoutHistoryPoint } from '@/db';

export type LiftProgress = {
  workoutId: string;
  date: Date;
  value: number;
  bestSet: WorkoutHistoryPoint;
  sets: WorkoutHistoryPoint[];
  personalBest: boolean;
};

export type ProgressMetric = 'estimated1RM' | 'maxWeight' | 'volume' | 'bestReps' | 'totalReps';

export function progressFor(history: WorkoutHistoryPoint[], usesWeight: boolean, metric: ProgressMetric = usesWeight ? 'estimated1RM' : 'bestReps'): LiftProgress[] {
  const sessions = new Map<string, LiftProgress>();
  for (const set of history) {
    const value = metric === 'volume' ? set.weight * set.reps
      : metric === 'totalReps' || metric === 'bestReps' ? set.reps
      : metric === 'maxWeight' || set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30);
    const session = sessions.get(set.workoutId);
    if (!session) sessions.set(set.workoutId, { workoutId: set.workoutId, date: set.completedAt, value, bestSet: set, sets: [set], personalBest: false });
    else {
      session.sets.push(set);
      if (set.completedAt > session.date) session.date = set.completedAt;
      if (metric === 'volume' || metric === 'totalReps') {
        session.value += value;
        const bestContribution = metric === 'volume' ? session.bestSet.weight * session.bestSet.reps : session.bestSet.reps;
        if (value > bestContribution) session.bestSet = set;
      } else if (value > session.value) { session.value = value; session.bestSet = set; }
    }
  }
  let previousBest = -Infinity;
  return [...sessions.values()]
    .map((session) => ({ ...session, sets: session.sets.sort((a, b) => a.setNumber - b.setNumber) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((session, index) => {
      const personalBest = index > 0 && session.value > previousBest;
      previousBest = Math.max(previousBest, session.value);
      return { ...session, personalBest };
    });
}

export function comparePeriods(points: LiftProgress[], weeks: number | null, now = new Date()) {
  const end = now.getTime();
  const start = weeks === null ? -Infinity : end - weeks * 7 * 86_400_000;
  const previousStart = weeks === null ? -Infinity : start - weeks * 7 * 86_400_000;
  const current = points.filter((point) => point.date.getTime() >= start && point.date.getTime() <= end);
  const previous = weeks === null ? [] : points.filter((point) => point.date.getTime() >= previousStart && point.date.getTime() < start);
  const average = (items: LiftProgress[]) => items.reduce((total, point) => total + point.value, 0) / items.length;
  return { current, previous, change: current.length >= 2 && previous.length >= 2 && average(previous) > 0
    ? (average(current) - average(previous)) / average(previous) * 100 : null };
}
