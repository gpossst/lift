import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { getExercises, getWorkoutHistory, type WorkoutHistoryPoint } from '@/db';
import { exerciseRequiresWeight } from '@/db/exercise-catalog';
import { useAppearance } from '@/components/appearance-provider';
import { EmptyArt } from '@/components/empty-art';
import { ExerciseDetailSheet } from '@/components/exercise-detail-sheet';
import { SectionHeader } from '@/components/overview-parts';
import { SegmentedPicker } from '@/components/segmented-picker';
import { comparePeriods, progressFor, type LiftProgress, type ProgressMetric } from '@/lib/lift-progress';
import { useWorkoutData } from '@/hooks/use-workout-data';

type TimeRange = typeof timeRanges[number]['value'];
type MetricOption = { value: ProgressMetric; label: string; title: string; accessibilityLabel: string };
const timeRanges = [
  { value: '4', label: '1M', accessibilityLabel: 'Show last month' },
  { value: '13', label: '3M', accessibilityLabel: 'Show last 3 months' },
  { value: '26', label: '6M', accessibilityLabel: 'Show last 6 months' },
  { value: '52', label: '1Y', accessibilityLabel: 'Show last year' },
  { value: 'all', label: 'All', accessibilityLabel: 'Show all exercise history' },
] as const;
const weightedMetrics: MetricOption[] = [
  { value: 'estimated1RM', label: 'Est. 1RM', title: 'Estimated one-rep max', accessibilityLabel: 'Show estimated one-rep max trend' },
  { value: 'maxWeight', label: 'Heaviest set', title: 'Heaviest set', accessibilityLabel: 'Show heaviest set trend' },
  { value: 'volume', label: 'Volume', title: 'Total volume', accessibilityLabel: 'Show volume trend' },
];
const repMetrics: MetricOption[] = [
  { value: 'bestReps', label: 'Best set', title: 'Best set', accessibilityLabel: 'Show best set reps trend' },
  { value: 'totalReps', label: 'Total reps', title: 'Total reps', accessibilityLabel: 'Show total reps trend' },
];
const axisWidth = 40;
const axisValue = (value: number) => value >= 10_000 ? `${Math.round(value / 1_000)}k` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : String(Math.round(value * 10) / 10);

export function StatsPanel({ initialExerciseId, history, onDeleteSet, embedded = false, onBack }: { initialExerciseId?: string; history?: WorkoutHistoryPoint[]; onDeleteSet?: (set: WorkoutHistoryPoint) => void; embedded?: boolean; onBack?: () => void }) {
  const { colors } = useAppearance();
  const [metric, setMetric] = useState<ProgressMetric>('estimated1RM');
  const [range, setRange] = useState<TimeRange>('4');
  const weeks = range === 'all' ? null : Number(range);
  const load = useCallback(() => {
    const exercises = getExercises();
    const exercise = exercises.find((item) => item.id === initialExerciseId) ?? exercises[0];
    return exercise && { ...exercise, history: history ?? getWorkoutHistory(exercise.id) };
  }, [initialExerciseId, history]);
  const selected = useWorkoutData(load);
  const requiresWeight = selected ? exerciseRequiresWeight(selected) : false;
  const options = requiresWeight ? weightedMetrics : repMetrics;
  const activeMetric = options.some((option) => option.value === metric) ? metric : options[0].value;
  const points = selected ? progressFor(selected.history, requiresWeight, activeMetric) : [];
  const period = comparePeriods(points, weeks);
  if (!selected) return <View style={styles.empty}><EmptyArt name="chart" /><Text style={[styles.emptyTitle, { color: colors.text }]}>No stats yet</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Log an exercise to start seeing your growth.</Text></View>;
  const summary = selected.history.length ? <LiftSummary points={period.current} metric={activeMetric} metricOptions={options} onMetricChange={setMetric} range={range} weeks={weeks} change={period.change} onRangeChange={setRange} colors={colors} onDeleteSet={onDeleteSet} gutter={embedded ? 24 : 20} embedded={embedded} /> : <View style={[styles.card, { backgroundColor: colors.surface }]}><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>No workouts logged for this exercise yet.</Text></View>;
  if (embedded) return <ScrollView style={styles.body} contentContainerStyle={[styles.content, styles.embeddedContent]} showsVerticalScrollIndicator={false}>{summary}</ScrollView>;
  return <ExerciseDetailSheet key={selected.id} exercise={selected} onDismiss={onBack} headingDetails={<Text style={[styles.sessionCount, { color: colors.mutedText }]}>{new Set(selected.history.map((point) => point.workoutId)).size} {new Set(selected.history.map((point) => point.workoutId)).size === 1 ? 'workout' : 'workouts'} logged</Text>}>{summary}</ExerciseDetailSheet>;
}


