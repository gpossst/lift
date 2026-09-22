import type { ClerkTokenProvider } from '@/lib/friends';
import type { Onboarding } from '@/lib/onboarding';

export type RecommendationPreferences = {
  goals?: string[] | null;
  weightLb?: number | null;
  heightInches?: number | null;
  experience?: Onboarding['experience'] | null;
  favoriteExerciseIds?: string[] | null;
  trainingLocation?: Onboarding['trainingLocation'] | null;
  trainingDays?: number | null;
  gymId?: string | null;
  availableEquipment?: string[] | null;
  sessionMinutes?: number | null;
  optInSimilarUsers?: boolean;
};
export type Profile = { clerkUserId: string; displayName: string; imageUrl: string | null; recommendationPreferences?: RecommendationPreferences };
export type ProfileUpdate = { displayName?: string; recommendationPreferences?: RecommendationPreferences };

const endpoint = process.env.EXPO_PUBLIC_SYNC_API_URL?.replace(/\/$/, '');

async function request<T>(getToken: ClerkTokenProvider, init?: RequestInit): Promise<T> {
  if (!endpoint) throw new Error('Cloud sync is not configured.');
  const token = await getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const response = await fetch(`${endpoint}/v1/profile`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Could not update profile.');
  return payload;
}

export async function getProfile(getToken: ClerkTokenProvider): Promise<Profile> {
  return (await request<{ profile: Profile }>(getToken)).profile;
}

export async function updateProfile(getToken: ClerkTokenProvider, update: string | ProfileUpdate): Promise<Profile> {
  const body = typeof update === 'string' ? { displayName: update } : update;
  return (await request<{ profile: Profile }>(getToken, { method: 'PATCH', body: JSON.stringify(body) })).profile;
}
