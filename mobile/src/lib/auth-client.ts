import { expoClient } from '@better-auth/expo/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

export const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'https://api.lift.garrett.one').replace(/\/$/, '');

export const authClient = createAuthClient({
  baseURL: `${apiUrl}/api/auth`,
  plugins: [
    expoClient({ scheme: 'mobile', storagePrefix: 'lift', storage: SecureStore }),
    twoFactorClient(),
  ],
});

export async function authHeaders(): Promise<HeadersInit> {
  const cookie = await authClient.getCookie();
  return cookie ? { Cookie: cookie } : {};
}
