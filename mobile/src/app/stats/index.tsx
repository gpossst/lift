import { ui } from '@/styles/primitives';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, Search } from 'react-native-feather';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getWorkoutVisitExercises, getWorkoutVisits } from '@/db';
import { useAppearance } from '@/components/appearance-provider';

export default function StatsScreen() {
  const { colors } = useAppearance();
  const [query, setQuery] = useState('');
  const loadExercises = useCallback(() => {
    const sessions = new Map<string, { id: string; name: string; sessions: number }>();
    for (const visit of getWorkoutVisits()) for (const exercise of getWorkoutVisitExercises(visit.workout.id)) {
      const entry = sessions.get(exercise.id);
      if (entry) entry.sessions += 1;
      else sessions.set(exercise.id, { id: exercise.id, name: exercise.name, sessions: 1 });
    }
    return [...sessions.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
  }, []);
  const [exercises, setExercises] = useState(loadExercises);
  useFocusEffect(useCallback(() => { setExercises(loadExercises()); }, [loadExercises]));
  const filtered = exercises.filter((exercise) => exercise.name.toLowerCase().includes(query.trim().toLowerCase()));

  return <SafeAreaView edges={['top', 'right', 'left']} style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={ui.header}><Text style={[ui.title, { color: colors.text }]}>Stats</Text></View>
    <View style={[styles.searchField, { backgroundColor: colors.surface }]}><Search width={18} height={18} color={colors.subtleText} strokeWidth={2.3} /><TextInput value={query} onChangeText={setQuery} placeholder="Search exercises" placeholderTextColor={colors.subtleText} style={[styles.searchInput, { color: colors.text }]} accessibilityLabel="Search exercises" /></View>
    <FlatList data={filtered} keyExtractor={(exercise) => exercise.id} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} renderItem={({ item }) => <Pressable onPress={() => router.push({ pathname: '/stats/progress', params: { exerciseId: item.id } })} style={({ pressed }) => [styles.exerciseRow, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`View progress for ${item.name}`}><View style={styles.exerciseCopy}><Text style={[styles.exerciseName, { color: colors.text }]}>{item.name}</Text><Text style={[styles.exerciseMeta, { color: colors.mutedText }]}>{item.sessions} {item.sessions === 1 ? 'session' : 'sessions'}</Text></View><ChevronRight width={20} height={20} color={colors.subtleText} strokeWidth={2.2} /></Pressable>} ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>{exercises.length ? 'No matching exercises' : 'No stats yet'}</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>{exercises.length ? 'Try a different search.' : 'Log an exercise to see its progress here.'}</Text></View>} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  searchField: { height: 48, marginHorizontal: 24, marginTop: 4, marginBottom: 8, paddingHorizontal: 14, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, height: '100%', fontSize: 15, fontWeight: '700' },
  listContent: { paddingHorizontal: 24, paddingBottom: 30, flexGrow: 1 },
  exerciseRow: { minHeight: 72, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  exerciseCopy: { flex: 1, paddingRight: 12 },
  exerciseName: { fontSize: 16, fontWeight: '900', letterSpacing: -.4 },
  exerciseMeta: { marginTop: 3, fontSize: 12, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -.8 },
  emptyCopy: { marginTop: 7, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  pressed: { opacity: .62 },
});
