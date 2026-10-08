import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock, Search } from 'react-native-feather';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { router } from 'expo-router';

import { useAppearance } from '@/components/appearance-provider';
import { EmptyArt } from '@/components/empty-art';
import { bodyMuscleIds, TrainingExposureBodyGraphic } from '@/components/muscle-body-graphic';
import { CoverageTrendSheet } from '@/components/coverage-trend-sheet';
import { MuscleTrendRow } from '@/components/muscle-trend-row';
import { ProgressRing, SectionHeader } from '@/components/overview-parts';
import { SegmentedPicker } from '@/components/segmented-picker';
import { ExerciseSearchSheet } from '@/components/exercise-search-sheet';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { formatSet, loadStatsExercises, type StatsExercise } from '@/components/stats-exercise-row';
import { getCompletedWorkoutExerciseDetails, getExercises, getWorkoutVisits } from '@/db';
import { compareCoverage, coverageDays, coverageStatusColor, coverageStatusLabel, coverageSummary, muscleCoverage, trainingOverview, trainingTotalLabel, weeklyChartExtrema, weeklyTrainingHistory } from '@/lib/training-overview';
import { useCoveragePlan } from '@/hooks/use-coverage-plan';
import { ui } from '@/styles/primitives';
import { useWorkoutData } from '@/hooks/use-workout-data';

type Metric = 'workouts' | 'sets' | 'volume';
const metrics = [
  { value: 'workouts', label: 'Workouts', accessibilityLabel: 'Show workouts trend' },
  { value: 'sets', label: 'Sets', accessibilityLabel: 'Show sets trend' },
  { value: 'volume', label: 'Volume', accessibilityLabel: 'Show volume trend' },
] as const;
const timeRanges = [
  { label: '1M', weeks: 4, name: 'past month' },
  { label: '3M', weeks: 13, name: 'past 3 months' },
  { label: '6M', weeks: 26, name: 'past 6 months' },
  { label: '1Y', weeks: 52, name: 'past year' },
  { label: 'All', weeks: null, name: 'all time' },
] as const;
const rangeOptions = timeRanges.map(({ label, weeks, name }) => ({ value: String(weeks ?? 'all'), label, accessibilityLabel: `Show ${name}` }));
const format = (value: number) => value >= 10_000 ? `${Math.round(value / 1_000)}k` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : String(Math.round(value * 10) / 10);
const weekLabel = (date: Date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);

