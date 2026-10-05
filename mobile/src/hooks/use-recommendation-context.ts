import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getProfile } from '@/lib/profile';
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


/** Both the exercise planner and logger resolve the same saved preferences, including offline fallback. */
export function useRecommendationContext() {
  const [state, setState] = useState<{ context: RecommendationContext; ready: boolean }>({ context: {}, ready: false });
  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      const onboarding = contextFromOnboarding(await takePendingOnboarding().catch(() => null));
      const profile = await getProfile().catch(() => null);
      if (!active) return;
      const preferences = profile?.recommendationPreferences ?? {};
      setState({ ready: true, context: {
        goals: preferences.goals ?? onboarding.goals,
        experience: preferences.experience ?? onboarding.experience,
        favoriteExerciseIds: preferences.favoriteExerciseIds ?? onboarding.favoriteExerciseIds,
        routineExerciseIdsBySplit: preferences.routineExerciseIdsBySplit ?? undefined,
        trainingDays: preferences.trainingDays ?? onboarding.trainingDays,
        sessionMinutes: preferences.sessionMinutes ?? onboarding.sessionMinutes,
        weightLb: preferences.weightLb ?? onboarding.weightLb,
      } });
    })();
    return () => { active = false; };
  }, []));
  return state;
}
