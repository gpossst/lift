import { useAppearance } from '@/components/appearance-provider';
import { getCustomSplits } from '@/db';
import { useRecommendationContext } from '@/hooks/use-recommendation-context';
import { defaultWorkoutSplits } from '@/lib/exercise-recommendations';
import { coveragePlan } from '@/lib/training-overview';

/** The active split rotation and the goal-driven coverage plan for it; `plan` is null until preferences load. */
export function useCoveragePlan() {
  const { useCustomSplits } = useAppearance();
  const { context, ready } = useRecommendationContext();
  const customSplits = getCustomSplits();
  const schedule = useCustomSplits && customSplits.length ? customSplits : defaultWorkoutSplits;
  return { schedule, customSplits, plan: ready ? coveragePlan(context, schedule) : null };
}
