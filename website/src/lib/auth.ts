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

export type FeedbackKind = 'bug' | 'feature' | 'other'
export type Feedback = { id: string; kind: FeedbackKind; body: string; createdAt: number; author: string; score: number; myVote: -1 | 0 | 1 }

/** Every feedback request returns the full, freshly ranked list. */
export async function feedbackRequest(path = '', init?: { method: 'POST'; body: unknown }) {
  const response = await fetch(`${baseURL}/v1/feedback${path}`, { credentials: 'include', ...init && { method: init.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) } })
  const data = await response.json().catch(() => ({})) as { feedback?: Feedback[]; error?: string }
  if (!response.ok || !data.feedback) throw new Error(data.error || 'Could not load feedback.')
  return data.feedback
}
