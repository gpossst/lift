import assert from 'node:assert/strict';
import { mock } from 'bun:test';

let userId = 'a';
let profileRequest = async () => ({ recommendationPreferences: { goals: ['strength'], weightLb: 180, favoriteExerciseIds: ['bench'], routineExerciseIdsBySplit: { push: ['bench'] } } });
let slots = [];
let cursor = 0;
let pendingEffect;
let pendingLayout;
let cleanup;
let focusedCallback;
mock.module('react', () => ({
  useLayoutEffect: (callback) => { pendingLayout = callback; },
  useState: (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
  },
  useRef: (initial) => { const index = cursor++; return slots[index] ??= { current: initial }; },
  useCallback: (callback, dependencies) => {
    const index = cursor++;
    if (!slots[index] || dependencies.some((value, i) => value !== slots[index].dependencies[i])) slots[index] = { callback, dependencies };
    return slots[index].callback;
  },
}));
mock.module('expo-router', () => ({ useFocusEffect: (callback) => {
  if (callback !== focusedCallback) {
    focusedCallback = callback;
    pendingEffect = () => { cleanup?.(); cleanup = callback(); };
  }
} }));
mock.module('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: userId ? { user: { id: userId } } : null }) } }));
mock.module('@/lib/profile', () => ({ getProfile: () => profileRequest() }));
mock.module('@/lib/onboarding', () => ({ takePendingOnboarding: async () => null }));
const { useRecommendationContext } = await import('./use-recommendation-context');
const Render = () => { cursor = 0; const result = useRecommendationContext(); pendingLayout?.(); return result; };
const settle = async () => {
  pendingEffect?.(); pendingEffect = undefined;
  await new Promise((resolve) => setTimeout(resolve, 0));
  return Render();
};
const remount = () => { cleanup?.(); slots = []; focusedCallback = undefined; return Render(); };

assert.equal(Render().ready, false);
const a = await settle();
assert.equal(a.context.weightLb, 180);
assert.deepEqual(a.context.routineExerciseIdsBySplit, { push: ['bench'] });
profileRequest = async () => { throw new Error('Offline'); };
remount();
assert.strictEqual((await settle()).context, a.context, 'same-account offline cache remains usable');
userId = null;
assert.deepEqual(Render().context, {}, 'sign-out must immediately hide the previous account');
await settle();
userId = 'b';
assert.deepEqual(Render().context, {}, 'switching a mounted hook must immediately hide account A');
const b = await settle();
assert.equal(b.ready, true);
assert.equal(b.context.goals, undefined);
assert.equal(b.context.weightLb, undefined);
assert.equal(b.context.favoriteExerciseIds, undefined);
assert.equal(b.context.routineExerciseIdsBySplit, undefined);

// A response arriving between B's render and effect cleanup cannot overwrite B's cache.
userId = 'a';
let resolveA;
profileRequest = () => new Promise((resolve) => { resolveA = resolve; });
Render();
await settle();
userId = 'b';
Render();
resolveA({ recommendationPreferences: { weightLb: 999 } });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(remount().context.weightLb, undefined);
profileRequest = async () => ({ recommendationPreferences: { weightLb: 150 } });
assert.equal((await settle()).context.weightLb, 150);
userId = 'c';
profileRequest = () => new Promise(() => {});
assert.deepEqual(remount().context, {});
pendingEffect?.(); pendingEffect = undefined;
await new Promise((resolve) => setTimeout(resolve, 3100));
assert.equal(Render().ready, true, 'timeout resolves a new account without old preferences');
assert.equal(Render().context.weightLb, undefined);
cleanup?.();
console.log('Recommendation account isolation checks passed.');
