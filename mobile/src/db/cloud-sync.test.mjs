import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { mock } from 'bun:test';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';

const values = new Map();
process.env.EXPO_PUBLIC_SEED_DEMO_DATA = 'false';
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, value); },
  removeItem: (key) => { values.delete(key); },
} });
const web = await import('./index.web.ts');
const connection = new Database(':memory:');
mock.module('expo-sqlite', () => ({ openDatabaseSync: () => ({
  execSync: (sql) => connection.exec(sql),
  runSync: (sql, params = []) => connection.query(sql).run(...params),
  getFirstSync: (sql, params = []) => connection.query(sql).get(...params),
  getAllSync: (sql, params = []) => connection.query(sql).all(...params),
}) }));
mock.module('drizzle-orm/expo-sqlite', () => ({ drizzle: () => ({}) }));
const native = await import('./index.native.ts');
let adapter = web;
mock.module('@/db', () => Object.fromEntries(['acknowledgeCloudSyncBatch', 'getCloudSyncBatch', 'getCloudSyncCursor', 'hasPendingCloudSync', 'mergeCloudSyncChanges', 'recordCloudSyncFailure', 'rejectCloudSyncBatch'].map((name) => [name, (...args) => adapter[name](...args)])));
mock.module('@/lib/auth-client', () => ({ apiUrl: 'https://sync.test', authHeaders: async () => ({}) }));
const { syncWorkoutData, setCloudSyncUser, subscribeWorkoutData } = await import('../lib/cloud-sync.ts');
const workerRoot = new URL('../../../worker/', import.meta.url);
const requireWorker = createRequire(new URL('package.json', workerRoot));
const { convertV4MiniflareOptions, Miniflare } = await import(requireWorker.resolve('miniflare'));
const { __testPushSyncChunk: push, __testPullSyncChanges: pull } = await import(new URL('src/index.ts', workerRoot).href);
const mf = new Miniflare(convertV4MiniflareOptions({ compatibilityDate: '2026-08-31', modules: true,
  script: 'export default { fetch() { return new Response("ok") } }', d1Databases: { DB: 'client-sync-regression' } }));
