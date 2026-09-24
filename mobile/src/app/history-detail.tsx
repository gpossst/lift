import { ui } from '@/styles/primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, ChevronRight } from 'react-native-feather';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getExercises, getWorkoutVisitExerciseDetails, getWorkoutVisitSummary } from '@/db';
import { exerciseRequiresWeight } from '@/db/exercise-catalog';
import { useAppearance } from '@/components/appearance-provider';
import { workoutSplitLabel } from '@/lib/workout-split-label';

const formatDate = (date: Date) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
const formatVolume = (volume: number) => volume >= 10_000 ? `${Math.round(volume / 1000)}k` : volume >= 1_000 ? `${(volume / 1000).toFixed(1)}k` : String(volume);
const formatDuration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
};

export default function HistoryDetailScreen() {
  const { colors } = useAppearance();
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const visit = workoutId ? getWorkoutVisitSummary(workoutId) : null;
  const exercises = workoutId ? getWorkoutVisitExerciseDetails(workoutId) : [];
  const requiresWeight = new Map(getExercises().map((exercise) => [exercise.id, exerciseRequiresWeight(exercise)]));
  const back = () => router.canGoBack() ? router.back() : router.replace('/history');

  if (!visit) return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}><View style={styles.missing}><Text style={[styles.missingText, { color: colors.text }]}>Workout unavailable</Text><Pressable onPress={back}><Text style={[styles.backText, { color: colors.text }]}>Back to history</Text></Pressable></View></SafeAreaView>;

  const date = visit.workout.endedAt ?? visit.workout.createdAt;
  const duration = visit.workout.endedAt ? formatDuration(date.getTime() - visit.workout.createdAt.getTime()) : null;
  const hasRequiredWeight = exercises.some((exercise) => requiresWeight.get(exercise.id) ?? true);
  const split = workoutSplitLabel(visit.workout.split);

  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={back} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back to workout history"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={[styles.completeMark, { backgroundColor: colors.accent }]}><Text style={[styles.completeMarkText, { color: colors.accentText }]}>✓</Text></View>
        <Text style={[styles.kicker, { color: colors.mutedText }]}>WORKOUT COMPLETE</Text>
        <Text style={[styles.title, { color: colors.text }]}>{split} workout</Text>
        <Text style={[styles.date, { color: colors.mutedText }]}>{formatDate(date)}{duration ? ` · ${duration}` : ''}</Text>
      </View>
      <View style={styles.totals}>
        <Stat label={visit.volume ? hasRequiredWeight ? 'Volume' : 'Added volume' : 'Reps'} value={visit.volume ? `${formatVolume(visit.volume)} lb` : String(visit.reps)} colors={colors} />
        <Stat label="Sets" value={String(visit.sets)} colors={colors} />
        <Stat label="Exercises" value={String(visit.exercises)} colors={colors} />
      </View>
      <View style={styles.training}>
        <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>Exercises</Text>
        {exercises.map((exercise, index) => {
          const required = requiresWeight.get(exercise.id) ?? true;
          const weighted = required || exercise.sets.some((set) => set.weight > 0);
          return <View key={exercise.id} style={[styles.exercise, { borderColor: colors.surfaceStrong, borderBottomWidth: index === exercises.length - 1 ? 0 : 1 }]}>
            <Pressable onPress={() => router.navigate({ pathname: '/history', params: { exerciseId: exercise.id } })} style={({ pressed }) => [styles.exerciseHeading, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`View progress for ${exercise.name}`}>
              <Text style={[ui.listIndex, { color: colors.subtleText }]}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.exerciseCopy}><Text style={[ui.listName, { color: colors.text }]} numberOfLines={2}>{exercise.name}</Text><Text style={[ui.listMeta, { color: colors.mutedText }]}>{exercise.sets.length} {exercise.sets.length === 1 ? 'set' : 'sets'}</Text></View>
              <ChevronRight width={18} height={18} color={colors.subtleText} strokeWidth={2.2} />
            </Pressable>
            <View style={styles.sets}>{exercise.sets.map((set) => <View key={set.number} style={styles.setRow}>
              <Text style={[styles.setLabel, { color: colors.mutedText }]}>Set {set.number}</Text>
              <Text style={[styles.setValue, { color: colors.text }]}>{weighted ? required ? `${set.weight} lb × ` : set.weight ? `+${set.weight} lb × ` : '' : ''}{set.reps} reps</Text>
            </View>)}</View>
          </View>;
        })}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function Stat({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useAppearance>['colors'] }) {
  return <View style={[ui.stat, { backgroundColor: colors.surface }]}><Text style={[ui.statValue, { color: colors.text }]}>{value}</Text><Text style={[ui.statLabel, { color: colors.mutedText }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  header: { height: 52, paddingHorizontal: 24, justifyContent: 'center' },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 6, paddingBottom: 26 },
  completeMark: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  completeMarkText: { fontSize: 29, fontWeight: '900' },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { marginTop: 5, fontSize: 38, lineHeight: 42, fontWeight: '900', letterSpacing: -1.8, textAlign: 'center' },
  date: { marginTop: 8, fontSize: 14, fontWeight: '700', letterSpacing: -.15, textAlign: 'center' },
  totals: { flexDirection: 'row', gap: 8 },
  statLabel: { marginTop: 3, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  training: { marginTop: 28 },
  sectionTitle: { marginBottom: 8, fontSize: 10, fontWeight: '900', letterSpacing: .8, textTransform: 'uppercase' },
  exercise: { paddingBottom: 16, marginBottom: 10 },
  exerciseHeading: { minHeight: 56, flexDirection: 'row', alignItems: 'center' },
  exerciseCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
  sets: { marginLeft: 31 },
  setRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setLabel: { fontSize: 12, fontWeight: '700' },
  setValue: { fontSize: 13, fontWeight: '800', letterSpacing: -.2 },
  pressed: { opacity: .65 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  missingText: { fontSize: 22, fontWeight: '900' },
  backText: { fontSize: 15, fontWeight: '800' },
});
