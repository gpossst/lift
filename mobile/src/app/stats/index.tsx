import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Clock, Search } from 'react-native-feather';
import { router } from 'expo-router';

import { useAppearance } from '@/components/appearance-provider';
import { EmptyArt } from '@/components/empty-art';
import { bodyMuscleIds, TrainingExposureBodyGraphic } from '@/components/muscle-body-graphic';
import { CoverageTrendSheet } from '@/components/coverage-trend-sheet';
import { MuscleTrendRow } from '@/components/muscle-trend-row';
import { ProgressRing, SectionHeader } from '@/components/overview-parts';
import { SegmentedPicker } from '@/components/segmented-picker';
import { ExerciseSearchSheet } from '@/components/exercise-search-sheet';
import { loadStatsExercises } from '@/components/stats-exercise-row';
import { getCompletedWorkoutExerciseDetails, getCustomSplits, getExercises, getWorkoutVisits } from '@/db';
import { defaultWorkoutSplits } from '@/lib/exercise-recommendations';
import { averageCoverage, muscleCoverage, splitCoverage, trainingOverview, trainingTotalLabel, weeklyChartExtrema, weeklyTrainingHistory } from '@/lib/training-overview';
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
  const { colors, useCustomSplits } = useAppearance();
  const { width: screenWidth } = useWindowDimensions();
  const [metric, setMetric] = useState<Metric>('workouts');
  const [timeWindow, setTimeWindow] = useState<4 | 13 | 26 | 52 | null>(4);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [exerciseSheet, setExerciseSheet] = useState<'closed' | 'search'>('closed');
  const load = useCallback(() => {
    const visits = getWorkoutVisits();
    const details = getCompletedWorkoutExerciseDetails();
    const catalog = getExercises();
    const exercises = loadStatsExercises(visits, details, catalog);
    const now = new Date();
    const history = weeklyTrainingHistory(visits, now);
    const overview = trainingOverview(visits, (id) => details.get(id) ?? [], catalog, now, undefined, history.length);
    const customSplits = getCustomSplits();
    const planDefinitions = useCustomSplits && customSplits.length ? customSplits : defaultWorkoutSplits;
    return {
      overview,
      history,
      definitions: planDefinitions,
      planMuscles: [...new Set(planDefinitions.flatMap((split) => split.muscles))],
      exercises,
    };
  }, [useCustomSplits]);
  const data = useWorkoutData(load);

  const { inProgress, current, previous } = data.overview;
  const hasData = current.workouts + previous.workouts > 0;
  const weeks = data.overview.weeks.slice(-8);
  const recentWeeks = weeks.slice(4);
  const priorWeeks = weeks.slice(0, 4);
  const splits = splitCoverage(weeks, data.definitions ?? defaultWorkoutSplits);
  const recentCoverage = Object.fromEntries(bodyMuscleIds.map((muscle) => [muscle, muscleCoverage(recentWeeks, muscle)]));
  const overallCoverage = averageCoverage(recentWeeks, data.planMuscles);
  const priorCoverage = averageCoverage(priorWeeks, data.planMuscles);
  const coverageDelta = overallCoverage - priorCoverage;
  const orderedMuscles = [...new Set([...bodyMuscleIds, ...weeks.flatMap((week) => Object.keys(week.coverage))])].sort((a, b) => muscleCoverage(recentWeeks, b) - muscleCoverage(recentWeeks, a) || muscleCoverage(priorWeeks, b) - muscleCoverage(priorWeeks, a) || a.localeCompare(b));
  const visibleMuscles = orderedMuscles.slice(0, 5);
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
        <Text style={[ui.eyebrow, { color: colors.mutedText }]}>MUSCLE COVERAGE · 4 WEEKS</Text>
        <View style={styles.heroRow}>
          <View style={styles.heroLead}>
            <Text style={[styles.heroValue, { color: colors.text }]}>{overallCoverage}<Text style={[styles.heroUnit, { color: colors.mutedText }]}>%</Text></Text>
            {hasData && <View accessible accessibilityLabel={`${coverageDelta >= 0 ? 'Up' : 'Down'} ${Math.abs(coverageDelta)} points from the previous 4 weeks`}>
              <Text style={[styles.heroDelta, { color: coverageDelta > 0 ? colors.text : coverageDelta < 0 ? '#FF5151' : colors.mutedText }]}>{coverageDelta === 0 ? '±0' : `${coverageDelta > 0 ? '▲' : '▼'} ${Math.abs(coverageDelta)}`} pts</Text>
              <Text style={[styles.heroCaption, { color: colors.mutedText }]}>vs prior 4 wks</Text>
            </View>}
          </View>
          <View style={styles.heroSide} accessible accessibilityLabel={`${inProgress.workouts} ${inProgress.workouts === 1 ? 'workout' : 'workouts'} this week`}>
            <Text style={[styles.heroSideValue, { color: colors.text }]}>{inProgress.workouts}</Text>
            <Text style={[styles.heroCaption, { color: colors.mutedText }]}>{inProgress.workouts === 1 ? 'workout' : 'workouts'} this week</Text>
          </View>
        </View>
        <TrainingExposureBodyGraphic coverage={recentCoverage} hasData={hasData} />
        {hasData ? <CoverageScale /> : <View><EmptyArt name="chart" width={120} /><Text style={[styles.emptyCopy, styles.centered, { color: colors.mutedText }]}>No workouts in the last 4 weeks, including this week</Text></View>}
      </View>

      <SectionHeader title="Splits" />
      <View style={styles.splitRow}>{splits.map((split) => <Pressable key={split.id} onPress={() => router.push({ pathname: '/stats/muscles', params: { split: split.id } })} style={({ pressed }) => [styles.splitItem, { width: `${100 / (splits.length <= 4 ? splits.length : 3)}%` }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`${split.name}, ${split.percentage} percent covered. View muscles`}>
        <ProgressRing value={split.percentage} color={colors.accent} track={colors.surfaceStrong}><Text style={[styles.ringValue, { color: colors.text }]}>{split.percentage}<Text style={styles.ringUnit}>%</Text></Text></ProgressRing>
        <Text style={[styles.splitName, { color: colors.text }]} numberOfLines={1}>{split.name}</Text>
      </Pressable>)}</View>

      <SectionHeader title="Muscles" action={orderedMuscles.length > 5 && hasData ? { label: 'See all', onPress: () => router.push('/stats/muscles') } : undefined} />
      <View>
        {hasData ? visibleMuscles.map((muscle, index) => <MuscleTrendRow key={muscle} muscle={muscle} values={weeks.map((week) => muscleCoverage([week], muscle))} recent={muscleCoverage(recentWeeks, muscle)} prior={muscleCoverage(priorWeeks, muscle)} onPress={() => setSelectedMuscle(muscle)} last={index === visibleMuscles.length - 1} />)
          : <View><EmptyArt name="chart" width={120} /><Text style={[styles.emptyCopy, styles.centered, { color: colors.mutedText }]}>Train a few sessions to see how each muscle is trending.</Text></View>}
      </View>
      <Text style={[styles.methodNote, { color: colors.subtleText }]}>Estimated from exercise targets over the last 4 weeks, including this week, compared with the 4 before.</Text>

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
    <CoverageTrendSheet muscle={selectedMuscle} weeks={data.overview.weeks} onClose={() => setSelectedMuscle(null)} />
  </SafeAreaView>;
}

