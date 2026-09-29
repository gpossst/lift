import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { getExercises, getWorkoutHistory } from '@/db';
import { exerciseRequiresWeight } from '@/db/exercise-catalog';
import { useAppearance } from '@/components/appearance-provider';
import { progressFor, type LiftProgress } from '@/lib/lift-progress';

export function StatsPanel({ initialExerciseId }: { initialExerciseId?: string }) {
  const { colors } = useAppearance();
  const [metric, setMetric] = useState<'estimated1RM' | 'maxWeight'>('estimated1RM');
  const lifts = useMemo(() => getExercises().map((exercise) => {
    const history = getWorkoutHistory(exercise.id);
    return { ...exercise, history, progress: progressFor(history, exerciseRequiresWeight(exercise)) };
  }).filter((exercise) => exercise.progress.length > 0), []);
  const selected = lifts.find((lift) => lift.id === initialExerciseId) ?? lifts[0];
  const requiresWeight = selected ? exerciseRequiresWeight(selected) : false;
  const points = selected && metric === 'maxWeight' ? progressFor(selected.history, requiresWeight, metric) : selected?.progress;
  return <>
    {selected && points ? <View style={styles.body}><View style={styles.content}><Text style={[styles.exerciseName, { color: colors.text }]}>{selected.name}</Text>
      {requiresWeight && <View style={[styles.metricToggle, { backgroundColor: colors.surface }]}>
        {(['estimated1RM', 'maxWeight'] as const).map((option) => <Pressable key={option} onPress={() => setMetric(option)} style={[styles.metricOption, metric === option && { backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityState={{ selected: metric === option }} accessibilityLabel={option === 'maxWeight' ? 'Show max weight' : 'Show estimated one rep max'}><Text style={[styles.metricOptionText, { color: metric === option ? colors.accentText : colors.mutedText }]}>{option === 'maxWeight' ? 'Max weight' : 'Estimated 1RM'}</Text></Pressable>)}
      </View>}
      <LiftSummary key={selected.id} points={points} requiresWeight={requiresWeight} maxWeight={requiresWeight && metric === 'maxWeight'} colors={colors} /></View></View> : <View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>No stats yet</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Log an exercise to start seeing your growth.</Text></View>}
  </>;
}

function LiftSummary({ points, requiresWeight, maxWeight, colors }: { points: LiftProgress[]; requiresWeight: boolean; maxWeight: boolean; colors: ReturnType<typeof useAppearance>['colors'] }) {
  const { width } = useWindowDimensions();
  const viewportWidth = width - 48;
  const pointSpacing = Math.max(28, (viewportWidth - 32) / Math.max(points.length - 1, 1));
  const chartWidth = Math.max(viewportWidth, 32 + (points.length - 1) * pointSpacing);
  const chartScroll = useRef<ScrollView>(null);
  const visiblePoints = (offset: number) => {
    const first = Math.max(0, Math.min(points.length - 1, Math.ceil((offset - 16) / pointSpacing)));
    const last = Math.max(first, Math.min(points.length - 1, Math.floor((offset + viewportWidth - 16) / pointSpacing)));
    return { first, last };
  };
  const [visible, setVisible] = useState(() => visiblePoints(chartWidth - viewportWidth));
  const [activeDayKey, setActiveDayKey] = useState(dayKey(points.at(-1)!.date));
  const activePoint = points.find((point) => dayKey(point.date) === activeDayKey) ?? points.at(-1)!;
  const metricLabel = requiresWeight ? maxWeight ? 'Max weight' : 'Estimated 1RM' : 'Best reps';
  const chartLabel = requiresWeight ? maxWeight ? 'Max weight progress chart' : 'Estimated one rep max progress chart' : 'Best set reps progress chart';
  const displayValue = (value: number) => maxWeight ? value : Math.round(value);
  const minValue = Math.min(...points.map((point) => point.value)); const maxValue = Math.max(...points.map((point) => point.value)); const valueRange = maxValue - minValue;
  const coordinates = points.map((point, index) => ({ x: 16 + index * pointSpacing, y: valueRange ? 94 - ((point.value - minValue) / valueRange) * 76 : 56 }));
  const linePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(' ');
  const strongest = points.reduce((best, point) => point.value > best.value ? point : best, points[0]);
  const setValue = (set: LiftProgress['bestSet']) => `${requiresWeight ? `${set.weight} lb × ` : set.weight ? `+${set.weight} lb × ` : ''}${set.reps}`;
  const badge = activePoint.workoutId === strongest.workoutId ? 'BEST' : activePoint.workoutId === points.at(-1)!.workoutId ? 'LATEST' : 'PAST';
  const allSets = [...points].reverse().flatMap((point) => point.sets);
  const setsByDate = new Map<string, typeof allSets>();
  for (const set of allSets) {
    const key = dayKey(set.completedAt);
    const sets = setsByDate.get(key) ?? [];
    sets.push(set);
    setsByDate.set(key, sets);
  }
  const datedSets = [...setsByDate.values()].sort((a, b) => b[0].completedAt.getTime() - a[0].completedAt.getTime());
  const columns = width - 48 >= 304 ? 3 : 2;
  const chipWidth = (width - 48 - (columns - 1) * 6) / columns;
  return <View style={styles.summary}><View style={styles.metricHeader}><Text style={[styles.metricValue, { color: colors.text }]}>{displayValue(activePoint.value)} <Text style={styles.metricUnit}>{requiresWeight ? 'LB' : 'REPS'}</Text></Text><Text style={[styles.metricLabel, { color: colors.mutedText }]}>{metricLabel}</Text></View><ScrollView ref={chartScroll} horizontal style={styles.chart} onContentSizeChange={() => chartScroll.current?.scrollToEnd({ animated: false })} onScroll={(event) => { const next = visiblePoints(event.nativeEvent.contentOffset.x); setVisible((current) => current.first === next.first && current.last === next.last ? current : next); }} scrollEventThrottle={16} showsHorizontalScrollIndicator={chartWidth > viewportWidth}>
    <Svg width={chartWidth} height={112} viewBox={`0 0 ${chartWidth} 112`} accessibilityLabel={chartLabel}>
      {[18, 94].map((y) => <Line key={y} x1="0" x2={chartWidth} y1={y} y2={y} stroke={colors.surfaceStrong} strokeWidth="1" />)}
      <Polyline points={linePoints} fill="none" stroke={colors.text} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => <Circle key={point.workoutId} cx={coordinates[index].x} cy={coordinates[index].y} r={dayKey(point.date) === activeDayKey ? 8 : 6} fill={colors.accent} stroke={colors.background} strokeWidth="3" onPress={() => setActiveDayKey(dayKey(point.date))} accessibilityLabel={`${formatDate(point.date)}: ${displayValue(point.value)} ${requiresWeight ? maxWeight ? 'pounds max weight' : 'pounds estimated one rep max' : 'reps'}`} />)}
    </Svg>
  </ScrollView><View style={styles.chartLabels}><Text style={[styles.chartLabel, { color: colors.subtleText }]}>{formatDate(points[visible.first].date)}</Text><Text style={[styles.chartLabel, { color: colors.subtleText }]}>{formatDate(points[visible.last].date)}</Text></View><View style={styles.selectedSet}><View><Text style={[styles.selectedMeta, { color: colors.mutedText }]}>{formatDate(activePoint.date)}</Text><Text style={[styles.selectedValue, { color: colors.text }]}>{setValue(activePoint.bestSet)}</Text></View><Text style={[styles.selectedNote, { backgroundColor: colors.accent, color: colors.accentText }]}>{badge}</Text></View><ScrollView style={styles.setList} contentContainerStyle={styles.setListContent} nestedScrollEnabled showsVerticalScrollIndicator>
    {datedSets.map((sets) => <View key={dayKey(sets[0].completedAt)}>
      <Text style={[styles.sessionTitle, { color: colors.mutedText }]}>{formatDate(sets[0].completedAt)}, {sets[0].completedAt.getFullYear()}</Text>
      <View style={styles.setChips}>{sets.map((set) => { const selected = dayKey(set.completedAt) === activeDayKey; return <Pressable key={`${set.workoutId}-${set.setNumber}`} onPress={() => setActiveDayKey(dayKey(set.completedAt))} style={({ pressed }) => [styles.setChip, { width: chipWidth, backgroundColor: selected ? colors.accent : colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${formatDate(set.completedAt)}, ${set.completedAt.getFullYear()}, set ${set.setNumber}: ${setValue(set)}`}><Text style={[styles.setChipNumber, { color: selected ? colors.accentText : colors.subtleText }]}>SET {set.setNumber}</Text><Text style={[styles.setChipValue, { color: selected ? colors.accentText : colors.text }]}>{setValue(set)}</Text></Pressable>; })}</View>
    </View>)}
  </ScrollView></View>;
}

function formatDate(date: Date) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date); }
function dayKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }

const styles = StyleSheet.create({
  metricToggle: { marginTop: 16, padding: 3, borderRadius: 12, flexDirection: 'row' },
  metricOption: { flex: 1, minHeight: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  metricOptionText: { fontSize: 12, fontWeight: '800' },
   body: { flex: 1 }, content: { paddingHorizontal: 24, paddingTop: 3, paddingBottom: 18 }, exerciseName: { fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -1.3 }, summary: { marginTop: 20 }, metricHeader: { marginBottom: 5 }, metricLabel: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: -.1 }, metricValue: { fontSize: 29, lineHeight: 33, fontWeight: '900', letterSpacing: -1.45 }, metricUnit: { fontSize: 10, letterSpacing: 0 }, chart: { width: '100%', height: 112, marginTop: 7 }, chartLabels: { marginTop: -3, flexDirection: 'row', justifyContent: 'space-between' }, chartLabel: { fontSize: 9, fontWeight: '800' }, selectedSet: { marginTop: 12, paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectedMeta: { fontSize: 9, fontWeight: '900', letterSpacing: .5 }, selectedValue: { marginTop: 2, fontSize: 19, lineHeight: 22, fontWeight: '900', letterSpacing: -.5 }, selectedNote: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, fontSize: 8, lineHeight: 10, textAlign: 'center', fontWeight: '900', letterSpacing: .7 }, sessionTitle: { marginTop: 20, marginBottom: 7, fontSize: 9, fontWeight: '900', letterSpacing: .7 }, setList: { maxHeight: 320 }, setListContent: { paddingBottom: 96 }, setChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, setChip: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10 }, setChipNumber: { fontSize: 10, fontWeight: '900', letterSpacing: .6 }, setChipValue: { marginTop: 2, fontSize: 16, fontWeight: '900', letterSpacing: -.2 }, pressed: { opacity: .68 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }, emptyTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -.9 }, emptyCopy: { marginTop: 7, fontSize: 14, textAlign: 'center', fontWeight: '600' },

});
