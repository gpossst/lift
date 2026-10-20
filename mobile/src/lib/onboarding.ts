import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { apiUrl, authHeaders } from '@/lib/auth-client';
import type { SplitPresetId } from '@/lib/split-routines';

export type Onboarding = { displayName?: string; goals: string[]; weightLb?: number; heightInches?: number; experience: 'new' | 'some' | 'experienced'; favoriteExerciseIds?: string[]; trainingLocation?: 'gym' | 'home' | 'both'; trainingDays: number; splitPreset?: SplitPresetId };

// Pre-auth answers live unowned until a sign-up claims them; afterwards only that account's key is read or cleared.
const unclaimedKey = 'lift-pending-onboarding';
const accountKey = (userId: string) => `${unclaimedKey}.${userId.replace(/[^a-zA-Z0-9.-]/g, (character) => `_${character.charCodeAt(0).toString(16)}_`)}`;
let claiming: Promise<void> = Promise.resolve();

const read = async (key: string) => Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
const write = async (key: string, value: string) => { if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value); else await SecureStore.setItemAsync(key, value); };
const remove = async (key: string) => { if (Platform.OS === 'web') globalThis.localStorage?.removeItem(key); else await SecureStore.deleteItemAsync(key); };

export async function savePendingOnboarding(value: Onboarding) {
  await write(unclaimedKey, JSON.stringify(value));
}

/** Binds onboarding answered before sign-up to the account it created. Sign-in never claims it, so an existing account's profile is not overwritten. */
export function claimPendingOnboarding(userId: string) {
  claiming = claiming.then(async () => {
    const serialized = await read(unclaimedKey);
    if (!serialized) return;
    await write(accountKey(userId), serialized);
    await remove(unclaimedKey);
  }).catch(() => undefined);
  return claiming;
}

export async function takePendingOnboarding(userId: string): Promise<Onboarding | null> {
  await claiming;
  const serialized = await read(accountKey(userId));
  try { return serialized ? JSON.parse(serialized) as Onboarding : null; } catch { return null; }
}

export async function clearPendingOnboarding(userId: string) {
  await remove(accountKey(userId));
}

export async function submitOnboarding(onboarding: Onboarding) {
  const response = await fetch(`${apiUrl}/v1/onboarding`, { method: 'POST', credentials: 'omit', headers: { ...await authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(onboarding) });
  if (!response.ok) throw new Error('Could not save onboarding.');
}
