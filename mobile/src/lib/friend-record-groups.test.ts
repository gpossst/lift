import type { FriendPersonalRecord } from './friends';
import { groupFriendRecords } from './friend-record-groups';

const maya = { id: 'maya', workoutId: 'one', exerciseId: 'squat', completedAt: 100, setNumber: 1 } as FriendPersonalRecord;
const jordan = { id: 'jordan', workoutId: 'one', exerciseId: 'press', completedAt: 50, setNumber: 1 } as FriendPersonalRecord;
const laterMaya = { ...maya, exerciseId: 'second-exercise', completedAt: maya.completedAt + 60 };
const groups = groupFriendRecords([laterMaya, jordan, maya]);

if (groups.length !== 2 || groups[0].records[0] !== maya || groups[0].records[1] !== laterMaya || groups[1].records[0] !== jordan) {
  throw new Error('Friend records should form newest-first workouts with exercises in workout order.');
}