function LiftSummary({ points, metric, metricOptions, onMetricChange, range, weeks, change, onRangeChange, colors, onDeleteSet, gutter, embedded }: {
  points: LiftProgress[];
  metric: ProgressMetric;
  metricOptions: MetricOption[];
  onMetricChange: (metric: ProgressMetric) => void;
  range: TimeRange;
  weeks: number | null;
  change: number | null;
  onRangeChange: (range: TimeRange) => void;
  colors: ReturnType<typeof useAppearance>['colors'];
  onDeleteSet?: (set: WorkoutHistoryPoint) => void;
  gutter: number;
  embedded: boolean;
}) {
  const { width } = useWindowDimensions();
  // Screen gutters + card padding + the fixed y-axis leave this much for the scrolling plot.
  const viewportWidth = Math.max(1, width - gutter * 2 - (embedded ? 36 : 0) - axisWidth);
  const pointSpacing = Math.max(44, (viewportWidth - 32) / Math.max(points.length - 1, 1));
  const chartWidth = Math.max(viewportWidth, 32 + (points.length - 1) * pointSpacing);
  const chartScroll = useRef<ScrollView>(null);
  const [activeWorkoutId, setActiveWorkoutId] = useState(points.at(-1)?.workoutId);
  const activePoint = points.find((point) => point.workoutId === activeWorkoutId) ?? points.at(-1);
  const [scrollOffset, setScrollOffset] = useState(Math.max(0, chartWidth - viewportWidth));
  const firstVisible = Math.max(0, Math.min(points.length - 1, Math.ceil((scrollOffset - 16) / pointSpacing)));
  const lastVisible = Math.max(firstVisible, Math.min(points.length - 1, Math.floor((scrollOffset + viewportWidth - 16) / pointSpacing)));
  const unit = metric === 'bestReps' || metric === 'totalReps' ? 'reps' : 'lb';
  const title = metricOptions.find((option) => option.value === metric)?.title ?? '';
  const displayValue = (value: number) => metric === 'maxWeight' ? value : Math.round(value);
  const setValue = (set: LiftProgress['bestSet']) => `${unit === 'lb' ? `${set.weight} lb × ` : set.weight ? `+${set.weight} lb × ` : ''}${set.reps} reps`;
  const comparison = weeks === null ? 'All logged workouts' : change === null ? 'Not enough workouts to compare yet' : `${change >= 0 ? '+' : ''}${Math.round(change)}% average per workout vs. prior ${weeks} weeks`;
  const minValue = Math.min(...points.map((point) => point.value));
  const maxValue = Math.max(...points.map((point) => point.value));
  const flat = maxValue === minValue;
  const coordinates = points.map((point, index) => ({ x: 16 + index * pointSpacing, y: flat ? 96 : 144 - (point.value - minValue) / (maxValue - minValue) * 96 }));
  // Gridlines sit at the max, midpoint and min of the visible range, so each one can carry a value.
  const ticks = flat ? [{ y: 96, value: maxValue }] : [{ y: 48, value: maxValue }, { y: 96, value: (maxValue + minValue) / 2 }, { y: 144, value: minValue }];
  const selectedCoordinate = activePoint ? coordinates[points.indexOf(activePoint)] : null;

  return <>
    <View style={[styles.card, !embedded && styles.analysisChart, { backgroundColor: embedded ? colors.surface : colors.background }]}>
      <SegmentedPicker options={metricOptions} selected={metric} onSelect={onMetricChange} compact />
      <View style={styles.valueRow}>
        <View accessible accessibilityLabel={`${title}, ${activePoint ? `${displayValue(activePoint.value)} ${unit}, ${formatDate(activePoint.date)}` : 'no workouts in this period'}`}>
          <Text style={[styles.valueLabel, { color: colors.mutedText }]}>{title}</Text>
          <Text style={[styles.metricValue, { color: colors.text }]}>{activePoint ? displayValue(activePoint.value) : '—'}<Text style={[styles.metricUnit, { color: colors.mutedText }]}> {unit}</Text></Text>
          <Text style={[styles.valueMeta, { color: colors.mutedText }]}>{activePoint ? `${activePoint.workoutId === points.at(-1)?.workoutId ? 'Latest' : 'Selected'} · ${formatDate(activePoint.date)}` : weeks === null ? 'All workouts' : `Last ${weeks} weeks`}</Text>
        </View>
        {activePoint?.personalBest && <View style={[styles.bestTag, { backgroundColor: colors.accent }]}><Text style={[styles.bestTagText, { color: colors.accentText }]}>Personal best</Text></View>}
      </View>
      {activePoint ? <>
        <View style={styles.chartRow}>
          <View style={styles.axis} accessible accessibilityLabel={`${title} axis from ${axisValue(displayValue(minValue))} to ${axisValue(displayValue(maxValue))} ${unit}`}>{ticks.map(({ y, value }) => <Text key={y} style={[styles.axisLabel, { top: y - 7, color: colors.subtleText }]}>{axisValue(displayValue(value))}</Text>)}</View>
          <ScrollView ref={chartScroll} horizontal style={styles.chart} onContentSizeChange={() => chartScroll.current?.scrollToEnd({ animated: false })} onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.x)} scrollEventThrottle={32} showsHorizontalScrollIndicator={false}>
            <Svg width={chartWidth} height={174} viewBox={`0 0 ${chartWidth} 174`} accessibilityLabel="Exercise progress chart">
              {ticks.map(({ y }) => <Line key={y} x1="0" x2={chartWidth} y1={y} y2={y} stroke={colors.surfaceStrong} strokeWidth="1" />)}
              <Polyline points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke={colors.accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {selectedCoordinate && <Line x1={selectedCoordinate.x} x2={selectedCoordinate.x} y1={selectedCoordinate.y + 10} y2="144" stroke={colors.subtleText} strokeWidth="1" strokeDasharray="3 4" />}
              {points.map((point, index) => <Circle key={point.workoutId} cx={coordinates[index].x} cy={coordinates[index].y} r={point.workoutId === activePoint.workoutId ? 7 : 5} fill={point.personalBest ? colors.accent : colors.text} stroke={colors.surface} strokeWidth="2" />)}
              {points.map((point, index) => <Circle key={`${point.workoutId}-touch`} cx={coordinates[index].x} cy={coordinates[index].y} r={20} fill="transparent" onPress={() => setActiveWorkoutId(point.workoutId)} accessibilityLabel={`${formatDate(point.date)}, ${displayValue(point.value)} ${unit}${point.personalBest ? ', personal best' : ''}. Show sets`} />)}
            </Svg>
          </ScrollView>
        </View>
        <View style={styles.chartLabels}><Text style={[styles.chartDate, { color: colors.subtleText }]}>{formatDate(points[firstVisible].date)}</Text><Text style={[styles.chartDate, { color: colors.subtleText }]}>{formatDate(points[lastVisible].date)}</Text></View>
      </> : <View style={styles.chartEmpty}><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>No workouts in this period yet.</Text></View>}
      <View style={styles.rangePicker}><SegmentedPicker options={timeRanges} selected={range} onSelect={onRangeChange} compact /></View>
      <Text style={[styles.comparison, { color: colors.mutedText }]}>{comparison}</Text>
    </View>
    {activePoint && <>
      <SectionHeader title={`${formatDate(activePoint.date)} workout`} />
      <View style={[styles.card, styles.setCard, { backgroundColor: colors.surface }]}>
        {activePoint.sets.map((set, index) => {
          const divider = index < activePoint.sets.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.surfaceStrong };
          const row = <View style={[styles.setRow, { backgroundColor: colors.surface }]}><Text style={[styles.setNumber, { color: colors.mutedText }]}>{String(set.setNumber).padStart(2, '0')}</Text><Text style={[styles.setValue, { color: colors.text }]}>{setValue(set)}</Text>{activePoint.sets.length > 1 && set === activePoint.bestSet && metric !== 'volume' && metric !== 'totalReps' && <Text style={[styles.topSet, { color: colors.mutedText }]}>Top set</Text>}</View>;
          return onDeleteSet ? <Swipeable key={`${set.workoutId}-${set.setNumber}`} containerStyle={divider} friction={1.6} rightThreshold={40} overshootRight={false} renderRightActions={() => <Pressable onPress={() => onDeleteSet(set)} style={({ pressed }) => [styles.deleteAction, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`Delete set ${set.setNumber}`}><Text style={styles.deleteActionText}>Delete</Text></Pressable>}>{row}</Swipeable> : <View key={`${set.workoutId}-${set.setNumber}`} style={divider}>{row}</View>;
        })}
      </View>
    </>}
  </>;
}

