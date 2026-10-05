import { Stack } from 'expo-router';
import { useAppearance } from '@/components/appearance-provider';

export const unstable_settings = { anchor: 'index' };

export default function StatsLayout() {
  const { colors } = useAppearance();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
    <Stack.Screen name="index" />
    <Stack.Screen name="(history)" options={{ gestureEnabled: true }} />
    <Stack.Screen name="progress" options={{ gestureEnabled: true, fullScreenGestureEnabled: true }} />
    <Stack.Screen name="muscles" options={{ gestureEnabled: true, fullScreenGestureEnabled: true }} />
  </Stack>;
}
