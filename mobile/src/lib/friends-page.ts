import { getFriendCode, getFriendPersonalRecords, getFriends } from '@/lib/friends';
import { getProfile } from '@/lib/profile';

export async function loadFriendsPage() {
  const profile = await getProfile();
  if (!profile.hasChosenDisplayName) return { profile, code: null, friends: null, records: [] };
  const [code, friends, records] = await Promise.all([getFriendCode(), getFriends(), getFriendPersonalRecords()]);
  return { profile, code, friends, records };
}

let preloaded: { userId: string; startedAt: number; promise: ReturnType<typeof loadFriendsPage> } | null = null;

export function preloadFriendsPage(userId: string) {
  const promise = loadFriendsPage();
  preloaded = { userId, startedAt: Date.now(), promise };
  void promise.catch(() => { if (preloaded?.promise === promise) preloaded = null; });
  return promise;
}

export function takeFriendsPage(userId: string) {
  if (preloaded?.userId !== userId || Date.now() - preloaded.startedAt >= 30_000) return loadFriendsPage();
  const { promise } = preloaded;
  preloaded = null;
  return promise;
}
