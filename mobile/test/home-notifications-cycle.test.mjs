import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('home.tsx', readFileSync(new URL('../src/app/(home)/index.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let cycle, reset, carousel;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useCallback' && node.arguments[0].getText(source).includes('const timer = setInterval')) cycle = node.arguments[0];
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0].getText(source).includes('notificationIndex.current = 0')) reset = node.arguments[0];
  if (ts.isJsxOpeningElement(node) && node.attributes.getText(source).includes('ref={notificationScroll}')) carousel = node;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(cycle && reset && carousel, 'Test the real carousel callbacks');
const run = (node, context) => vm.runInNewContext(ts.transpile(`(${node.getText(source)})`, { target: ts.ScriptTarget.ES2022 }), context);
let tick, cleared, now = 0;
const scrolls = [];
const context = {
  activeWorkout: null, notificationCount: 3, notificationWidth: 300, notificationGap: 10, notificationCycleMs: 5_000,
  reduceMotion: false, screenReaderEnabled: false, AppState: { currentState: 'active' }, Date: { now: () => now },
  notificationPausedUntil: { current: 0 }, notificationIndex: { current: 0 },
  notificationScroll: { current: { scrollTo: (options) => scrolls.push(options) } },
  setInterval: (callback, delay) => { assert.equal(delay, 5_000); tick = callback; return 1; },
  clearInterval: (timer) => { cleared = timer; tick = undefined; },
};
const start = () => run(cycle, context)();
const cleanup = start();
tick(); tick(); tick();
assert.deepEqual(scrolls.map(({ x }) => x), [310, 620, 0], 'Advance and wrap to the first card');
assert.ok(scrolls.every(({ animated }) => animated));
const handler = (name) => {
  const attribute = carousel.attributes.properties.find((property) => property.name?.getText(source) === name);
  assert.ok(attribute, `Missing ${name}`);
  return run(attribute.initializer.expression, context);
};
handler('onTouchStart')();
tick();
assert.equal(scrolls.length, 3, 'Do not move a card under a finger');
handler('onScroll')({ nativeEvent: { contentOffset: { x: 620 - 44 } } });
handler('onTouchEnd')();
now = 4_999;
tick();
assert.equal(scrolls.length, 3, 'Give manual interaction at least five seconds');
now = 5_000;
tick();
assert.equal(scrolls.at(-1).x, 0, 'Continue from the manually selected final card');
context.AppState.currentState = 'background';
tick();
assert.equal(scrolls.length, 4, 'Do not cycle in the background');
context.AppState.currentState = 'active';
handler('onTouchStart')();
handler('onTouchCancel')();
assert.equal(context.notificationPausedUntil.current, 10_000, 'A cancelled touch must not pause forever');
cleanup();
assert.equal(cleared, 1, 'Remove the timer on blur or dependency changes');
for (const override of [{ notificationCount: 0 }, { notificationCount: 1 }, { activeWorkout: {} }, { reduceMotion: true }, { screenReaderEnabled: true }]) {
  const original = { ...context };
  Object.assign(context, override);
  assert.equal(start(), undefined);
  assert.equal(tick, undefined, 'Hidden, single-card and accessible carousels need no timer');
  Object.assign(context, original);
}
run(reset, context)();
assert.equal(context.notificationIndex.current, 0);
assert.equal(scrolls.at(-1).x, 0);
assert.equal(scrolls.at(-1).animated, false, 'New content or widths reset without animation');
console.log('Home notification cycling regressions passed.');
