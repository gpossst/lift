import { buildDemoFriendComments, buildDemoFriendRecords } from './demo-data';
import { friendWorkoutKey, groupFriendRecords } from '../lib/friend-record-groups';

const now = Date.UTC(2026, 8, 27, 12);
const records = buildDemoFriendRecords(now);
const comments = buildDemoFriendComments(now);

const check = (condition: unknown) => { if (!condition) throw new Error('Demo friend activity is inconsistent.'); };
check(records.length === 6);
check(groupFriendRecords(records).map((workout) => workout.records.length).join(',') === '3,2,1');
for (const record of records) {
  check(record.commentCount === (comments[friendWorkoutKey(record)]?.length ?? 0));
  check(record.completedAt <= now / 1000);
  check(record.completedAt > now / 1000 - 7 * 24 * 60 * 60);
}
