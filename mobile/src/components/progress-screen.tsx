import { ui } from '@/styles/primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/components/appearance-provider';
import { StatsPanel } from '@/components/stats-panel';

export default function ProgressScreen() {
  const { colors } = useAppearance();
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const back = () => router.canGoBack() ? router.back() : router.replace('/stats');
  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <StatsPanel key={exerciseId ?? 'default'} initialExerciseId={exerciseId} onBack={back} />
  </SafeAreaView>;
}
