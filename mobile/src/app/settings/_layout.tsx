import { Stack } from 'expo-router';

import { useAppearance } from '@/components/appearance-provider';

export default function SettingsLayout() {
  const { colors } = useAppearance();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
