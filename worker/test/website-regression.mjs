import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the page's request handler without adding a browser/DOM test dependency.
const source = readFileSync('../website/src/routes/feedback.tsx', 'utf8');
const runSource = source.match(/  async function run\([\s\S]*?(?=  async function submit\()/)?.[0];
assert.ok(runSource, 'Feedback request handler not found.');
const javascript = new Bun.Transpiler({ loader: 'ts' }).transformSync(runSource);
const state = { busy: false, message: '', items: null };
const run = new Function('requestId', 'setBusy', 'setMessage', 'setItems', `${javascript}; return run;`)(
  { current: 0 },
  (value) => { state.busy = value; },
  (value) => { state.message = value; },
  (value) => { state.items = value; },
);
const deferred = () => Promise.withResolvers();
const anonymous = deferred();
const signedIn = deferred();
const oldLoad = run(() => anonymous.promise);
const currentLoad = run(() => signedIn.promise);
anonymous.resolve([{ id: 'post', myVote: 0 }]);
await oldLoad;
assert.equal(state.busy, true, 'An older load enabled voting while the current load was pending.');
signedIn.resolve([{ id: 'post', myVote: 1 }]);
await currentLoad;
assert.equal(state.items[0].myVote, 1);

const stale = deferred();
const staleLoad = run(() => stale.promise);
await run(async () => [{ id: 'post', myVote: -1 }]);
stale.resolve([{ id: 'post', myVote: 0 }]);
await staleLoad;
assert.equal(state.items[0].myVote, -1, 'An older response overwrote the latest vote.');

const failed = deferred();
const failedLoad = run(() => failed.promise);
await run(async () => [{ id: 'post', myVote: 1 }]);
failed.reject(new Error('Old request failed'));
await failedLoad;
assert.equal(state.message, '', 'An older failure replaced the current request status.');
console.log('Website feedback request ordering regressions passed.');
