import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const temp = mkdtempSync(join(tmpdir(), 'lift-sync-regression-'));
execFileSync('tsc', ['--noEmit', 'false', '--outDir', join(temp, 'compiled')]);
const { default: handler, __testDeleteAccount: deleteAccount, __testPullSyncChanges: pull, __testPushSyncChunk: push } = await import(`file://${join(temp, 'compiled', 'index.js')}`);
const mf = new Miniflare(convertV4MiniflareOptions({
  compatibilityDate: '2026-08-31',
  modules: true,
  script: 'export default { fetch() { return new Response("ok") } }',
  d1Databases: { DB: 'sync-regression' },
}));
const DB = await mf.getD1Database('DB');
for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
  for (const statement of readFileSync(join('migrations', file), 'utf8').split(';').map((sql) => sql.trim()).filter(Boolean)) await DB.prepare(statement).run();
}
const deletionPage = await handler.fetch(new Request('https://test/delete-account'), { DB });
if (deletionPage.status !== 200 || !(await deletionPage.text()).includes('Delete your Lift account')) throw new Error('Public deletion resource is unavailable.');
const webRequest = () => handler.fetch(new Request('https://test/v1/deletion-requests', { method: 'POST', body: JSON.stringify({ email: 'OWNER@example.com', confirm: true }) }), { DB });
const requested = await (await webRequest()).json();
const retriedRequest = await (await webRequest()).json();
if (!requested.requestId || requested.requestId !== retriedRequest.requestId) throw new Error('Web deletion request retry created a duplicate.');
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
const feedbackKey = ['children', 'bench', 'accepted'].join('\u001f');
const feedback = await send('feedback', [{ entity: 'feedback', key: feedbackKey, operation: 'upsert', baseRevision: 0, record: { workoutId: 'children', exerciseId: 'bench', action: 'accepted', createdAt: 22 } }]);
if (feedback.response.status !== 200 || !(await DB.prepare('SELECT 1 AS present FROM recommendation_feedback WHERE user_id = ? AND workout_local_id = ?').bind('user', 'children').first())) throw new Error('Feedback mutation did not apply.');

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
// lost response or a later Clerk deletion failure.
let deletion = await deleteAccount(env, 'user');
if (deletion.status !== 200 || await DB.prepare("SELECT 1 FROM users WHERE id = 'user'").first() || await DB.prepare("SELECT 1 FROM sync_changes WHERE user_id = 'user'").first()) throw new Error('Account deletion did not cascade.');
deletion = await deleteAccount(env, 'user');
if (deletion.status !== 200) throw new Error('Account deletion retry was not idempotent.');

await mf.dispose();
console.log('Bounded sync, record/account deletion, retry, simultaneous-device, and clock-skew regressions passed.');
