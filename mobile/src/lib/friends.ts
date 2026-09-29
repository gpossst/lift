import { apiUrl, authHeaders } from '@/lib/auth-client';

export type Friend = {
  id: string;
  displayName: string;
  imageUrl: string | null;
};

export type FriendsSummary = {
  count: number;
  users: Friend[];
  blocked: Friend[];
};

export type FriendPersonalRecord = Friend & {
  workoutId: string;
  setNumber: number;
  exerciseId: string;
  weight: number;
  reps: number;
  completedAt: number;
  liked: boolean;
  likeCount: number;
  commentCount: number;
};

export type FriendComment = { id: string; body: string; createdAt: number; displayName: string; imageUrl: string | null; mine: boolean };
type WorkoutKey = Pick<FriendPersonalRecord, 'id' | 'workoutId'>;

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
  return requestFriends('/v1/friends');
}

export async function getFriendPersonalRecords(): Promise<FriendPersonalRecord[]> {
  return (await request<{ prs: FriendPersonalRecord[] }>('/v1/friends/prs')).prs;
}

export async function setFriendWorkoutLike(workout: WorkoutKey, liked: boolean): Promise<{ liked: boolean; likeCount: number }> {
  return request('/v1/friends/workouts/likes', { method: liked ? 'POST' : 'DELETE', body: JSON.stringify(workout) });
}

export async function getFriendWorkoutComments(workout: WorkoutKey): Promise<{ comments: FriendComment[]; commentCount: number }> {
  return request(`/v1/friends/workouts/comments?${new URLSearchParams({ id: workout.id, workoutId: workout.workoutId })}`);
}

export async function addFriendWorkoutComment(workout: WorkoutKey, body: string): Promise<{ comments: FriendComment[]; commentCount: number }> {
  return request('/v1/friends/workouts/comments', { method: 'POST', body: JSON.stringify({ id: workout.id, workoutId: workout.workoutId, body }) });
}

export async function addFriend(code: string): Promise<FriendsSummary> {
  return requestFriends('/v1/friends', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function removeFriend(friendId: string): Promise<FriendsSummary> {
  return requestFriends(`/v1/friends/${encodeURIComponent(friendId)}`, { method: 'DELETE' });
}

export async function blockFriend(friendId: string): Promise<FriendsSummary> {
  return requestFriends(`/v1/friends/${encodeURIComponent(friendId)}/block`, { method: 'POST' });
}

export async function unblockFriend(friendId: string): Promise<FriendsSummary> {
  return requestFriends(`/v1/friends/${encodeURIComponent(friendId)}/block`, { method: 'DELETE' });
}

async function requestFriends(path: string, init?: RequestInit): Promise<FriendsSummary> {
  const { friends } = await request<{ friends: FriendsSummary }>(path, init);
  return { ...friends, blocked: friends.blocked ?? [] };
}
