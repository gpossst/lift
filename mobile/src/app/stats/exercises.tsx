import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'react-native-feather';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { loadStatsExercises, StatsExerciseRow, type StatsExercise } from '@/components/stats-exercise-row';
import { ui } from '@/styles/primitives';
import { useWorkoutData } from '@/hooks/use-workout-data';

export default function StatsExercisesScreen() {
  const { colors } = useAppearance();
  const [query, setQuery] = useState('');
  const exercises = useWorkoutData(loadStatsExercises);
  const search = query.trim().toLowerCase();
  const filtered = useMemo(() => exercises.filter((exercise) => exercise.name.toLowerCase().includes(search)), [exercises, search]);
  const renderExercise = useCallback(({ item, index }: { item: StatsExercise; index: number }) => <StatsExerciseRow item={item} last={index === filtered.length - 1} />, [filtered.length]);

  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={() => router.dismissTo('/stats')} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back to stats"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable></View>
    <FlatList data={filtered} keyExtractor={(exercise) => exercise.id} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} ListHeaderComponent={<>
      <Text style={[styles.title, { color: colors.text }]}>Exercises</Text>
      <View style={[styles.searchField, { backgroundColor: colors.surface }]}><Search width={17} height={17} color={colors.subtleText} strokeWidth={2.4} /><TextInput value={query} onChangeText={setQuery} placeholder="Search exercises" placeholderTextColor={colors.subtleText} style={[styles.searchInput, { color: colors.text }]} accessibilityLabel="Search exercises" /></View>
    </>} renderItem={renderExercise} ListEmptyComponent={<Text style={[styles.emptyCopy, { color: colors.mutedText }]}>No matching exercises</Text>} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header: { height: 52, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 56 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2 },
  searchField: { height: 46, marginTop: 14, marginBottom: 10, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, searchInput: { flex: 1, height: '100%', fontSize: 15, fontWeight: '700' },
  emptyCopy: { marginVertical: 16, fontSize: 13, lineHeight: 19, fontWeight: '600' },
});
