import { Platform, Share } from 'react-native';
import { apiUrl, authHeaders } from '@/lib/auth-client';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...init, credentials: 'omit', headers: { ...await authHeaders(), 'Content-Type': 'application/json', ...init?.headers } });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'The account request failed.');
  return payload;
}

export const accountPageUrl = (page: 'privacy' | 'terms' | 'support' | 'delete-account') => `${apiUrl}/${page}`;

export async function exportAccountData(identity: { email: string | null; name: string | null }) {
  const data = await request<Record<string, unknown>>('/v1/export');
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
