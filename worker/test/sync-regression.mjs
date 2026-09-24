import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const temp = mkdtempSync(join(tmpdir(), 'lift-sync-regression-'));
const { default: handler, __testDeleteAccount: deleteAccount, __testExportAccount: exportAccount, __testPullSyncChanges: pull, __testPushSyncChunk: push } = await import('../src/index.ts');
const mf = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-08-31',
  modules: true,
  script: 'export default { fetch() { return new Response("ok") } }',
  d1Databases: { DB: 'sync-regression' },
}));
const DB = await mf.getD1Database('DB');
for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
  if (file === '0013_custom_splits.sql') {
    await DB.prepare("INSERT INTO users (id, created_at) VALUES ('migration-user', 1)").run();
    await DB.prepare("INSERT INTO workouts (user_id, local_id, split, created_at, ended_at, updated_at, sync_revision) VALUES ('migration-user', 'legacy-workout', 'pull', 2, NULL, 2, 1)").run();
    await DB.prepare("INSERT INTO workout_sets (user_id, workout_local_id, exercise_id, set_number, weight, reps, completed_at, updated_at, sync_revision) VALUES ('migration-user', 'legacy-workout', 'row', 1, 50, 8, 3, 3, 1)").run();
    await DB.prepare("INSERT INTO set_muscles (user_id, workout_local_id, exercise_id, set_number, muscle) VALUES ('migration-user', 'legacy-workout', 'row', 1, 'middle back')").run();
    await DB.prepare("INSERT INTO workout_muscle_ratings (user_id, workout_local_id, muscle, exhaustion, created_at, updated_at, sync_revision) VALUES ('migration-user', 'legacy-workout', 'middle back', 4, 4, 4, 1)").run();
    await DB.prepare("INSERT INTO recommendation_feedback (user_id, workout_local_id, exercise_id, action, related_exercise_id, rank, created_at, updated_at, sync_revision) VALUES ('migration-user', 'legacy-workout', 'row', 'accepted', NULL, NULL, 5, 5, 1)").run();
  }
  const source = readFileSync(join('migrations', file), 'utf8');
  const triggers = source.match(/CREATE TRIGGER[\s\S]*?END;/gi) ?? [];
  const ordinary = source.replace(/CREATE TRIGGER[\s\S]*?END;/gi, '');
  for (const statement of ordinary.split(';').map((sql) => sql.trim()).filter(Boolean)) await DB.prepare(statement).run();
  for (const trigger of triggers) await DB.prepare(trigger.replace(/;\s*$/, '')).run();
}
if (!(await DB.prepare("SELECT 1 FROM set_muscles WHERE user_id = 'migration-user' AND muscle = 'middle back'").first())
  || !(await DB.prepare("SELECT 1 FROM recommendation_feedback WHERE user_id = 'migration-user' AND action = 'accepted'").first())) throw new Error('Custom split migration failed to preserve workout relationships.');
const deletionPage = await handler.fetch(new Request('https://test/delete-account'), { DB });
if (deletionPage.status !== 200 || !(await deletionPage.text()).includes('Delete your Lift account')) throw new Error('Public deletion resource is unavailable.');
let deletionRequestCount = 0;
const DELETION_RATE_LIMITER = { limit: async () => ({ success: ++deletionRequestCount <= 5 }) };
const webRequest = (email = 'OWNER@example.com') => handler.fetch(new Request('https://test/v1/deletion-requests', { method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify({ email, confirm: true }) }), { DB, DELETION_RATE_LIMITER });
const requested = await (await webRequest()).json();
const retriedRequest = await (await webRequest()).json();
if (!requested.requestId || requested.requestId !== retriedRequest.requestId) throw new Error('Web deletion request retry created a duplicate.');
for (let request = 2; request < 5; request++) await webRequest(`owner${request}@example.com`);
const throttledRequest = await webRequest('owner5@example.com');
if (throttledRequest.status !== 429 || (await DB.prepare('SELECT COUNT(*) AS count FROM account_deletion_requests').first()).count !== 4) throw new Error('Web deletion requests were not rate limited before the database write.');
await DB.prepare("INSERT INTO users (id, created_at) VALUES ('user', 1)").run();
const env = { DB };
const workout = (id, createdAt = 10) => ({ entity: 'workout', key: id, operation: 'upsert', baseRevision: 0, record: { id, split: 'push', createdAt, endedAt: null } });
const send = async (batchId, changes) => {
  const response = await push(new Request('https://test/v1/sync', { method: 'POST', body: JSON.stringify({ batchId, changes }) }), env, 'user');
  return { response, body: await response.json() };
};
const row = async (id) => DB.prepare('SELECT split, created_at AS createdAt, sync_revision AS revision FROM workouts WHERE user_id = ? AND local_id = ?').bind('user', id).first();