export default function StatsScreen() {
  const { colors } = useAppearance();
  const { schedule, plan } = useCoveragePlan();
  const { width: screenWidth } = useWindowDimensions();
  const [metric, setMetric] = useState<Metric>('workouts');
  const [timeWindow, setTimeWindow] = useState<4 | 13 | 26 | 52 | null>(4);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [exerciseSheet, setExerciseSheet] = useState<'closed' | 'search' | 'list'>('closed');
  const load = useCallback(() => {
    const visits = getWorkoutVisits();
    const details = getCompletedWorkoutExerciseDetails();
    const catalog = getExercises();
    const exercises = loadStatsExercises(visits, details, catalog);
    const now = new Date();
    const history = weeklyTrainingHistory(visits, now);
    const overview = trainingOverview(visits, (id) => details.get(id) ?? [], catalog, now, history.length);
    return { overview, history, exercises };
  }, []);
  const data = useWorkoutData(load);

  const { current, previous } = data.overview;
  const hasData = current.workouts + previous.workouts > 0;
  const weeks = data.overview.weeks.slice(-8);
  const coverage = plan ? [...new Set([...bodyMuscleIds, ...plan.targets.keys(), ...weeks.flatMap((week) => Object.keys(week.muscles))])].map((muscle) => muscleCoverage(data.overview, muscle, plan)).sort(compareCoverage) : [];
  const days = plan && coverageDays(data.overview, plan);
  const coverageByMuscle = new Map(coverage.map((item) => [item.muscle, item]));
  const summary = coverageSummary(coverage);
  const statuses = Object.fromEntries(coverage.map(({ muscle, status }) => [muscle, status]));
  const splits = schedule.map(({ id, name, muscles }) => {
    const planned = muscles.filter((muscle) => plan?.targets.has(muscle));
    return { id, name, planned: planned.length, onTrack: planned.filter((muscle) => coverageByMuscle.get(muscle)?.status === 'onTrack').length };
  });
  const visibleMuscles = coverage.slice(0, 5);
  const recentExercises = data.exercises.filter((exercise) => exercise.recentSessions > 0).sort((a, b) => b.recentSessions - a.recentSessions).slice(0, 3);
  const firstWorkoutWeek = data.history.findIndex((week) => week.workouts > 0);
  const chartWeeks = timeWindow === null ? data.history.slice(firstWorkoutWeek < 0 ? -4 : firstWorkoutWeek) : data.history.slice(-timeWindow);
  const chartInner = screenWidth - 40 - 36;
  const barWidth = chartWeeks.length <= 4 ? (chartInner - 18) / 4 : Math.max(22, (chartInner - 7 * 6) / 8);
  const max = Math.max(1, ...chartWeeks.map((week) => week[metric]));
  const [lowIndex, highIndex] = weeklyChartExtrema(chartWeeks, metric);
  const rangeTotal = chartWeeks.reduce((sum, week) => sum + week[metric], 0);
  const rangeName = timeRanges.find((range) => range.weeks === timeWindow)?.name ?? 'all time';

  return <SafeAreaView edges={['top', 'right', 'left']} style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={ui.header}>
      <Text style={[ui.title, { color: colors.text }]}>Stats</Text>
      <Pressable onPress={() => router.push('/stats/history')} style={({ pressed }) => [styles.historyAction, { backgroundColor: colors.surface }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel="Workout history"><Clock width={15} height={15} color={colors.text} strokeWidth={2.4} /><Text style={[styles.historyActionText, { color: colors.text }]}>History</Text></Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Pressable onPress={() => setExerciseSheet('search')} style={({ pressed }) => [styles.searchEntry, { backgroundColor: colors.surface }, pressed && ui.pressed]} accessibilityRole="search" accessibilityLabel="Search exercise progress"><Search width={17} height={17} color={colors.subtleText} strokeWidth={2.4} /><Text style={[styles.searchEntryText, { color: colors.subtleText }]}>Search exercises</Text></Pressable>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[ui.eyebrow, { color: colors.mutedText }]}>MUSCLE COVERAGE</Text>
        <View style={styles.heroLead} accessible accessibilityLabel={plan ? `${summary.onTrack} of ${summary.planned} muscles on track over the last ${days} days` : 'Loading muscle coverage'}>
          <Text style={[styles.heroValue, { color: colors.text }]}>{plan ? summary.onTrack : '–'}<Text style={[styles.heroUnit, { color: colors.mutedText }]}>/{summary.planned}</Text></Text>
          <Text style={[styles.heroCaption, { color: colors.mutedText }]}>muscles on track{days ? `\nlast ${days} days` : ''}</Text>
        </View>
        <TrainingExposureBodyGraphic statuses={statuses} hasData={hasData} />
        {hasData ? <CoverageLegend summary={summary} /> : <View><EmptyArt name="chart" width={120} /><Text style={[styles.emptyCopy, styles.centered, { color: colors.mutedText }]}>No recent workouts yet</Text></View>}
      </View>

      <SectionHeader title="Splits" />
      <View style={styles.splitRow}>{splits.map((split) => <Pressable key={split.id} onPress={() => router.push({ pathname: '/stats/muscles', params: { split: split.id } })} style={({ pressed }) => [styles.splitItem, { width: `${100 / (splits.length <= 4 ? splits.length : 3)}%` }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`${split.name}, ${split.onTrack} of ${split.planned} muscles on track. View muscles`}>
        <ProgressRing value={split.planned ? split.onTrack / split.planned * 100 : 0} color={coverageStatusColor.onTrack!} track={colors.surfaceStrong}><Text style={[styles.ringValue, { color: colors.text }]}>{split.onTrack}<Text style={styles.ringUnit}>/{split.planned}</Text></Text></ProgressRing>
        <Text style={[styles.splitName, { color: colors.text }]} numberOfLines={1}>{split.name}</Text>
      </Pressable>)}</View>

      <SectionHeader title="Muscles" action={coverage.length > 5 && hasData ? { label: 'See all', onPress: () => router.push('/stats/muscles') } : undefined} />
      <View>
        {hasData ? visibleMuscles.map((item, index) => <MuscleTrendRow key={item.muscle} coverage={item} onPress={() => setSelectedMuscle(item.muscle)} last={index === visibleMuscles.length - 1} />)
          : <View><EmptyArt name="chart" width={120} /><Text style={[styles.emptyCopy, styles.centered, { color: colors.mutedText }]}>Train a few sessions to see how each muscle is trending.</Text></View>}
      </View>

      {recentExercises.length > 0 && <>
        <SectionHeader title="Recent exercises" action={{ label: 'See all', onPress: () => setExerciseSheet('list') }} />
        <View style={styles.recentList}>{recentExercises.map((item) => <RecentExerciseCard key={item.id} item={item} />)}</View>
      </>}

      <SectionHeader title="Training" />
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <SegmentedPicker options={metrics} selected={metric} onSelect={setMetric} compact />
        <View style={styles.totalRow}>
          <Text style={[styles.totalValue, { color: colors.text }]}>{format(rangeTotal)}</Text>
          <Text style={[styles.totalLabel, { color: colors.mutedText }]}>{trainingTotalLabel(metric, rangeTotal, rangeName)}</Text>
        </View>
        <Text style={[styles.totalMeta, { color: colors.mutedText }]}>{format(rangeTotal / Math.max(1, chartWeeks.length))} per week on average</Text>
        <FlatList key={`${timeWindow ?? 'all'}:${chartWeeks.length}`} horizontal data={chartWeeks} keyExtractor={(week) => String(week.start.getTime())} style={styles.chart} contentContainerStyle={styles.chartBars} showsHorizontalScrollIndicator={false} initialNumToRender={8} initialScrollIndex={Math.max(0, chartWeeks.length - 8)} getItemLayout={(_, index) => ({ length: barWidth + 6, offset: index * (barWidth + 6), index })} ItemSeparatorComponent={() => <View style={styles.barGap} />} renderItem={({ item: week, index }) => {
          const labelled = chartWeeks.length <= 8 || index === lowIndex || index === highIndex;
          return <View style={[styles.week, { width: barWidth }]}>
            <Text style={[styles.barValue, { color: colors.mutedText }]}>{labelled ? week.workouts === 0 ? '—' : format(week[metric]) : ''}</Text>
            <View style={styles.barTrack}><View style={[styles.bar, { height: week[metric] ? `${Math.max(6, week[metric] / max * 100)}%` : 4, backgroundColor: !week[metric] || index < chartWeeks.length - 4 ? colors.surfaceStrong : colors.accent }]} /></View>
            <Text style={[styles.weekLabel, { color: colors.subtleText }]}>{chartWeeks.length <= 8 || index === chartWeeks.length - 1 || (index % 4 === 0 && index < chartWeeks.length - 3) ? weekLabel(week.start) : ''}</Text>
          </View>;
        }} />
        <View style={styles.rangePicker}><SegmentedPicker options={rangeOptions} selected={String(timeWindow ?? 'all')} onSelect={(value) => setTimeWindow(timeRanges.find((range) => String(range.weeks ?? 'all') === value)!.weeks)} compact /></View>
      </View>
    </ScrollView>
    <ExerciseSearchSheet visible={exerciseSheet !== 'closed'} focus={exerciseSheet === 'search'} exercises={data.exercises} onClose={() => setExerciseSheet('closed')} />
    <CoverageTrendSheet coverage={selectedMuscle ? coverageByMuscle.get(selectedMuscle) ?? null : null} weeks={data.overview.weeks} onClose={() => setSelectedMuscle(null)} />
  </SafeAreaView>;
}

/** Most-trained exercise of the last 4 weeks with a line of its recent per-session progress (est. 1RM, or best reps for bodyweight). */
function RecentExerciseCard({ item }: { item: StatsExercise }) {
  const { colors } = useAppearance();
  const { width: screenWidth } = useWindowDimensions();
  const width = screenWidth - 40 - 32;
  const low = Math.min(...item.trend);
  const span = Math.max(...item.trend) - low;
  const points = item.trend.map((value, index) => ({ x: 6 + index * (width - 12) / Math.max(1, item.trend.length - 1), y: span ? 58 - (value - low) / span * 52 : 32 }));
  const change = item.trend.length >= 2 && item.trend[0] > 0 ? Math.round((item.trend.at(-1)! - item.trend[0]) / item.trend[0] * 100) : null;
  return <Pressable onPress={() => router.push({ pathname: '/stats/progress', params: { exerciseId: item.id } })} style={({ pressed }) => [styles.recentCard, { backgroundColor: colors.surface }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.recentSessions} ${item.recentSessions === 1 ? 'session' : 'sessions'} in the last 4 weeks${change === null ? '' : `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% over the last ${item.trend.length} sessions`}. View progress`}>
    <View style={styles.recentHeader}>
      <ExerciseThumb exercise={item} size={36} />
      <View style={styles.recentCopy}>
        <Text style={[styles.recentName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.recentMeta, { color: colors.mutedText }]} numberOfLines={1}>{item.topSet ? `${formatSet(item.topSet)} · ` : ''}{item.recentSessions} {item.recentSessions === 1 ? 'session' : 'sessions'} in 4 weeks</Text>
      </View>
      {change !== null && <Text style={[styles.recentChange, { color: change < 0 ? '#FF5151' : colors.accent }]}>{change > 0 ? '+' : ''}{change}%</Text>}
    </View>
    {points.length >= 2 ? <Svg width={width} height={64} style={styles.recentChart} accessibilityElementsHidden>
      <Polyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke={colors.accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map(({ x, y }, index) => <Circle key={index} cx={x} cy={y} r={index === points.length - 1 ? 5 : 3.5} fill={index === points.length - 1 ? colors.accent : colors.text} stroke={colors.surface} strokeWidth="2" />)}
    </Svg> : <Text style={[styles.recentEmpty, { color: colors.mutedText }]}>Log another session to see a trend.</Text>}
  </Pressable>;
}

/** Legend that doubles as the status breakdown; gathering only appears while it applies. */
function CoverageLegend({ summary }: { summary: ReturnType<typeof coverageSummary> }) {
  const { colors } = useAppearance();
  const statuses = (['below', 'onTrack', 'above', 'building'] as const).filter((status) => status !== 'building' || summary.building);
  return <View style={styles.legend}>{statuses.map((status) => <View key={status} style={styles.legendItem} accessible accessibilityLabel={`${summary[status]} ${coverageStatusLabel[status]}`}>
    <View style={[styles.legendSwatch, { backgroundColor: coverageStatusColor[status] ?? colors.surfaceStrong }]} />
    <Text style={[styles.legendCount, { color: colors.text }]}>{summary[status]}</Text>
    <Text style={[styles.scaleLabel, { color: colors.subtleText }]}>{status === 'building' ? 'Gathering' : coverageStatusLabel[status]}</Text>
  </View>)}</View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120 },
  historyAction: { height: 36, paddingHorizontal: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6 }, historyActionText: { fontSize: 13, fontWeight: '800' },
  searchEntry: { height: 46, marginBottom: 14, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, searchEntryText: { fontSize: 15, fontWeight: '700' },
  card: { padding: 18, borderRadius: 24, borderCurve: 'continuous' },
  heroLead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroCaption: { fontSize: 13, lineHeight: 17, fontWeight: '800' },
  heroValue: { marginTop: 4, fontSize: 48, lineHeight: 54, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'] }, heroUnit: { fontSize: 26, letterSpacing: -.5 },
  legend: { marginTop: 4, flexDirection: 'row', justifyContent: 'center', gap: 16 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 }, legendCount: { fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] }, scaleLabel: { fontSize: 10, fontWeight: '800' },
  // Up to four rings share one row; larger plans wrap into rows of three.
  splitRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 14 },
  splitItem: { paddingVertical: 4, paddingHorizontal: 5, alignItems: 'center' },
  splitName: { marginTop: 10, fontSize: 13, fontWeight: '800' },
  ringValue: { fontSize: 16, fontWeight: '900', letterSpacing: -.5, fontVariant: ['tabular-nums'] }, ringUnit: { fontSize: 10 },
  totalRow: { marginTop: 20, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  totalValue: { fontSize: 34, fontWeight: '900', letterSpacing: -1.2, fontVariant: ['tabular-nums'] }, totalLabel: { fontSize: 13, fontWeight: '800' },
  totalMeta: { marginTop: 2, fontSize: 12, fontWeight: '700' },
  chart: { height: 150, marginTop: 14 }, chartBars: { alignItems: 'flex-start' }, barGap: { width: 6 }, week: { alignItems: 'center' },
  barValue: { height: 16, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
  barTrack: { width: '100%', height: 100, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 6, borderCurve: 'continuous' }, weekLabel: { marginTop: 8, fontSize: 9, fontWeight: '800' },
  rangePicker: { marginTop: 8 },
  recentList: { gap: 10 }, recentCard: { padding: 16, borderRadius: 20, borderCurve: 'continuous' },
  recentHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 }, recentCopy: { flex: 1 },
  recentName: { fontSize: 15, fontWeight: '800', letterSpacing: -.3 }, recentMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  recentChange: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  recentChart: { marginTop: 12 }, recentEmpty: { marginTop: 12, fontSize: 12, fontWeight: '600' },
  emptyCopy: { marginVertical: 16, fontSize: 13, lineHeight: 19, fontWeight: '600' }, centered: { textAlign: 'center' },
});
