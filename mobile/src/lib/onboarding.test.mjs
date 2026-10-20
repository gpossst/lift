import assert from 'node:assert/strict';
import { mock } from 'bun:test';

const store = new Map();
mock.module('react-native', () => ({ Platform: { OS: 'ios' } }));
mock.module('expo-secure-store', () => ({
  getItemAsync: async (key) => store.get(key) ?? null,
  setItemAsync: async (key, value) => { assert.match(key, /^[\w.-]+$/); store.set(key, value); },
  deleteItemAsync: async (key) => { store.delete(key); },
}));
mock.module('@/lib/auth-client', () => ({ apiUrl: '', authHeaders: async () => ({}) }));
const { savePendingOnboarding, claimPendingOnboarding, takePendingOnboarding, clearPendingOnboarding } = await import('./onboarding');

const answersA = { goals: ['strength'], experience: 'new', trainingDays: 3 };
await savePendingOnboarding(answersA);
assert.equal(await takePendingOnboarding('a'), null, 'unclaimed answers never reach a signed-in account');
void claimPendingOnboarding('a'); // sign-up resolves; the session may mount before the claim finishes
assert.deepEqual(await takePendingOnboarding('a'), answersA, 'the account that signed up gets its answers');
assert.equal(await takePendingOnboarding('b'), null, "a later account cannot read A's unsent answers");

// A's failed upload stays queued for A while B signs in without onboarding, then signs up fresh.
await claimPendingOnboarding('b');
assert.equal(await takePendingOnboarding('b'), null, 'claim without new answers moves nothing');
await savePendingOnboarding({ goals: ['size'], experience: 'some', trainingDays: 4 });
await claimPendingOnboarding('b@x/y');
assert.equal((await takePendingOnboarding('b@x/y')).experience, 'some');
assert.equal(await takePendingOnboarding('b_x_y'), null, 'encoding account IDs must not collapse distinct accounts onto one key');
assert.deepEqual(await takePendingOnboarding('a'), answersA, "A's offline retry survives B");
await clearPendingOnboarding('a');
assert.equal(await takePendingOnboarding('a'), null);
assert.equal((await takePendingOnboarding('b@x/y')).trainingDays, 4, "clearing A leaves B's answers");
console.log('Pending onboarding account binding checks passed.');