function formatDate(date: Date) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date); }

const styles = StyleSheet.create({
  body: { flex: 1 }, content: { paddingHorizontal: 20, paddingTop: 0, paddingBottom: 100 }, embeddedContent: { paddingHorizontal: 0, paddingTop: 0 }, sessionCount: { marginTop: 14, fontSize: 12, fontWeight: '600' }, analysisChart: { paddingHorizontal: 0, paddingTop: 0, borderRadius: 0 },
  card: { padding: 18, borderRadius: 24, borderCurve: 'continuous' },
  valueRow: { marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, valueLabel: { fontSize: 13, fontWeight: '800' }, metricValue: { fontSize: 46, lineHeight: 53, fontWeight: '900', letterSpacing: -2.4, fontVariant: ['tabular-nums'] }, metricUnit: { fontSize: 17, fontWeight: '800', letterSpacing: -.3 }, valueMeta: { fontSize: 12, fontWeight: '700' }, bestTag: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 }, bestTagText: { fontSize: 11, fontWeight: '900' },
  chartRow: { marginTop: 6, flexDirection: 'row' }, axis: { width: axisWidth, height: 174 }, axisLabel: { position: 'absolute', left: 0, right: 8, fontSize: 10, lineHeight: 14, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  chart: { flex: 1, height: 174 }, chartLabels: { marginTop: -12, marginLeft: axisWidth, flexDirection: 'row', justifyContent: 'space-between' }, chartDate: { fontSize: 10, fontWeight: '800' }, chartEmpty: { height: 174, marginTop: 6, alignItems: 'center', justifyContent: 'center' },
  rangePicker: { marginTop: 16 }, comparison: { marginTop: 12, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  setCard: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' }, setRow: { minHeight: 54, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' }, setNumber: { width: 35, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] }, setValue: { flex: 1, fontSize: 15, fontWeight: '800' }, topSet: { fontSize: 11, fontWeight: '700' }, deleteAction: { width: 80, backgroundColor: '#D9433F', alignItems: 'center', justifyContent: 'center' }, deleteActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }, emptyTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -.9 }, emptyCopy: { marginTop: 7, fontSize: 14, textAlign: 'center', fontWeight: '600' },
});