try {
  const DB = await mf.getD1Database('DB');
  for (const file of readdirSync(new URL('migrations/', workerRoot)).filter((name) => name.endsWith('.sql')).sort()) {
    const source = readFileSync(new URL(`migrations/${file}`, workerRoot), 'utf8');
    const triggers = source.match(/CREATE TRIGGER[\s\S]*?END;/gi) ?? [];
    for (const sql of source.replace(/CREATE TRIGGER[\s\S]*?END;/gi, '').split(';').map((sql) => sql.trim()).filter(Boolean)) await DB.prepare(sql).run();
    for (const sql of triggers) await DB.prepare(sql.replace(/;\s*$/, '')).run();
  }
  for (const [name, local] of [['web', web], ['native', native]]) {
    adapter = local;
    local.clearLocalAccountData();
    await DB.prepare('INSERT INTO users (id, created_at) VALUES (?, 1)').bind(name).run();
    local.prepareCloudSyncForUser(name);
    setCloudSyncUser(name);
    let requests = 0;
    const serverFetch = async (url, init) => {
      requests += 1;
      if (String(url).includes('/recommendations')) throw new Error('Sync should not fetch peer recommendations.');
      if (init?.method === 'POST') return push(new Request(url, init), { DB }, name);
      return pull({ DB }, name, new URL(url));
    };
    globalThis.fetch = serverFetch;
    const exerciseId = local.getExercises()[0].id;
    const workout = local.createWorkout('push');
    const set = { exerciseId, workoutId: workout.id, setNumber: 1, weight: 100, reps: 8, completedAt: new Date() };
    local.saveWorkoutSet(set);
    const edit = (weight) => local.updateWorkoutSet(exerciseId, local.getWorkoutHistory(exerciseId).find((item) => item.workoutId === workout.id), { weight, reps: 8 });
    for (const weight of [100.123, -1, Infinity, 10001]) assert.throws(() => local.updateWorkoutSet(exerciseId, set, { weight, reps: 8 }));
    for (const reps of [0, 1.5, 10001]) assert.throws(() => local.saveWorkoutSet({ ...set, setNumber: 2, reps }));
    assert.throws(() => local.saveWorkoutSet({ ...set, setNumber: 101 }));
    // Reproduce an edit after receipt acknowledgment but before the pull page.
    const batch = local.getCloudSyncBatch();
    const receipt = await (await push(new Request('https://sync.test/v1/sync', { method: 'POST', body: JSON.stringify(batch) }), { DB }, name)).json();
    assert.throws(() => local.acknowledgeCloudSyncBatch(batch.batchId, receipt.revision, undefined));
    assert.equal(local.getCloudSyncBatch().batchId, batch.batchId, 'invalid legacy receipt keeps the durable batch');
    local.acknowledgeCloudSyncBatch(batch.batchId, receipt.revision, receipt.results);
    edit(105);
    assert.equal(local.getCloudSyncBatch().changes[0].baseRevision, receipt.revision);
    let refreshedWeight;
    const unsubscribe = subscribeWorkoutData(() => {
      refreshedWeight = local.getWorkoutHistory(exerciseId)[0]?.weight;
    });
    await syncWorkoutData();
    assert.equal(refreshedWeight, 105, 'mounted stats readers reload after pulled changes have merged');
    refreshedWeight = undefined;
    await syncWorkoutData();
    assert.equal(refreshedWeight, undefined, 'an empty pull does not refresh stats');
    unsubscribe();
    assert.equal(local.getWorkoutHistory(exerciseId)[0].weight, 105, 'ack-before-pull edit survives');
    assert.equal((await DB.prepare('SELECT weight FROM workout_sets WHERE user_id = ?').bind(name).first()).weight, 105);
    assert.equal(local.hasPendingCloudSync(), false);
    // Legacy invalid data must leave the upload queue without losing its local values.
    if (name === 'web') {
      const sets = JSON.parse(values.get('lift-preview-sets')); sets[0].weight = 100.123;
      values.set('lift-preview-sets', JSON.stringify(sets));
    } else connection.query('UPDATE workout_sets SET weight = 100.123 WHERE workout_id = ?').run(workout.id);
    local.markCloudSyncDirty('set', [workout.id, exerciseId, 1].join('\u001f'));
    const other = local.createWorkout('pull');
    local.getCloudSyncBatch(); // Keep invalid + valid sibling payloads across the retry.
    await syncWorkoutData();
    assert.equal(refreshedWeight, undefined, 'unmounted readers stop receiving sync updates');
    assert.equal(local.getRejectedCloudSyncChanges().length, 1);
    assert.equal(local.hasPendingCloudSync(), false);
    assert.equal(local.getWorkoutHistory(exerciseId)[0].weight, 100.123);
    assert.equal(local.prepareCloudSyncForUser('someone-else'), false);
    assert.ok(await DB.prepare('SELECT 1 FROM workouts WHERE user_id = ? AND local_id = ?').bind(name, other.id).first(), 'invalid record does not block later uploads');
    const rejectedSet = local.getRejectedCloudSyncChanges()[0];
    assert.equal(local.resubmitCloudSyncChange('set', rejectedSet.key), true);
    await syncWorkoutData();
    assert.equal(local.getRejectedCloudSyncChanges().length, 1, 'invalid resubmission returns to review without looping');
    // Rebuild from the current local value rather than replaying a stale refused payload.
    if (name === 'web') {
      const sets = JSON.parse(values.get('lift-preview-sets')); sets[0].weight = 110;
      values.set('lift-preview-sets', JSON.stringify(sets));
    } else connection.query('UPDATE workout_sets SET weight = 110 WHERE workout_id = ?').run(workout.id);
    assert.equal(local.resubmitCloudSyncChange('set', rejectedSet.key), true);
    assert.equal(local.getCloudSyncBatch().changes[0].record.weight, 110);
    await syncWorkoutData();
    assert.equal(local.getRejectedCloudSyncChanges().length, 0);
    assert.equal((await DB.prepare('SELECT weight FROM workout_sets WHERE user_id = ?').bind(name).first()).weight, 110);
    // A valid successor made during the failed request replaces its invalid predecessor.
    if (name === 'web') {
      const sets = JSON.parse(values.get('lift-preview-sets')); sets[0].weight = 100.123;
      values.set('lift-preview-sets', JSON.stringify(sets));
    } else connection.query('UPDATE workout_sets SET weight = 100.123 WHERE workout_id = ?').run(workout.id);
    local.markCloudSyncDirty('set', [workout.id, exerciseId, 1].join('\u001f'));
    let corrected = false;
    globalThis.fetch = async (url, init) => {
      if (init?.method === 'POST' && !corrected) { corrected = true; edit(115); }
      return serverFetch(url, init);
    };
    await syncWorkoutData();
    assert.equal(local.getRejectedCloudSyncChanges().length, 0);
    assert.equal(local.getWorkoutHistory(exerciseId)[0].weight, 115);
    // A competing device wins stale edits, but the attempted value stays reviewable.
    const remote = local.getCloudSyncBatch();
    assert.equal(remote, null);
    const latest = await DB.prepare('SELECT sync_revision AS revision FROM workout_sets WHERE user_id = ?').bind(name).first();
    await push(new Request('https://sync.test/v1/sync', { method: 'POST', body: JSON.stringify({ batchId: `${name}-peer`, changes: [{ entity: 'set', key: [workout.id, exerciseId, 1].join('\u001f'), operation: 'upsert', baseRevision: latest.revision, record: { ...set, weight: 120, completedAt: Math.floor(set.completedAt.getTime() / 1000), muscles: [] } }] }) }), { DB }, name);
    edit(125);
    await syncWorkoutData();
    assert.equal(local.getWorkoutHistory(exerciseId)[0].weight, 120);
    assert.equal(local.getRejectedCloudSyncChanges()[0].record.weight, 125);
    assert.equal(local.getRejectedCloudSyncChanges()[0].conflict, true);
    assert.equal(local.resubmitCloudSyncChange('set', local.getRejectedCloudSyncChanges()[0].key), false, 'resubmission cannot silently overwrite a device conflict');
    // A remote parent deletion keeps attempted child values reachable for review.
    const parentRevision = await DB.prepare('SELECT sync_revision AS revision FROM workouts WHERE user_id = ? AND local_id = ?').bind(name, workout.id).first();
    await push(new Request('https://sync.test/v1/sync', { method: 'POST', body: JSON.stringify({ batchId: `${name}-peer-delete`, changes: [{ entity: 'workout', key: workout.id, operation: 'delete', baseRevision: parentRevision.revision }] }) }), { DB }, name);
    await syncWorkoutData();
    assert.ok(local.getWorkoutVisitSummary(workout.id), 'parent retained until the rejected child is reviewed');
    assert.equal(local.getRejectedCloudSyncChanges().length, 2);
    // Confirming the parent deletion resolves rejected children and unclaimed changes.
    local.deleteWorkout(workout.id);
    await syncWorkoutData();
    assert.equal(local.getRejectedCloudSyncChanges().length, 0);
    assert.equal(local.hasPendingCloudSync(), false);
    // Transport failures keep the exact immutable payload and idempotency key.
    local.createWorkout('legs');
    const retryBatch = local.getCloudSyncBatch();
    globalThis.fetch = async () => Response.json({ error: 'Temporary failure' }, { status: 503 });
    await assert.rejects(syncWorkoutData(), /Temporary failure/);
    assert.deepEqual(local.getCloudSyncBatch(), retryBatch);
    assert.equal(local.getRejectedCloudSyncChanges().length, 0);
    globalThis.fetch = serverFetch;
    await syncWorkoutData();
    assert.equal(local.hasPendingCloudSync(), false);
    assert.ok(requests > 0);
  }
  setCloudSyncUser(null);
  console.log('Native/web sync with actual Worker D1: receipts, edit race, validation, terminal rejection, correction, conflicts, and deletion passed.');
} finally {
  setCloudSyncUser(null);
  await mf.dispose();
  connection.close();
}