// D1 batch is atomic: the first write is rolled back when a later statement fails.
await DB.exec("CREATE TRIGGER fail_second BEFORE INSERT ON workouts WHEN NEW.local_id = 'explode' BEGIN SELECT RAISE(ABORT, 'forced partial failure'); END;");
let failed = false;
try { await send('partial', [workout('before-explosion'), workout('explode')]); } catch { failed = true; }
if (!failed || await row('before-explosion')) throw new Error('Partial failure committed part of a sync chunk.');
await DB.exec('DROP TRIGGER fail_second;');
const recovered = await send('partial', [workout('before-explosion'), workout('explode')]);
if (recovered.response.status !== 200 || !(await row('before-explosion')) || !(await row('explode'))) throw new Error('Atomic chunk could not be retried after failure.');

// A lost response retries the same idempotency key without another revision/change.
const first = await send('retry', [workout('retry')]);
const retry = await send('retry', [workout('retry')]);
const retryChanges = await DB.prepare("SELECT COUNT(*) AS count FROM sync_changes WHERE user_id = 'user' AND record_key = 'retry'").first();
if (first.body.revision !== retry.body.revision || retryChanges.count !== 1) throw new Error('Retry was not idempotent.');

// Every mutation shape executes without per-record reads; a maximal set still
// stays inside the three-record chunk's statement budget.
const parent = await send('children-parent', [workout('children')]);
const setKey = ['children', 'bench', 1].join('\u001f');
const ratingKey = ['children', 'chest'].join('\u001f');
const children = await send('children', [
  { entity: 'set', key: setKey, operation: 'upsert', baseRevision: 0, record: { workoutId: 'children', exerciseId: 'bench', setNumber: 1, weight: 100, reps: 5, completedAt: 20, muscles: ['chest', 'triceps', 'shoulders', 'biceps', 'lats', 'traps', 'forearms', 'abdominals'] } },
  { entity: 'rating', key: ratingKey, operation: 'upsert', baseRevision: 0, record: { workoutId: 'children', muscle: 'chest', exhaustion: 4, createdAt: 21 } },
]);
if (children.response.status !== 200 || (await DB.prepare('SELECT COUNT(*) AS count FROM set_muscles WHERE user_id = ? AND workout_local_id = ?').bind('user', 'children').first()).count !== 8) throw new Error('Set/rating chunk did not apply atomically.');
const feedbackKey = ['children', 'bench', 'impression'].join('\u001f');
const feedback = await send('feedback', [{ entity: 'feedback', key: feedbackKey, operation: 'upsert', baseRevision: 0, record: { workoutId: 'children', exerciseId: 'bench', action: 'impression', rank: 1, createdAt: 22 } }]);
if (feedback.response.status !== 200 || !(await DB.prepare('SELECT 1 AS present FROM recommendation_feedback WHERE user_id = ? AND workout_local_id = ?').bind('user', 'children').first())) throw new Error('Feedback mutation did not apply.');

