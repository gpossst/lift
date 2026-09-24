import type { Onboarding } from '@/lib/onboarding';
import { apiUrl, authHeaders } from '@/lib/auth-client';

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
export type Profile = { displayName: string; hasChosenDisplayName: boolean; imageUrl: string | null; recommendationPreferences?: RecommendationPreferences };
export type ProfileUpdate = { displayName?: string; recommendationPreferences?: RecommendationPreferences };

async function request<T>(init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}/v1/profile`, { ...init, credentials: 'omit', headers: { ...await authHeaders(), 'Content-Type': 'application/json', ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Could not update profile.');
  return payload;
}

export async function getProfile(): Promise<Profile> {
  return (await request<{ profile: Profile }>()).profile;
}

export async function updateProfile(update: string | ProfileUpdate): Promise<Profile> {
  const body = typeof update === 'string' ? { displayName: update } : update;
  return (await request<{ profile: Profile }>({ method: 'PATCH', body: JSON.stringify(body) })).profile;
}
