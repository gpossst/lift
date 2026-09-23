import { apiUrl, authHeaders } from '@/lib/auth-client';

export type Friend = {
  id: string;
  displayName: string;
  imageUrl: string | null;
};

export type FriendsSummary = {
  count: number;
  users: Friend[];
};

export type FriendPersonalRecord = Friend & {
  exerciseId: string;
  weight: number;
  reps: number;
  completedAt: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'omit',
    headers: {
      ...await authHeaders(),
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Could not update friends.');
  return payload;
}

/** Friend records are scoped by the authenticated user on the API. */
export async function getFriendCode(): Promise<string> {
  return (await request<{ code: string }>('/v1/friends/code')).code;
}

export async function getFriends(): Promise<FriendsSummary> {
  return (await request<{ friends: FriendsSummary }>('/v1/friends')).friends;
}

export async function getFriendPersonalRecords(): Promise<FriendPersonalRecord[]> {
  return (await request<{ prs: FriendPersonalRecord[] }>('/v1/friends/prs')).prs;
}

export async function addFriend(code: string): Promise<FriendsSummary> {
  return (await request<{ friends: FriendsSummary }>('/v1/friends', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })).friends;
}