function CoverageScale() {
  const { colors } = useAppearance();
  return <View style={styles.scale} accessible accessibilityLabel="Color scale from 0 to 100 percent of the weekly coverage target. The fuller the color, the closer to target.">
    <Text style={[styles.scaleLabel, { color: colors.subtleText }]}>0%</Text>
    <Svg height={6} style={styles.scaleBar}>
      <Defs><LinearGradient id="coverage-scale" x1="0" y1="0" x2="1" y2="0"><Stop offset={0} stopColor={colors.surfaceStrong} /><Stop offset={1} stopColor={colors.accent} /></LinearGradient></Defs>
      <Rect width="100%" height={6} rx={3} fill="url(#coverage-scale)" />
    </Svg>
    <Text style={[styles.scaleLabel, { color: colors.subtleText }]}>Target</Text>
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 120 },
  historyAction: { height: 36, paddingHorizontal: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6 }, historyActionText: { fontSize: 13, fontWeight: '800' },
  searchEntry: { height: 46, marginBottom: 14, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, searchEntryText: { fontSize: 15, fontWeight: '700' },
  card: { padding: 18, borderRadius: 24, borderCurve: 'continuous' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, heroLead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroDelta: { fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] }, heroCaption: { marginTop: 1, fontSize: 11, fontWeight: '700' },
  heroSide: { alignItems: 'flex-end', paddingBottom: 6 }, heroSideValue: { fontSize: 22, fontWeight: '900', letterSpacing: -.6, fontVariant: ['tabular-nums'] },
  heroValue: { marginTop: 4, fontSize: 48, lineHeight: 54, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'] }, heroUnit: { fontSize: 26, letterSpacing: -.5 },
  scale: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 10 }, scaleBar: { flex: 1 }, scaleLabel: { fontSize: 10, fontWeight: '800' },
  // Up to four rings share one row; larger plans wrap into rows of three.
  splitRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 14 },
  splitItem: { paddingVertical: 4, paddingHorizontal: 5, alignItems: 'center' },
  splitName: { marginTop: 10, fontSize: 13, fontWeight: '800' },
  ringValue: { fontSize: 16, fontWeight: '900', letterSpacing: -.5, fontVariant: ['tabular-nums'] }, ringUnit: { fontSize: 10 },
  methodNote: { marginTop: 10, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  totalRow: { marginTop: 20, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  totalValue: { fontSize: 34, fontWeight: '900', letterSpacing: -1.2, fontVariant: ['tabular-nums'] }, totalLabel: { fontSize: 13, fontWeight: '800' },
  totalMeta: { marginTop: 2, fontSize: 12, fontWeight: '700' },
  chart: { height: 150, marginTop: 14 }, chartBars: { alignItems: 'flex-start' }, barGap: { width: 6 }, week: { alignItems: 'center' },
  barValue: { height: 16, fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
  barTrack: { width: '100%', height: 100, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 6, borderCurve: 'continuous' }, weekLabel: { marginTop: 8, fontSize: 9, fontWeight: '800' },
  rangePicker: { marginTop: 8 },
  emptyCopy: { marginVertical: 16, fontSize: 13, lineHeight: 19, fontWeight: '600' }, centered: { textAlign: 'center' },
});
