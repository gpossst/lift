import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ClerkTokenProvider } from '@/lib/friends';

export type Onboarding = { displayName?: string; goals: string[]; weightLb: number; heightInches: number; experience: 'new' | 'some' | 'experienced'; favoriteExerciseIds: string[]; trainingLocation: 'gym' | 'home' | 'both'; trainingDays: number };

const key = 'lift-pending-onboarding';
const endpoint = process.env.EXPO_PUBLIC_SYNC_API_URL?.replace(/\/$/, '');

export async function savePendingOnboarding(value: Onboarding) {
  const serialized = JSON.stringify(value);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, serialized);
  else await SecureStore.setItemAsync(key, serialized);
}

export async function takePendingOnboarding(): Promise<Onboarding | null> {
  const serialized = Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) : await SecureStore.getItemAsync(key);
  try { return serialized ? JSON.parse(serialized) as Onboarding : null; } catch { return null; }
}

export async function clearPendingOnboarding() {
  if (Platform.OS === 'web') globalThis.localStorage?.removeItem(key);
  else await SecureStore.deleteItemAsync(key);
}

export async function submitOnboarding(getToken: ClerkTokenProvider, onboarding: Onboarding) {
  if (!endpoint) throw new Error('Cloud sync is not configured.');
  const token = await getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const response = await fetch(`${endpoint}/v1/onboarding`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(onboarding) });
  if (!response.ok) throw new Error('Could not save onboarding.');
}
