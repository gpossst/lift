import { ui } from '@/styles/primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'react-native-feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/components/appearance-provider';
import { StatsPanel } from '@/components/stats-panel';

export default function ProgressScreen() {
  const { colors } = useAppearance();
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const back = () => router.canGoBack() ? router.back() : router.replace('/stats');
  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={back} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable><Text style={[styles.headerTitle, { color: colors.text }]}>Exercise analysis</Text></View>
    <StatsPanel key={exerciseId ?? 'default'} initialExerciseId={exerciseId} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header: { height: 52, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerTitle: { fontSize: 15, fontWeight: '800' },
});
