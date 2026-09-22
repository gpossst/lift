import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'react-native-feather';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getExercises, getWorkoutVisitExerciseDetails, getWorkoutVisitSummary } from '@/db';
import { exerciseRequiresWeight } from '@/db/exercise-catalog';
import { useAppearance } from '@/components/appearance-provider';

const formatDate = (date: Date) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);

export default function HistoryDetailScreen() {
  const { colors } = useAppearance();
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const visit = workoutId ? getWorkoutVisitSummary(workoutId) : null;
  const exercises = workoutId ? getWorkoutVisitExerciseDetails(workoutId) : [];
  const requiresWeight = new Map(getExercises().map((exercise) => [exercise.id, exerciseRequiresWeight(exercise)]));
  const back = () => router.canGoBack() ? router.back() : router.replace('/history');
  if (!visit) return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}><View style={styles.missing}><Text style={[styles.missingText, { color: colors.text }]}>Workout unavailable</Text><Pressable onPress={back}><Text style={[styles.backText, { color: colors.text }]}>Back to history</Text></Pressable></View></SafeAreaView>;
  const date = visit.workout.endedAt ?? visit.workout.createdAt;
  return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={back} hitSlop={10} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to workout history"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: colors.text }]}>{visit.workout.split[0].toUpperCase() + visit.workout.split.slice(1)} workout</Text><Text style={[styles.date, { color: colors.mutedText }]}>{formatDate(date)}</Text>
      <View style={[styles.totals, { backgroundColor: colors.surface }]}><Stat label="Exercises" value={String(visit.exercises)} colors={colors} /><Stat label="Sets" value={String(visit.sets)} colors={colors} /><Stat label={visit.volume ? exercises.some((exercise) => requiresWeight.get(exercise.id) ?? true) ? 'Volume' : 'Added volume' : 'Reps'} value={visit.volume ? `${visit.volume.toLocaleString()} lb` : String(visit.reps)} colors={colors} /></View>
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>What you did</Text>
      <View style={styles.exerciseList}>{exercises.map((exercise) => { const required = requiresWeight.get(exercise.id) ?? true; const weighted = required || exercise.sets.some((set) => set.weight > 0); return <Pressable key={exercise.id} onPress={() => router.navigate({ pathname: '/history', params: { exerciseId: exercise.id } })} style={({ pressed }) => [styles.exercise, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`View progress for ${exercise.name}`}><Text style={[styles.exerciseName, { color: colors.text }]}>{exercise.name}</Text><View style={[styles.setHeader, { borderColor: colors.surfaceStrong }]}><Text style={[styles.setLabel, { color: colors.subtleText }]}>Set</Text>{weighted && <Text style={[styles.setLabel, { color: colors.subtleText }]}>{required ? 'Weight' : 'Added weight'}</Text>}<Text style={[styles.setLabel, { color: colors.subtleText }]}>Reps</Text></View>{exercise.sets.map((set) => <View key={set.number} style={styles.setRow}><Text style={[styles.setValue, { color: colors.mutedText }]}>{set.number}</Text>{weighted && <Text style={[styles.setValue, { color: colors.text }]}>{required ? `${set.weight} lb` : set.weight ? `+${set.weight} lb` : '—'}</Text>}<Text style={[styles.setValue, { color: colors.text }]}>{set.reps}</Text></View>)}</Pressable>; })}</View>
    </ScrollView>
  </SafeAreaView>;
}

function Stat({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useAppearance>['colors'] }) { return <View style={styles.stat}><Text style={[styles.statValue, { color: colors.text }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedText }]}>{label}</Text></View>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, header: { height: 60, paddingHorizontal: 24, justifyContent: 'center' }, backButton: { width: 38, height: 38, marginLeft: -9, alignItems: 'center', justifyContent: 'center' }, content: { padding: 24, paddingTop: 8, paddingBottom: 40 }, title: { fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -1.6 }, date: { marginTop: 5, fontSize: 14, fontWeight: '700' }, totals: { marginTop: 26, borderRadius: 18, paddingVertical: 16, flexDirection: 'row' }, stat: { flex: 1, paddingHorizontal: 16 }, statValue: { fontSize: 17, fontWeight: '900', letterSpacing: -.6 }, statLabel: { marginTop: 4, fontSize: 10, fontWeight: '800' }, sectionTitle: { marginTop: 30, marginBottom: 10, fontSize: 11, fontWeight: '900', letterSpacing: .5 }, exerciseList: { gap: 22 }, exercise: { paddingBottom: 15 }, exerciseName: { fontSize: 17, fontWeight: '900', letterSpacing: -.45 }, setHeader: { marginTop: 15, paddingBottom: 8, borderBottomWidth: 1, flexDirection: 'row' }, setLabel: { flex: 1, fontSize: 10, fontWeight: '900', letterSpacing: .4 }, setRow: { minHeight: 35, flexDirection: 'row', alignItems: 'center' }, setValue: { flex: 1, fontSize: 14, fontWeight: '800' }, pressed: { opacity: .65 }, missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }, missingText: { fontSize: 22, fontWeight: '900' }, backText: { fontSize: 15, fontWeight: '800' },
});
