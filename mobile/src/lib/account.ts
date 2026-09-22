import { Platform, Share } from 'react-native';

import type { ClerkTokenProvider } from '@/lib/friends';

const endpoint = process.env.EXPO_PUBLIC_SYNC_API_URL?.replace(/\/$/, '');

async function request<T>(getToken: ClerkTokenProvider, path: string, init?: RequestInit): Promise<T> {
  if (!endpoint) throw new Error('Cloud sync is not configured.');
  const token = await getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  const response = await fetch(`${endpoint}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'The account request failed.');
  return payload;
}

export const accountPageUrl = (page: 'privacy' | 'terms' | 'support' | 'delete-account') => endpoint ? `${endpoint}/${page}` : null;

export async function deleteAccountData(getToken: ClerkTokenProvider) {
  await request<{ deleted: true }>(getToken, '/v1/account', { method: 'DELETE' });
}

export async function exportAccountData(getToken: ClerkTokenProvider, identity: { email: string | null; name: string | null }) {
  const data = await request<Record<string, unknown>>(getToken, '/v1/export');
  const contents = JSON.stringify({ ...data, identity }, null, 2);
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `lift-export-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: 'Lift data export', message: contents });
}
