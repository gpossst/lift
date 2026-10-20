import { ui } from '@/styles/primitives';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { ArrowLeft, Edit2, TrendingUp } from 'react-native-feather';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteWorkout, getExercises, getWorkoutAchievements, getWorkoutHistories, getWorkoutMuscleRatings, getWorkoutVisitExerciseDetails, getWorkoutVisitSummary } from '@/db';
import { exerciseRequiresWeight } from '@/db/exercise-catalog';
import { useAppearance } from '@/components/appearance-provider';
import { workoutSplitLabel } from '@/lib/workout-split-label';
import { syncWorkoutData } from '@/lib/cloud-sync';
import { useWorkoutData } from '@/hooks/use-workout-data';
import { exerciseProgress } from '@/lib/summary-progress';
import { SetBar, setBarSize } from '@/components/set-bar';

const formatDate = (date: Date) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(date);
const formatVolume = (volume: number) => volume >= 10_000 ? `${Math.round(volume / 1000)}k` : volume >= 1_000 ? `${(volume / 1000).toFixed(1)}k` : String(volume);
const formatDuration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
};
const requiresWeight = new Map(getExercises().map((exercise) => [exercise.id, exerciseRequiresWeight(exercise)]));

export default function HistoryDetailScreen() {
  const { colors } = useAppearance();
  const pathname = usePathname();
  const historyPath = pathname.startsWith('/stats/') ? '/stats/history' : '/history';
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const load = useCallback(() => ({
    visit: workoutId ? getWorkoutVisitSummary(workoutId) : null,
    exercises: workoutId ? getWorkoutVisitExerciseDetails(workoutId) : [],
    achievements: workoutId ? getWorkoutAchievements(workoutId) : [],
    ratings: workoutId ? getWorkoutMuscleRatings(workoutId) : [],
  }), [workoutId]);
  const { visit, exercises, achievements, ratings } = useWorkoutData(load);
  const histories = useMemo(() => getWorkoutHistories(exercises.map((exercise) => exercise.id)), [exercises]);
  const records = new Map(achievements.filter((item) => item.level === 'gold').map((item) => [item.exerciseId, item]));
  const back = () => router.dismissTo(historyPath);
  const remove = () => {
    if (!workoutId) return;
    try {
      if (!deleteWorkout(workoutId)) { setDeleteError(true); return; }
      setDeleteOpen(false);
      void syncWorkoutData().catch(() => undefined);
      back();
    } catch {
      setDeleteError(true);
    }
  };

  if (!visit) return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}><View style={styles.missing}><Text style={[styles.missingText, { color: colors.text }]}>Workout unavailable</Text><Pressable onPress={back}><Text style={[styles.backText, { color: colors.text }]}>Back to history</Text></Pressable></View></SafeAreaView>;

  const date = visit.workout.endedAt ?? visit.workout.createdAt;
  const duration = visit.workout.endedAt ? formatDuration(date.getTime() - visit.workout.createdAt.getTime()) : null;
  const hasRequiredWeight = exercises.some((exercise) => requiresWeight.get(exercise.id) ?? true);
  const split = workoutSplitLabel(visit.workout.split);

  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={back} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back to workout history"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { backgroundColor: colors.inverse }]}>
        <View style={styles.heroTop}>
          <Text style={[styles.heroDate, { color: colors.inverseText }]}>{formatDate(date)}</Text>
          {records.size > 0 && <View style={[styles.recordPill, { backgroundColor: colors.accent }]}><Text style={[styles.recordPillText, { color: colors.accentText }]}>✦ {records.size} {records.size === 1 ? 'PR' : 'PRs'}</Text></View>}
        </View>
        <Text style={[styles.title, { color: colors.inverseText }]}>{split} workout</Text>
        {duration && <Text style={[styles.heroDuration, { color: colors.inverseText }]}>{duration} in the gym</Text>}
        <View style={[styles.heroRule, { backgroundColor: colors.inverseText }]} />
        <View style={styles.totals}>
          <Stat label={visit.volume ? hasRequiredWeight ? 'lb volume' : 'lb added' : 'reps'} value={visit.volume ? formatVolume(visit.volume) : String(visit.reps)} color={colors.inverseText} />
          <Stat label="sets" value={String(visit.sets)} color={colors.inverseText} />
          <Stat label="exercises" value={String(visit.exercises)} color={colors.inverseText} />
        </View>
      </View>
      {exercises.map((exercise, index) => {
        const required = requiresWeight.get(exercise.id) ?? true;
        const record = records.get(exercise.id);
        const progress = exerciseProgress(exercise.sets, histories.get(exercise.id) ?? [], workoutId ?? '', date, required);
        const max = Math.max(...exercise.sets.map((set) => setBarSize(set, required)));
        const top = exercise.sets.findIndex((set) => setBarSize(set, required) === max);
        return <View key={exercise.id} style={[styles.exercise, { borderColor: colors.surfaceStrong }, index === 0 && styles.firstExercise]}>
          <View style={styles.exerciseHeading}>
            <View style={styles.exerciseCopy}>
              <Text style={[styles.exerciseName, { color: colors.text }]} numberOfLines={2}>{exercise.name}</Text>
              <Text style={[styles.exerciseMeta, { color: progress.improved ? colors.text : colors.mutedText }]}>{progress.label}</Text>
            </View>
            <Pressable onPress={() => router.push({ pathname: pathname.startsWith('/stats/') ? '/stats/history-progress' : '/history-progress', params: { exerciseId: exercise.id } })} hitSlop={4} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`View progress for ${exercise.name}`}><TrendingUp width={16} height={16} color={colors.text} strokeWidth={2.4} /></Pressable>
            <Pressable onPress={() => router.push({ pathname: pathname.startsWith('/stats/') ? '/stats/history-edit' : '/history-edit', params: { workoutId, exerciseId: exercise.id } })} hitSlop={4} style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Edit ${exercise.name} sets`}><Edit2 width={15} height={15} color={colors.text} strokeWidth={2.4} /></Pressable>
          </View>
          {record && <View style={[styles.recordBanner, { backgroundColor: colors.accent }]} accessible accessibilityLabel={`Personal record, ${record.metric === 'reps' ? `${record.reps} reps at ${record.weight} pounds` : `${record.weight} pounds`}`}><Text style={[styles.recordBannerText, { color: colors.accentText }]}>✦ New best · {record.metric === 'reps' ? `${record.reps} reps at ${record.weight} lb` : `${record.weight} lb`}</Text></View>}
          <View style={styles.sets}>
            {exercise.sets.map((set, setIndex) => <SetBar key={set.number} number={set.number} set={set} requiresWeight={required} max={max} highlight={setIndex === top} />)}
          </View>
        </View>;
      })}
      {ratings.length > 0 && <View style={styles.checkIn}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>How it felt</Text>
        {ratings.map((rating) => <View key={rating.id} style={styles.ratingRow} accessible accessibilityLabel={`${rating.name}, ${rating.exhaustion} of 10`}>
          <Text style={[styles.ratingName, { color: colors.text }]} numberOfLines={1}>{rating.name}</Text>
          <View style={styles.meter}>{Array.from({ length: 10 }, (_, step) => <View key={step} style={[styles.meterStep, { backgroundColor: step < rating.exhaustion ? colors.accent : colors.surfaceStrong }]} />)}</View>
          <Text style={[styles.ratingValue, { color: colors.mutedText }]}>{rating.exhaustion}</Text>
        </View>)}
      </View>}
      <Pressable onPress={() => { setDeleteError(false); setDeleteOpen(true); }} style={({ pressed }) => [styles.deleteTrigger, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Delete this workout"><Text style={styles.deleteText}>Delete workout</Text></Pressable>
    </ScrollView>
    <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}><View style={styles.modalOverlay}><View style={[styles.modalCard, { backgroundColor: colors.background }]}>
      <Text style={[styles.modalTitle, { color: colors.text }]}>Delete this workout?</Text>
      <Text style={[styles.modalCopy, { color: colors.mutedText }]}>All its sets and muscle ratings will be removed from your history and progress. This cannot be undone.</Text>
      {deleteError && <Text accessibilityRole="alert" style={styles.deleteText}>Could not delete this workout. Try again.</Text>}
      <Pressable onPress={remove} style={({ pressed }) => [styles.confirmDelete, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Confirm delete workout"><Text style={styles.confirmDeleteText}>Delete workout</Text></Pressable>
      <Pressable onPress={() => setDeleteOpen(false)} style={styles.cancelDelete} accessibilityRole="button" accessibilityLabel="Cancel deletion"><Text style={[styles.cancelDeleteText, { color: colors.text }]}>Cancel</Text></Pressable>
    </View></View></Modal>
  </SafeAreaView>;
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={styles.stat}><Text style={[styles.statValue, { color }]}>{value}</Text><Text style={[styles.statLabel, { color }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  header: { height: 52, paddingHorizontal: 24, justifyContent: 'center' },
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
  hero: { borderRadius: 28, padding: 24 },
  heroTop: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroDate: { flex: 1, fontSize: 13, fontWeight: '700', opacity: .7 },
  title: { marginTop: 14, fontSize: 36, lineHeight: 40, fontWeight: '900', letterSpacing: -1.7 },
  heroDuration: { marginTop: 6, fontSize: 13, fontWeight: '600', opacity: .7 },
  heroRule: { height: 1, opacity: .18, marginTop: 24, marginBottom: 16 },
  totals: { flexDirection: 'row' },
  stat: { flex: 1 },
  statValue: { fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -.7 },
  statLabel: { marginTop: 2, fontSize: 12, fontWeight: '600', opacity: .65 },
  recordPill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  recordPillText: { fontSize: 11, fontWeight: '900' },
  exercise: { paddingVertical: 22, borderTopWidth: 1 },
  firstExercise: { marginTop: 14, borderTopWidth: 0 },
  exerciseHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  exerciseCopy: { flex: 1, minWidth: 0, paddingRight: 4 },
  exerciseName: { fontSize: 20, lineHeight: 24, fontWeight: '900', letterSpacing: -.7 },
  exerciseMeta: { marginTop: 4, fontSize: 12, fontWeight: '700' },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  recordBanner: { alignSelf: 'flex-start', marginTop: 12, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  recordBannerText: { fontSize: 12, fontWeight: '900' },
  sets: { marginTop: 14, gap: 6 },
  checkIn: { marginTop: 8, paddingTop: 22 },
  sectionTitle: { marginBottom: 10, fontSize: 20, fontWeight: '900', letterSpacing: -.7 },
  ratingRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratingName: { width: 104, fontSize: 14, fontWeight: '800' },
  meter: { flex: 1, flexDirection: 'row', gap: 3 },
  meterStep: { flex: 1, height: 8, borderRadius: 2 },
  ratingValue: { width: 18, fontSize: 12, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  pressed: { opacity: .65 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  missingText: { fontSize: 22, fontWeight: '900' },
  backText: { fontSize: 15, fontWeight: '800' },
  deleteTrigger: { marginTop: 24, minHeight: 52, borderTopWidth: 1, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#D43A2F', fontSize: 14, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 24, fontWeight: '900' },
  modalCopy: { marginTop: 10, marginBottom: 20, fontSize: 14, lineHeight: 21 },
  confirmDelete: { minHeight: 52, borderRadius: 12, backgroundColor: '#D43A2F', alignItems: 'center', justifyContent: 'center' },
  confirmDeleteText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  cancelDelete: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelDeleteText: { fontSize: 14, fontWeight: '800' },
});
