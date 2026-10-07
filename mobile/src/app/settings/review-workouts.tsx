import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AlertCircle, ArrowLeft, Check, Trash2 } from 'react-native-feather';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppearance } from '@/components/appearance-provider';
import { getRejectedCloudSyncChanges, getWorkoutVisitExercises, getWorkoutVisitSummary, resolveDeletedWorkout, type WorkoutVisitSummary } from '@/db';
import { subscribeWorkoutData, syncWorkoutData } from '@/lib/cloud-sync';
import { workoutSplitLabel } from '@/lib/workout-split-label';
import { ui } from '@/styles/primitives';

const reviewIds = () => getRejectedCloudSyncChanges().filter((item) => item.entity === 'workout' && item.conflict && item.remoteOperation === 'delete').map((item) => item.key);

export default function ReviewWorkoutsScreen() {
  const { colors } = useAppearance();
  const [ids, setIds] = useState(reviewIds);
  const [reviewed, setReviewed] = useState(0);
  const [message, setMessage] = useState('');
  useFocusEffect(useCallback(() => {
    const refresh = () => setIds(reviewIds());
    refresh();
    return subscribeWorkoutData(refresh);
  }, []));
  const workoutId = ids[0];
  const summary = workoutId ? getWorkoutVisitSummary(workoutId) : null;
  const choose = (choice: 'delete' | 'keep') => {
    try {
      if (!resolveDeletedWorkout(workoutId, choice)) {
        setMessage('This workout changed. Try again after sync.');
        setIds(reviewIds());
        return false;
      }
      setReviewed((count) => count + 1);
      setIds(reviewIds());
      setMessage('');
      void syncWorkoutData().catch(() => undefined);
      return true;
    } catch {
      setMessage('Couldn’t save. Try again.');
      return false;
    }
  };

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={ui.header}>
      <Pressable onPress={() => router.dismissTo('/settings')} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back to Settings"><ArrowLeft color={colors.text} width={24} height={24} /></Pressable>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Review workouts</Text>
      <Text style={[styles.progress, { color: colors.mutedText }]}>{ids.length ? `${reviewed + 1} of ${reviewed + ids.length}` : ''}</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      {summary ? <>
        <Text style={[ui.title, { color: colors.text }]}>Keep this workout?</Text>
        <Text style={[styles.explanation, { color: colors.mutedText }]}>Deleted on another device.</Text>
        {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
        <WorkoutCard key={workoutId} summary={summary} onChoose={choose} />
        <Text style={[styles.hint, { color: colors.mutedText }]}>Swipe left to delete, right to keep.</Text>
      </> : <View style={styles.done}>
        <View style={[styles.doneIcon, { backgroundColor: ids.length ? colors.surfaceStrong : colors.accent }]}>{ids.length ? <AlertCircle width={36} height={36} color="#C94238" /> : <Check width={36} height={36} color={colors.accentText} />}</View>
        <Text style={[ui.title, { color: colors.text }]}>{ids.length ? 'Couldn’t load workout' : 'All caught up'}</Text>
        {!!ids.length && <Text style={[styles.explanation, { color: colors.mutedText }]}>Sync again from Settings.</Text>}
        {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
        <Pressable onPress={() => router.dismissTo('/settings')} style={[ui.primaryButton, styles.doneButton, { backgroundColor: colors.accent }]} accessibilityRole="button"><Text style={[ui.primaryButtonText, { color: colors.accentText }]}>Back to Settings</Text></Pressable>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

function WorkoutCard({ summary, onChoose }: { summary: WorkoutVisitSummary; onChoose: (choice: 'delete' | 'keep') => boolean }) {
  const { colors } = useAppearance();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [x] = useState(() => new Animated.Value(0));
  const choosing = useRef(false);
  const [busy, setBusy] = useState(false);
  const exercises = getWorkoutVisitExercises(summary.workout.id);
  useEffect(() => () => { x.stopAnimation(); }, [x]);
  const commit = useCallback((choice: 'delete' | 'keep') => {
    if (choosing.current) return;
    choosing.current = true;
    setBusy(true);
    Animated.timing(x, { toValue: (choice === 'keep' ? 1 : -1) * width, duration: reduceMotion ? 0 : 180, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      if (!onChoose(choice)) {
        x.setValue(0);
        choosing.current = false;
        setBusy(false);
      }
    });
  }, [onChoose, reduceMotion, width, x]);
  const reset = useCallback(() => { Animated.spring(x, { toValue: 0, useNativeDriver: true, overshootClamping: true }).start(); }, [x]);
  // PanResponder stores callbacks; the choice guard is read only during events.
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => !busy && Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3,
    onPanResponderGrant: () => x.stopAnimation(),
    onPanResponderMove: (_, gesture) => { if (!busy) x.setValue(gesture.dx); },
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) > Math.min(width * .25, 110)) commit(gesture.dx > 0 ? 'keep' : 'delete');
      else reset();
    },
    onPanResponderTerminate: reset,
  }), [busy, commit, reset, width, x]);

  return <View style={styles.deck}>
    <View pointerEvents="none" style={[styles.backCard, { backgroundColor: colors.surfaceStrong }]} />
    <Animated.View {...pan.panHandlers} style={[styles.card, { backgroundColor: colors.surface, transform: [{ translateX: x }, { rotate: x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-12deg', '0deg', '12deg'] }) }] }]}>
      <View style={styles.stamps} pointerEvents="none">
        <Animated.Text style={[styles.stamp, { color: '#C94238', borderColor: '#C94238', opacity: x.interpolate({ inputRange: [-100, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>Delete</Animated.Text>
        <Animated.Text style={[styles.stamp, { color: colors.text, borderColor: colors.accent, opacity: x.interpolate({ inputRange: [0, 100], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>Keep</Animated.Text>
      </View>
      <Text style={[styles.split, { color: colors.mutedText }]}>{workoutSplitLabel(summary.workout.split)} workout</Text>
      <Text style={[styles.date, { color: colors.text }]}>{summary.workout.createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
      <Text style={[styles.time, { color: colors.mutedText }]}>{summary.workout.createdAt.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric' })} at {summary.workout.createdAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
      <View style={[styles.totals, { borderColor: colors.surfaceStrong }]}>
        <Text style={[styles.total, { color: colors.text }]}>{summary.exercises} <Text style={styles.totalLabel}>{summary.exercises === 1 ? 'exercise' : 'exercises'}</Text></Text>
        <Text style={[styles.total, { color: colors.text }]}>{summary.sets} <Text style={styles.totalLabel}>{summary.sets === 1 ? 'set' : 'sets'}</Text></Text>
      </View>
      {exercises.slice(0, 5).map((exercise) => <View key={exercise.id} style={styles.exercise}>
        <Text numberOfLines={2} style={[styles.exerciseName, { color: colors.text }]}>{exercise.name}</Text>
        <Text style={[styles.exerciseSets, { color: colors.mutedText }]}>{exercise.sets} {exercise.sets === 1 ? 'set' : 'sets'}</Text>
      </View>)}
      {exercises.length > 5 && <Text style={[styles.more, { color: colors.mutedText }]}>And {exercises.length - 5} more exercises</Text>}
      {!exercises.length && <Text style={[styles.more, { color: colors.mutedText }]}>No sets logged</Text>}
    </Animated.View>
    <View style={styles.actions}>
      <Pressable onPress={() => commit('delete')} disabled={busy} style={({ pressed }) => [styles.action, { backgroundColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel="Delete this workout" accessibilityState={{ disabled: busy }}><Trash2 width={22} height={22} color="#C94238" /><Text style={[styles.actionText, { color: colors.text }]}>Delete</Text></Pressable>
      <Pressable onPress={() => commit('keep')} disabled={busy} style={({ pressed }) => [styles.action, { backgroundColor: colors.accent }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel="Keep this workout" accessibilityState={{ disabled: busy }}><Check width={24} height={24} color={colors.accentText} /><Text style={[styles.actionText, { color: colors.accentText }]}>Keep</Text></Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  headerTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -.4 },
  progress: { minWidth: 48, textAlign: 'right', fontSize: 12, fontWeight: '700' },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 28 },
  explanation: { marginTop: 10, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  deck: { marginTop: 28 },
  backCard: { position: 'absolute', left: 10, right: 10, top: 12, height: 280, borderRadius: 26 },
  card: { minHeight: 310, borderRadius: 26, padding: 24 },
  stamps: { position: 'absolute', top: 18, left: 18, right: 18, flexDirection: 'row', justifyContent: 'space-between', zIndex: 1 },
  stamp: { fontSize: 24, fontWeight: '900', borderWidth: 3, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  split: { fontSize: 15, fontWeight: '800' },
  date: { marginTop: 8, fontSize: 48, fontWeight: '900', letterSpacing: -2 },
  time: { marginTop: 4, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  totals: { flexDirection: 'row', gap: 24, paddingVertical: 20, marginVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  total: { fontSize: 26, fontWeight: '900', letterSpacing: -.7 },
  totalLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  exercise: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 6 },
  exerciseName: { flex: 1, fontSize: 14, fontWeight: '700' },
  exerciseSets: { fontSize: 12, fontWeight: '600', paddingTop: 2 },
  more: { fontSize: 12, fontWeight: '600', paddingTop: 8 },
  actions: { flexDirection: 'row', gap: 14, marginTop: 24 },
  action: { flex: 1, minHeight: 60, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  actionText: { fontSize: 17, fontWeight: '900' },
  hint: { marginTop: 22, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  message: { marginTop: 12, color: '#C94238', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  done: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  doneIcon: { width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  doneButton: { alignSelf: 'stretch', marginTop: 28 },
});