// Custom split definitions and workouts share the same revision stream, export,
// and durable delete path as existing sync records.
const splitId = 'custom:123e4567-e89b-12d3-a456-426614174000';
const splitRecord = { id: splitId, name: 'Upper body', muscles: ['chest', 'lats', 'shoulders', 'biceps', 'triceps'] };
const splitChange = { entity: 'split', key: splitId, operation: 'upsert', baseRevision: 0, record: splitRecord };
const customWorkout = workout('custom-workout'); customWorkout.record.split = splitId;
const customCreated = await send('custom-create', [splitChange, customWorkout]);
if (customCreated.response.status !== 200 || (await row('custom-workout')).split !== splitId) throw new Error('Custom split definition or workout did not sync.');
const exported = await (await exportAccount(env, 'user')).json();
if (exported.splits.length !== 1 || exported.splits[0].id !== splitId || exported.splits[0].name !== splitRecord.name || JSON.stringify(exported.splits[0].muscles) !== JSON.stringify(splitRecord.muscles)) throw new Error('Custom split was not included in account export.');
const invalidCustom = workout('invalid-custom'); invalidCustom.record.split = 'custom:too-short';
if ((await send('invalid-custom', [invalidCustom])).response.status !== 400) throw new Error('Malformed custom split ID passed sync validation.');
const splitDelete = await send('custom-delete', [{ entity: 'split', key: splitId, operation: 'delete', baseRevision: customCreated.body.revision }]);
if (splitDelete.response.status !== 200 || await DB.prepare('SELECT 1 FROM user_splits WHERE user_id = ? AND id = ?').bind('user', splitId).first()) throw new Error('Custom split deletion did not remove the definition.');
const splitChanges = await DB.prepare("SELECT entity, deleted FROM sync_changes WHERE user_id = ? AND record_key = ? ORDER BY id").bind('user', splitId).all();
if (splitChanges.results.length !== 2 || splitChanges.results[0].entity !== 'split' || splitChanges.results[1].deleted !== 1) throw new Error('Custom split upsert/delete revisions were not recorded.');

// A server revision, not the device clock, decides a later edit.
const initial = await send('clock-a', [workout('clock', 4_000_000_000)]);
const skewed = workout('clock', 1);
skewed.baseRevision = initial.body.revision;
skewed.record.split = 'pull';
await send('clock-b', [skewed]);
if ((await row('clock')).split !== 'pull') throw new Error('Device clock incorrectly won over server revision.');

// Two devices editing the same base revision converge on the first accepted server revision.
const deviceA = workout('simultaneous'); deviceA.record.split = 'legs';
const deviceB = workout('simultaneous'); deviceB.record.split = 'pull';
await send('device-a', [deviceA]);
await send('device-b', [deviceB]);
if ((await row('simultaneous')).split !== 'legs') throw new Error('Stale simultaneous edit overwrote a server revision.');

// Deletes are durable changes and appear in cursor pagination.
const created = await send('delete-create', [workout('deleted')]);
await send('delete', [{ entity: 'workout', key: 'deleted', operation: 'delete', baseRevision: created.body.revision }]);
if (await row('deleted')) throw new Error('Deletion did not remove the live record.');
const pageResponse = await pull(env, 'user', new URL('https://test/v1/sync?cursor=0&limit=2'));
const page = await pageResponse.json();
if (page.changes.length !== 2 || !page.hasMore || page.cursor <= 0) throw new Error('Changes were not bounded and paginated.');
let cursor = 0;
let sawDelete = false;
do {
  const response = await pull(env, 'user', new URL(`https://test/v1/sync?cursor=${cursor}&limit=2`));
  const body = await response.json();
  sawDelete ||= body.changes.some((change) => change.key === 'deleted' && change.operation === 'delete');
  cursor = body.cursor;
  if (!body.hasMore) break;
} while (true);
if (!sawDelete) throw new Error('Deletion tombstone was missing from paginated changes.');

// Account deletion cascades every child table and is safe to retry after a
// lost response or a later identity deletion failure.
let deletion = await deleteAccount(env, 'user');
if (deletion.status !== 200 || await DB.prepare("SELECT 1 FROM users WHERE id = 'user'").first() || await DB.prepare("SELECT 1 FROM sync_changes WHERE user_id = 'user'").first()) throw new Error('Account deletion did not cascade.');
deletion = await deleteAccount(env, 'user');
if (deletion.status !== 200) throw new Error('Account deletion retry was not idempotent.');

await mf.dispose();
console.log('Bounded sync, record/account deletion, retry, simultaneous-device, and clock-skew regressions passed.');
