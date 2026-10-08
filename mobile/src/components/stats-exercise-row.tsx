import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'react-native-feather';
import { router } from 'expo-router';

import { useAppearance } from '@/components/appearance-provider';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { getCompletedWorkoutExerciseDetails, getExercises, getWorkoutVisits } from '@/db';
import { exerciseHistories, progressFor } from '@/lib/lift-progress';

export type StatsExercise = { id: string; name: string; detailsJson: string | null; sessions: number; recentSessions: number; topSet?: { weight: number; reps: number }; trend: number[] };

/** The whole catalog with each exercise's session count (all time and last 4 weeks), latest best set, and recent per-session trend, most-trained first. */
export function loadStatsExercises(
  visits = getWorkoutVisits(),
  details = getCompletedWorkoutExerciseDetails(),
  catalog = getExercises(),
): StatsExercise[] {
  const histories = exerciseHistories(visits, details);
  const recentStart = Date.now() - 28 * 86_400_000;
  return catalog.map((exercise) => {
    const history = histories.get(exercise.id) ?? [];
    const progress = progressFor(history, history.some((set) => set.weight > 0));
    return { id: exercise.id, name: exercise.name, detailsJson: exercise.detailsJson, sessions: progress.length, recentSessions: progress.filter((point) => point.date.getTime() >= recentStart).length, topSet: progress.at(-1)?.bestSet, trend: progress.slice(-6).map((point) => point.value) };
  }).sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

export const formatSet = ({ weight, reps }: { weight: number; reps: number }) => weight > 0 ? `${weight} lb × ${reps}` : `${reps} reps`;

export const StatsExerciseRow = memo(function StatsExerciseRow({ item, last, onOpen }: { item: StatsExercise; last: boolean; onOpen?: () => void }) {
  const { colors } = useAppearance();
  const low = Math.min(...item.trend);
  const span = Math.max(...item.trend) - low;
  const change = item.trend.length >= 2 ? item.trend.at(-1)! - item.trend.at(-2)! : 0;
  const summary = item.topSet ? `last best ${formatSet(item.topSet)}, ${change > 0 ? 'up' : change < 0 ? 'down' : 'level'} from previous session` : 'no workouts yet';
  return <Pressable onPress={() => { onOpen?.(); router.push({ pathname: '/stats/progress', params: { exerciseId: item.id } }); }} style={({ pressed }) => [pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${item.name}, ${summary}. View progress`}>
    <View style={[styles.lookupInner, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.surfaceStrong }]}>
      <ExerciseThumb exercise={item} size={42} />
      <View style={styles.lookupCopy}>
        <Text style={[styles.lookupName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.lookupMeta, { color: colors.mutedText }]} numberOfLines={1}>{item.topSet ? `${formatSet(item.topSet)} · ${item.sessions} ${item.sessions === 1 ? 'session' : 'sessions'}` : 'No workouts yet'}</Text>
      </View>
      {/* Bars scale between the lowest and highest recent session so small gains stay visible; the latest is accented. */}
      {item.trend.length >= 2 && <View style={styles.bars} accessibilityElementsHidden>{item.trend.map((value, index) => <View key={index} style={[styles.bar, { height: `${span ? 25 + (value - low) / span * 75 : 60}%`, backgroundColor: index === item.trend.length - 1 ? change < 0 ? '#FF5151' : colors.accent : colors.subtleText }]} />)}</View>}
      <ChevronRight width={17} height={17} color={colors.subtleText} strokeWidth={2.4} />
    </View>
  </Pressable>;
});

const styles = StyleSheet.create({
  lookupInner: { minHeight: 62, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  lookupCopy: { flex: 1 }, lookupName: { fontSize: 15, fontWeight: '800', letterSpacing: -.3 }, lookupMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  bars: { height: 24, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  bar: { width: 5, borderRadius: 2.5 },
  pressed: { opacity: .62 },
});
