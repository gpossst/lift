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

// Mirrors the subset of the Worker's onboarding payload the website collects.
export type Onboarding = { goals: string[]; experience: 'new' | 'some' | 'experienced'; trainingDays: number }

export async function submitOnboarding(onboarding: Onboarding) {
  const response = await fetch(`${baseURL}/v1/onboarding`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(onboarding) })
  if (!response.ok) throw new Error('Could not save your training preferences.')
}

/** True when the signed-in account has never completed onboarding on any device. */
export async function needsOnboarding() {
  const response = await fetch(`${baseURL}/v1/profile`, { credentials: 'include' })
  if (!response.ok) return false
  const { profile } = await response.json() as { profile?: { recommendationPreferences?: { experience?: string | null } } }
  return !profile?.recommendationPreferences?.experience
}
