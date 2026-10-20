import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('layout.tsx', readFileSync(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const lifecycle = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'CloudSyncLifecycle');
assert.ok(lifecycle);
const run = (code, context) => vm.runInNewContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), context);

function recovery(platform = 'ios', discard = false) {
  const events = [], effects = [];
  let buttons;
  const context = {
    authClient: { useSession: () => ({ data: { user: { id: 'b' } }, isPending: false }), signOut: async () => { events.push('sign-out'); } },
    useAppearance: () => ({ setUseCustomSplits() {} }), useRef: (current) => ({ current }),
    useEffect: (effect) => effects.push(effect),
    setCloudSyncUser: (id) => events.push(['sync-user', id]),
    prepareCloudSyncForUser: (id, force) => { events.push(['prepare', id, force]); return force; },
    getProfile: async () => ({ recommendationPreferences: {} }),
    syncWorkoutData: async () => { events.push('sync'); }, getRejectedCloudSyncChanges: () => [],
    Platform: { OS: platform }, window: { confirm: () => discard },
    Alert: { alert: (_title, _message, choices) => { buttons = choices; } },
    AppState: { addEventListener: () => ({ remove: () => events.push('unsubscribe') }) },
  };
  run(`(${lifecycle.getText(source)})`, context)({ onReady: (id) => events.push(['ready', id]) });
  const cleanup = effects.at(-1)();
  return { events, cleanup, choose: (text) => buttons.find((button) => button.text === text).onPress() };
}

const native = recovery();
assert.deepEqual(native.events, [['ready', null], ['sync-user', null], ['prepare', 'b', false]]);
native.choose('Discard Changes');
assert.deepEqual(native.events.slice(3), [['prepare', 'b', true], ['sync-user', 'b'], ['ready', 'b'], 'sync']);
native.cleanup();

const cancelled = recovery();
cancelled.choose('Sign Out');
assert.equal(cancelled.events.at(-1), 'sign-out');
assert.equal(cancelled.events.some((event) => event === 'sync'), false);
cancelled.cleanup();

const stale = recovery();
stale.cleanup();
const before = [...stale.events];
stale.choose('Discard Changes');
stale.choose('Sign Out');
assert.deepEqual(stale.events, before, 'a prompt from a previous session cannot erase data or sign out a new session');

for (const discard of [false, true]) {
  const web = recovery('web', discard);
  assert.equal(web.events.includes('sync'), discard);
  assert.equal(web.events.includes('sign-out'), !discard);
  web.cleanup();
}

let guard;
(function visit(node) {
  if (ts.isConditionalExpression(node) && node.condition.getText(source).startsWith('!isLoaded')) guard = node.condition.getText(source);
  ts.forEachChild(node, visit);
})(source);
assert.ok(guard);
const blocked = (boundUserId) => run(guard, { isLoaded: true, isSignedIn: true, session: { user: { id: 'b' } }, boundUserId });
assert.equal(blocked(null), true);
assert.equal(blocked('a'), true, 'the new account cannot mount screens backed by the previous cache');
assert.equal(blocked('b'), false);
console.log('Account recovery lifecycle and cache readiness checks passed.');
