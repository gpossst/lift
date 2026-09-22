import type { WorkoutHistoryPoint } from '@/db';

export type LiftProgress = {
  workoutId: string;
  date: Date;
  value: number;
  bestSet: WorkoutHistoryPoint;
  sets: WorkoutHistoryPoint[];
};

export function progressFor(history: WorkoutHistoryPoint[], usesWeight: boolean): LiftProgress[] {
  const sessions = new Map<string, LiftProgress>();
  for (const set of history) {
    const value = usesWeight ? set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30) : set.reps;
    const session = sessions.get(set.workoutId);
    if (!session) sessions.set(set.workoutId, { workoutId: set.workoutId, date: set.completedAt, value, bestSet: set, sets: [set] });
    else {
      session.sets.push(set);
      if (set.completedAt > session.date) session.date = set.completedAt;
      if (value > session.value) { session.value = value; session.bestSet = set; }
    }
  }
  return [...sessions.values()]
    .map((session) => ({ ...session, sets: session.sets.sort((a, b) => a.setNumber - b.setNumber) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}
