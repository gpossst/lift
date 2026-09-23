import { createAuthClient } from 'better-auth/react'
import { twoFactorClient } from 'better-auth/client/plugins'

const baseURL = (import.meta.env.VITE_API_URL || 'https://api.lift.garrett.one').replace(/\/$/, '')

export const authClient = createAuthClient({
  baseURL,
  fetchOptions: { credentials: 'include' },
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect: ({ twoFactorMethods }) => window.location.assign(`/?twoFactorMethods=${twoFactorMethods?.join(',') || ''}#two-factor`),
    }),
  ],
})
