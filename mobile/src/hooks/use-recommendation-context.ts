import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getProfile, type RecommendationPreferences } from '@/lib/profile';
import { authClient } from '@/lib/auth-client';
import { takePendingOnboarding, type Onboarding } from '@/lib/onboarding';
import type { RecommendationContext } from '@/lib/exercise-recommendations';

function contextFromOnboarding(value: unknown): RecommendationContext {
  if (!value || typeof value !== 'object') return {};
  const onboarding = value as Partial<Onboarding>;
  return {
    goals: Array.isArray(onboarding.goals) ? onboarding.goals.filter((goal): goal is string => typeof goal === 'string') : undefined,
    experience: onboarding.experience === 'new' || onboarding.experience === 'some' || onboarding.experience === 'experienced' ? onboarding.experience : undefined,
    favoriteExerciseIds: Array.isArray(onboarding.favoriteExerciseIds) ? onboarding.favoriteExerciseIds.filter((id): id is string => typeof id === 'string') : undefined,
    trainingDays: typeof onboarding.trainingDays === 'number' && Number.isFinite(onboarding.trainingDays) ? onboarding.trainingDays : undefined,
    weightLb: typeof onboarding.weightLb === 'number' && Number.isFinite(onboarding.weightLb) ? onboarding.weightLb : undefined,
  };
}


// shortcut: in-memory only; persist per account if cold-start offline preferences are needed.
let lastResolved: { userId: string; preferences?: RecommendationPreferences; context: RecommendationContext } | undefined;
const profileTimeoutMs = 3000;

/** Both the exercise planner and logger resolve the same saved preferences, including offline fallback. */
export function useRecommendationContext() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const currentUserId = useRef(userId);
  useLayoutEffect(() => { currentUserId.current = userId; }, [userId]);
  const cached = userId && lastResolved?.userId === userId ? lastResolved : undefined;
  const initialState = { userId, context: cached?.context ?? {}, ready: Boolean(cached) };
  const [state, setState] = useState(initialState);
  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      const onboarding = contextFromOnboarding((userId ? await takePendingOnboarding(userId).catch(() => null) : null));
      if (!active || currentUserId.current !== userId) return;
      // A hanging request counts as offline; the local setup is used instead.
      const profile = userId ? await Promise.race([getProfile(), new Promise<never>((_, reject) => setTimeout(reject, profileTimeoutMs))]).catch(() => null) : null;
      if (!active || currentUserId.current !== userId) return;
      const cachedPreferences = lastResolved?.userId === userId ? lastResolved.preferences : undefined;
      const preferences = (profile ? profile.recommendationPreferences : cachedPreferences) ?? {};
      const context: RecommendationContext = {
        goals: preferences.goals ?? onboarding.goals,
        experience: preferences.experience ?? onboarding.experience,
        favoriteExerciseIds: preferences.favoriteExerciseIds ?? onboarding.favoriteExerciseIds,
        routineExerciseIdsBySplit: preferences.routineExerciseIdsBySplit ?? undefined,
        trainingDays: preferences.trainingDays ?? onboarding.trainingDays,
        sessionMinutes: preferences.sessionMinutes ?? onboarding.sessionMinutes,
        weightLb: preferences.weightLb ?? onboarding.weightLb,
      };
      if (userId) lastResolved = { userId, preferences, context };
      // An unchanged refetch keeps the same object so plans don't recompute or re-animate.
      setState((current) => current.userId === userId && current.ready && JSON.stringify(current.context) === JSON.stringify(context) ? current : { userId, ready: true, context });
    })();
    return () => { active = false; };
  }, [userId]));
  return state.userId === userId ? state : initialState;
}
