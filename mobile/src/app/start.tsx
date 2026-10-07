import { ui } from '@/styles/primitives';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SplitBodyGraphic } from '@/components/split-body-graphic';
import { createWorkout, getActiveWorkout, getCustomSplits, getExerciseRecommendations, getRecommendedWorkoutSplit, getWorkoutSplitDefinition, getWorkoutVisits, type WorkoutSplit } from '@/db';
import { useAppearance } from '@/components/appearance-provider';
import { SegmentedPicker } from '@/components/segmented-picker';
import { useRecommendationContext } from '@/hooks/use-recommendation-context';

const splits = [
  { value: 'push', label: 'Push', accessibilityLabel: 'Select Push workout' },
  { value: 'pull', label: 'Pull', accessibilityLabel: 'Select Pull workout' },
  { value: 'legs', label: 'Legs', accessibilityLabel: 'Select Legs workout' },
] as const;
const previewLength = 4;

function daysAgo(date: Date) {
  const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

function isInPlan(split: WorkoutSplit, useCustomSplits: boolean, customSplits: { id: string }[]) {
  return useCustomSplits && customSplits.length ? customSplits.some(({ id }) => id === split) : splits.some(({ value }) => value === split);
}

export default function StartWorkoutScreen() {
  const { colors, useCustomSplits } = useAppearance();
  const [customSplits, setCustomSplits] = useState(getCustomSplits);
  const customMode = useCustomSplits && customSplits.length > 0;
  const [recommendedSplit, setRecommendedSplit] = useState(() => getRecommendedWorkoutSplit(new Date(), customMode));
  const [selectedSplit, setSelectedSplit] = useState<WorkoutSplit>(recommendedSplit);
  const [previousSplit, setPreviousSplit] = useState<WorkoutSplit>(recommendedSplit);
  const [activeWorkout, setActiveWorkout] = useState(getActiveWorkout);
  const [visits, setVisits] = useState(getWorkoutVisits);
  const { context: recommendationContext } = useRecommendationContext();
  // Splits, history, and the plan preference can change in Settings or via sync while this screen stays mounted.
  const refresh = useCallback(() => {
    const custom = getCustomSplits();
    const recommended = getRecommendedWorkoutSplit(new Date(), useCustomSplits && custom.length > 0);
    setCustomSplits(custom);
    setVisits(getWorkoutVisits());
    setRecommendedSplit(recommended);
    setSelectedSplit((current) => isInPlan(current, useCustomSplits, custom) ? current : recommended);
  }, [useCustomSplits]);
  useEffect(refresh, [refresh]);
  useFocusEffect(useCallback(() => {
    // Every start path lands here (plus button, Home cards); resume instead of opening a second workout.
    const active = getActiveWorkout();
    setActiveWorkout(active);
    if (active) router.replace({ pathname: '/exercises', params: { split: active.split, workoutId: active.id } });
    else refresh();
  }, [refresh]));
  // The same planner the exercises screen uses, run against a workout that doesn't exist yet.
  const plan = useMemo(() => activeWorkout ? [] : getExerciseRecommendations('start-preview', selectedSplit, Infinity, recommendationContext), [activeWorkout, recommendationContext, selectedSplit]);
  const startWorkout = () => {
    // A split deleted on another device can still be selected here until the next refresh.
    if (!isInPlan(selectedSplit, useCustomSplits, getCustomSplits())) return refresh();
    const workout = createWorkout(selectedSplit);
    router.replace({ pathname: '/exercises', params: { split: selectedSplit, workoutId: workout.id } });
  };
  const chooseSplit = (split: WorkoutSplit) => {
    if (split === selectedSplit) return;
    setPreviousSplit(selectedSplit);
    setSelectedSplit(split);
  };
  const pickerOptions = customMode ? customSplits.map(({ id, name }) => ({ value: id, label: name, accessibilityLabel: `Select ${name} workout` })) : splits;
  const selectedDefinition = getWorkoutSplitDefinition(selectedSplit);
  const previousDefinition = getWorkoutSplitDefinition(previousSplit);
  const selectedName = selectedDefinition?.name ?? selectedSplit;
  if (activeWorkout) return null; // Avoid flashing the picker before the redirect above.

  const lastVisit = visits.find((visit) => visit.workout.split === selectedSplit);
  const minutes = plan.reduce((total, item) => total + item.estimatedMinutes, 0);
  const summary = [
    lastVisit ? `Last ${selectedName} ${daysAgo(lastVisit.workout.endedAt ?? lastVisit.workout.createdAt)}` : `First ${selectedName} workout`,
    plan.length ? `${plan.length} exercises` : '',
    minutes ? `~${Math.max(5, Math.round(minutes / 5) * 5)} min` : '',
  ].filter(Boolean).join(' · ');

  return <SafeAreaView edges={['top', 'right', 'left']} style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
      <Text style={[ui.title, { color: colors.text }]}>New Workout</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.bodyPreview}>
        <View style={styles.bodyMapLayer}><SplitBodyGraphic split={previousSplit} muscles={previousDefinition?.muscles} large /></View>
        <Animated.View key={selectedSplit} entering={FadeIn.duration(260)} style={styles.bodyMapLayer}><SplitBodyGraphic split={selectedSplit} muscles={selectedDefinition?.muscles} large /></Animated.View>
      </View>
      <Text style={[styles.selectedDetail, { color: colors.mutedText }]}>{selectedDefinition?.muscles.join(' · ')}</Text>
      <Animated.View key={`plan-${selectedSplit}`} entering={FadeIn.duration(260)} style={[styles.plan, { backgroundColor: colors.surface }]}>
        <Text style={[styles.planSummary, { color: colors.text }]}>{summary}</Text>
        {plan.slice(0, previewLength).map(({ exercise, sets, reps }) => <View key={exercise.id} style={styles.planRow}>
          <Text numberOfLines={1} style={[styles.planExercise, { color: colors.text }]}>{exercise.name}</Text>
          <Text style={[styles.planDose, { color: colors.mutedText }]}>{sets} × {reps.min === reps.max ? reps.min : `${reps.min}–${reps.max}`}</Text>
        </View>)}
        {plan.length > previewLength && <Text style={[styles.planMore, { color: colors.subtleText }]}>+{plan.length - previewLength} more</Text>}
      </Animated.View>
    </ScrollView>
    <View style={[styles.actionFooter, { backgroundColor: colors.background }]}>
      <SegmentedPicker options={pickerOptions} selected={selectedSplit} onSelect={chooseSplit} marked={recommendedSplit} />
      <Pressable onPress={startWorkout} style={({ pressed }) => [styles.startButton, { backgroundColor: colors.accent }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`Start ${selectedName} workout${selectedSplit === recommendedSplit ? ', recommended today' : ''}`}>
        <Text style={[styles.startText, { color: colors.accentText }]}>Start workout</Text>
      </Pressable>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header: { height: 72, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20 },
  bodyPreview: { height: 220, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bodyMapLayer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  selectedDetail: { fontSize: 13, fontWeight: '700', lineHeight: 18, textAlign: 'center', textTransform: 'capitalize', marginTop: 8, marginBottom: 20 },
  plan: { borderRadius: 17, paddingHorizontal: 16, paddingVertical: 14, gap: 9 },
  planSummary: { fontSize: 13, fontWeight: '900', letterSpacing: -.2, marginBottom: 2 },
  planRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  planExercise: { flex: 1, fontSize: 15, fontWeight: '700', letterSpacing: -.2 },
  planDose: { fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  planMore: { fontSize: 12, fontWeight: '800' },
  actionFooter: { paddingHorizontal: 24, paddingTop: 13, paddingBottom: 11, gap: 12 },
  startButton: { minHeight: 62, paddingHorizontal: 10, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  startText: { fontSize: 18, fontWeight: '900', letterSpacing: -.55 },
});
