import { Stack } from 'expo-router';
import { useAppearance } from '@/components/appearance-provider';

export default function HistoryLayout() {
  const { colors } = useAppearance();
  return <Stack screenOptions={{
    headerShown: false,
    gestureEnabled: true,
    fullScreenGestureEnabled: false,
    contentStyle: { backgroundColor: colors.background },
  }} />;
}
