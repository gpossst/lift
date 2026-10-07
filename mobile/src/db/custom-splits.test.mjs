import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { mock } from 'bun:test';

const values = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, value); },
  removeItem: (key) => { values.delete(key); },
} });

const web = await import('./index.web');
const connection = new Database(':memory:');
// Upgrade an existing definition without losing its name or making it inactive.
connection.exec('CREATE TABLE custom_splits (id TEXT PRIMARY KEY, name TEXT NOT NULL, muscles_json TEXT NOT NULL); PRAGMA user_version = 15;');
connection.query('INSERT INTO custom_splits VALUES (?, ?, ?)').run('custom:123e4567-e89b-12d3-a456-426614174000', 'Legacy Upper', '["chest"]');
mock.module('expo-sqlite', () => ({ openDatabaseSync: () => ({
  execSync: (sql) => connection.exec(sql),
  runSync: (sql, params = []) => connection.query(sql).run(...params),
  getFirstSync: (sql, params = []) => connection.query(sql).get(...params),
  getAllSync: (sql, params = []) => connection.query(sql).all(...params),
}) }));
mock.module('drizzle-orm/expo-sqlite', () => ({ drizzle: () => ({}) }));
const native = await import('./index.native');
assert.equal(native.getCustomSplits()[0]?.name, 'Legacy Upper');
let adapter = web;
mock.module('@/db', () => ({ getWorkoutSplitDefinition: (split) => adapter.getWorkoutSplitDefinition(split) }));
const { workoutSplitLabel } = await import('../lib/workout-split-label');
for (const db of [web, native]) {
  adapter = db;
  db.clearLocalAccountData();
  const check = (condition) => { if (!condition) throw new Error('Custom split persistence or sync failed.'); };
  check(db.getRecommendedWorkoutSplit() === 'push');
  const split = db.saveCustomSplit({ name: 'Upper', muscles: ['chest', 'lats'] });
  check(db.getCustomSplits()[0]?.id === split.id && db.getWorkoutSplitDefinition(split.id)?.name === 'Upper');
  check(db.getRecommendedWorkoutSplit(new Date(), true) === split.id);
  check(db.getRecommendedWorkoutSplit(new Date(), false) === 'push');
  const created = db.getCloudSyncBatch();
  check(created?.changes.some((change) => change.entity === 'split' && change.record?.name === 'Upper'));
  db.acknowledgeCloudSyncBatch(created.batchId, 1, created.changes.map((change) => ({ entity: change.entity, key: change.key, status: 'accepted', revision: 1 })));
  const workout = db.createWorkout(split.id);
  db.endWorkout(workout.id);
  db.deleteCustomSplit(split.id);
  check(db.getCustomSplits().length === 0);
  check(db.getCloudSyncBatch()?.changes.some((change) => change.entity === 'split' && change.operation === 'upsert' && change.record?.archived === true));
  assert.equal(workoutSplitLabel(db.getWorkoutVisitSummary(workout.id).workout.split), 'Upper');
  assert.deepEqual(db.getWorkoutSplitDefinition(split.id)?.muscles, ['chest', 'lats']);
  assert.equal(db.getRecommendedWorkoutSplit(new Date(), true), 'push');
  assert.throws(() => db.createWorkout(split.id), /archived/);
  const archivedBatch = db.getCloudSyncBatch();
  db.acknowledgeCloudSyncBatch(archivedBatch.batchId, 2, archivedBatch.changes.map((change) => ({ entity: change.entity, key: change.key, status: 'accepted', revision: 2 })));
  db.deleteCustomSplit(split.id);
  assert.equal(db.getCloudSyncBatch(), null, 'repeated deletion is a no-op');
  // Older clients send tombstones: retain any definition already present locally.
  const legacy = db.saveCustomSplit({ name: 'Legacy', muscles: ['chest'] });
  const batch = db.getCloudSyncBatch();
  db.acknowledgeCloudSyncBatch(batch.batchId, 3, batch.changes.map((change) => ({ entity: change.entity, key: change.key, status: 'accepted', revision: 3 })));
  db.mergeCloudSyncChanges([{ entity: 'split', key: legacy.id, operation: 'delete', revision: 4 }], 4);
  assert.equal(db.getCustomSplits().length, 0);
  assert.equal(db.getWorkoutSplitDefinition(legacy.id)?.name, 'Legacy');
}
connection.close();
