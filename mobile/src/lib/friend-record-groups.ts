import type { FriendPersonalRecord } from './friends';

export function friendRecordKey(record: Pick<FriendPersonalRecord, 'id' | 'workoutId' | 'exerciseId' | 'setNumber'>) {
  return JSON.stringify([record.id, record.workoutId, record.exerciseId, record.setNumber]);
}

export function friendWorkoutKey(workout: Pick<FriendPersonalRecord, 'id' | 'workoutId'>) {
  return JSON.stringify([workout.id, workout.workoutId]);
}

export function groupFriendRecords(records: FriendPersonalRecord[]) {
  const workouts = new Map<string, FriendPersonalRecord[]>();
  for (const record of records) {
    const key = friendWorkoutKey(record);
    const workout = workouts.get(key) ?? [];
    workout.push(record);
    workouts.set(key, workout);
  }
  return [...workouts.entries()]
    .map(([key, entries]) => ({ key, records: entries.sort((a, b) => a.completedAt - b.completedAt || a.setNumber - b.setNumber) }))
    .sort((a, b) => b.records[b.records.length - 1].completedAt - a.records[a.records.length - 1].completedAt);
}
