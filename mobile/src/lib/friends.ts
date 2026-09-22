export type ClerkTokenProvider = () => Promise<string | null>;

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

const endpoint = process.env.EXPO_PUBLIC_SYNC_API_URL?.replace(/\/$/, '');

async function request<T>(getToken: ClerkTokenProvider, path: string, init?: RequestInit): Promise<T> {
  if (!endpoint) throw new Error('Cloud sync is not configured.');

  const token = await getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  const response = await fetch(`${endpoint}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Could not update friends.');
  return payload;
}

/** Friend records are scoped by the authenticated Clerk user on the API. */
export async function getFriendCode(getToken: ClerkTokenProvider): Promise<string> {
  return (await request<{ code: string }>(getToken, '/v1/friends/code')).code;
}

export async function getFriends(getToken: ClerkTokenProvider): Promise<FriendsSummary> {
  return (await request<{ friends: FriendsSummary }>(getToken, '/v1/friends')).friends;
}

export async function getFriendPersonalRecords(getToken: ClerkTokenProvider): Promise<FriendPersonalRecord[]> {
  return (await request<{ prs: FriendPersonalRecord[] }>(getToken, '/v1/friends/prs')).prs;
}

export async function addFriend(getToken: ClerkTokenProvider, code: string): Promise<FriendsSummary> {
  return (await request<{ friends: FriendsSummary }>(getToken, '/v1/friends', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })).friends;
}
