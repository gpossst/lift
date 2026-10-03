import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import { X } from 'react-native-feather';

import { useAppearance } from '@/components/appearance-provider';
import { muscleLabel as label } from '@/components/muscle-trend-row';
import { muscleCoverage, trainingOverview } from '@/lib/training-overview';

const dateLabel = (date: Date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
const timeRanges = [
  { label: '1M', weeks: 4, name: 'month' },
  { label: '3M', weeks: 13, name: '3 months' },
  { label: '6M', weeks: 26, name: '6 months' },
  { label: '1Y', weeks: 52, name: 'year' },
  { label: 'All', weeks: null, name: 'all time' },
] as const;

export function CoverageTrendSheet({ muscle, weeks, split, onClose }: {
  muscle: string | null;
  weeks: ReturnType<typeof trainingOverview>['weeks'];
  split?: string;
  onClose: () => void;
}) {
  const { colors } = useAppearance();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const chartScroll = useRef<ScrollView>(null);
  const [timeWindow, setTimeWindow] = useState<4 | 13 | 26 | 52 | null>(4);
  const [scrollOffset, setScrollOffset] = useState(0);
  const firstWorkoutWeek = weeks.findIndex((week) => week.workouts > 0);
  const chartWeeks = timeWindow === null ? weeks.slice(firstWorkoutWeek < 0 ? -4 : firstWorkoutWeek) : weeks.slice(-timeWindow);
  const values = muscle ? chartWeeks.map((week) => muscleCoverage([week], muscle, split)) : [];
  const chartWidth = Math.max(width - 48, 54 + (chartWeeks.length - 1) * 38);
  const spacing = (chartWidth - 54) / Math.max(chartWeeks.length - 1, 1);
  const points = values.map((value, index) => ({ x: 38 + index * spacing, y: 110 - value }));
  const firstVisible = Math.max(0, Math.min(chartWeeks.length - 1, Math.ceil((scrollOffset - 38) / spacing)));
  const lastVisible = Math.max(firstVisible, Math.min(chartWeeks.length - 1, Math.floor((scrollOffset + width - 48 - 38) / spacing)));

  return <Modal visible={muscle !== null} transparent animationType="none" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close coverage trend" />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(280)} style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(24, insets.bottom + 12) }]}>
        <View style={[styles.handle, { backgroundColor: colors.surfaceStrong }]} />
        <View style={styles.heading}><View><Text style={[styles.title, { color: colors.text }]}>{muscle ? label(muscle) : ''}</Text><Text style={[styles.subtitle, { color: colors.mutedText }]}>Weekly coverage · {timeWindow === null ? 'all weeks' : `last ${timeWindow} weeks`}</Text><Text style={[styles.average, { color: colors.text }]}>{Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length))}<Text style={[styles.averageUnit, { color: colors.mutedText }]}>% avg</Text></Text></View><Pressable onPress={onClose} hitSlop={10} style={[styles.close, { backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Close coverage trend"><X width={18} height={18} color={colors.text} strokeWidth={2.5} /></Pressable></View>
        <ScrollView key={timeWindow ?? 'all'} ref={chartScroll} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => { setScrollOffset(Math.max(0, chartWidth - (width - 48))); chartScroll.current?.scrollToEnd({ animated: false }); }} onScroll={(event) => setScrollOffset(event.nativeEvent.contentOffset.x)} scrollEventThrottle={32}>
          <Svg width={chartWidth} height={120} viewBox={`0 0 ${chartWidth} 120`} accessibilityLabel={`${muscle ? label(muscle) : 'Muscle'} weekly coverage: ${values.map((value) => `${Math.round(value)} percent`).join(', ')}`}>
            {[10, 60, 110].map((y) => <Line key={y} x1={38} x2={chartWidth - 16} y1={y} y2={y} stroke={colors.surfaceStrong} strokeWidth={1} />)}
            {[100, 50, 0].map((value, index) => <SvgText key={value} x={0} y={14 + index * 50} fill={colors.mutedText} fontSize={10} fontWeight="700">{value}%</SvgText>)}
            {points.length > 1 && <Polygon points={`${points[0].x},110 ${points.map(({ x, y }) => `${x},${y}`).join(' ')} ${points[points.length - 1].x},110`} fill={colors.accent} fillOpacity={0.14} />}
            <Polyline points={points.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke={colors.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            {points.map(({ x, y }, index) => <Circle key={index} cx={x} cy={y} r={4} fill={colors.background} stroke={colors.accent} strokeWidth={2.5} />)}
          </Svg>
        </ScrollView>
        <View style={styles.dates}><Text style={[styles.date, { color: colors.mutedText }]}>{chartWeeks[firstVisible] && dateLabel(chartWeeks[firstVisible].start)}</Text><Text style={[styles.date, { color: colors.mutedText }]}>{chartWeeks[lastVisible] && dateLabel(chartWeeks[lastVisible].start)}</Text></View>
        <View style={[styles.timeTabs, { backgroundColor: colors.surface }]} accessibilityRole="tablist">{timeRanges.map(({ label: rangeLabel, weeks: window, name }) => {
          const selected = timeWindow === window;
          return <Pressable key={rangeLabel} onPress={() => setTimeWindow(window)} style={[styles.timeTab, selected && { backgroundColor: colors.surfaceStrong }]} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={`Show ${name} of coverage history`}><Text style={[styles.timeTabText, { color: selected ? colors.text : colors.subtleText }]}>{rangeLabel}</Text></Pressable>;
        })}</View>
        <Text style={[styles.note, { color: colors.mutedText }]}>Each point shows that week&apos;s progress toward the coverage target.</Text>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.38)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 24 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center' },
  heading: { marginTop: 20, marginBottom: 18, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 23, fontWeight: '900' }, subtitle: { marginTop: 3, fontSize: 12, fontWeight: '700' },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  average: { marginTop: 12, fontSize: 38, fontWeight: '900', letterSpacing: -1.4, fontVariant: ['tabular-nums'] }, averageUnit: { fontSize: 15, letterSpacing: 0, fontWeight: '800' },
  dates: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' }, date: { fontSize: 10, fontWeight: '700' },
  timeTabs: { marginTop: 14, padding: 3, borderRadius: 12, flexDirection: 'row' }, timeTab: { flex: 1, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, timeTabText: { fontSize: 12, fontWeight: '900' },
  note: { marginTop: 10, fontSize: 11, lineHeight: 16, fontWeight: '600' },
});
