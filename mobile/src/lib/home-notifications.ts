import type { WorkoutHistoryPoint } from '@/db';

export type PersonalRecord = { exerciseId: string; name: string; weight: number; completedAt: Date; workoutId: string };

/** The first logged weight establishes a baseline; later higher weights are PRs. */
export function recentPersonalRecords(
  histories: { exerciseId: string; name: string; sets: WorkoutHistoryPoint[] }[],
  since: number,
  limit = 3,
): PersonalRecord[] {
  const records: PersonalRecord[] = [];
  for (const { exerciseId, name, sets } of histories) {
    let best = 0;
    for (const set of [...sets].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime() || a.workoutId.localeCompare(b.workoutId) || a.setNumber - b.setNumber)) {
      if (set.weight > best) {
        if (best > 0 && set.completedAt.getTime() >= since) records.push({ exerciseId, name, weight: set.weight, completedAt: set.completedAt, workoutId: set.workoutId });
        best = set.weight;
      }
    }
  }
  return records.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime()).slice(0, limit);
}
