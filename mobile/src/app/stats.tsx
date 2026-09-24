import { ui } from '@/styles/primitives';
import { router } from 'expo-router';
import { ArrowLeft, Search, X } from 'react-native-feather';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { getExercises, getWorkoutHistory } from '@/db';
import { exerciseRequiresWeight } from '@/db/exercise-catalog';
import { useAppearance } from '@/components/appearance-provider';
import { progressFor, type LiftProgress } from '@/lib/lift-progress';

export default function StatsScreen() {
  const { colors } = useAppearance();
  const back = () => router.navigate('/history');
  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={back} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable><Text style={[ui.title, { color: colors.text }]}>Stats</Text></View>
    <StatsPanel />
  </SafeAreaView>;
}

export function StatsPanel({ initialExerciseId }: { initialExerciseId?: string }) {
  const { colors } = useAppearance();
  const lifts = useMemo(() => getExercises().map((exercise) => {
    const history = getWorkoutHistory(exercise.id);
    return { ...exercise, history, progress: progressFor(history, exerciseRequiresWeight(exercise)) };
  }).filter((exercise) => exercise.progress.length > 0), []);
  const [selectedId, setSelectedId] = useState(() => lifts.some((lift) => lift.id === initialExerciseId) ? initialExerciseId : lifts[0]?.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = lifts.find((lift) => lift.id === selectedId) ?? lifts[0];
  const filteredLifts = lifts.filter((lift) => lift.name.toLowerCase().includes(query.trim().toLowerCase()));
  const chooseLift = (id: string) => { setSelectedId(id); setQuery(''); setSheetOpen(false); };
  return <>
    {selected ? <View style={[styles.body, { position: 'relative' }]}><View style={[styles.content, { paddingBottom: 82 }]}><Text style={[styles.exerciseName, { color: colors.text }]}>{selected.name}</Text><LiftSummary key={selected.id} points={selected.progress} requiresWeight={exerciseRequiresWeight(selected)} colors={colors} /></View><View style={[styles.footer, { backgroundColor: 'transparent', paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, position: 'absolute', right: 24, bottom: 4 }]}><Pressable onPress={() => setSheetOpen(true)} style={({ pressed }) => [styles.changeButton, { backgroundColor: colors.accent, width: 52, height: 52, minHeight: 52, paddingHorizontal: 0, borderRadius: 16, justifyContent: 'center' }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Choose a different exercise"><Svg width={24} height={24} viewBox="0 0 24 24"><Line x1="4" y1="9" x2="4" y2="15" stroke={colors.accentText} strokeWidth="2.5" strokeLinecap="round" /><Line x1="7" y1="8" x2="7" y2="16" stroke={colors.accentText} strokeWidth="2.5" strokeLinecap="round" /><Line x1="7" y1="12" x2="17" y2="12" stroke={colors.accentText} strokeWidth="2.5" strokeLinecap="round" /><Line x1="17" y1="8" x2="17" y2="16" stroke={colors.accentText} strokeWidth="2.5" strokeLinecap="round" /><Line x1="20" y1="9" x2="20" y2="15" stroke={colors.accentText} strokeWidth="2.5" strokeLinecap="round" /></Svg></Pressable></View></View> : <View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>No stats yet</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Log an exercise to start seeing your growth.</Text></View>}
    <ExerciseSheet visible={sheetOpen} query={query} onQueryChange={setQuery} lifts={filteredLifts} selectedId={selected?.id} onChoose={chooseLift} onClose={() => { setQuery(''); setSheetOpen(false); }} colors={colors} />
  </>;
}

function LiftSummary({ points, requiresWeight, colors }: { points: LiftProgress[]; requiresWeight: boolean; colors: ReturnType<typeof useAppearance>['colors'] }) {
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
  const minValue = Math.min(...points.map((point) => point.value)); const maxValue = Math.max(...points.map((point) => point.value)); const valueRange = maxValue - minValue;
  const coordinates = points.map((point, index) => ({ x: 16 + index * pointSpacing, y: valueRange ? 94 - ((point.value - minValue) / valueRange) * 76 : 56 }));
  const linePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(' ');
  const strongest = points.reduce((best, point) => point.value > best.value ? point : best, points[0]);
  const setValue = (set: LiftProgress['bestSet']) => `${requiresWeight ? `${set.weight} lb × ` : set.weight ? `+${set.weight} lb × ` : ''}${set.reps}`;
  const badge = activePoint.workoutId === strongest.workoutId ? 'BEST' : activePoint.workoutId === points.at(-1)!.workoutId ? 'LATEST' : 'PAST';
  const allSets = points.flatMap((point) => point.sets).reverse();
  const columns = width - 48 >= 304 ? 3 : 2;
  const chipWidth = (width - 48 - (columns - 1) * 6) / columns;
  return <View style={styles.summary}><View style={styles.metricHeader}><Text style={[styles.metricValue, { color: colors.text }]}>{Math.round(activePoint.value)} <Text style={styles.metricUnit}>{requiresWeight ? 'LB' : 'REPS'}</Text></Text><Text style={[styles.metricLabel, { color: colors.mutedText }]}>{requiresWeight ? 'Estimated 1RM' : 'Best reps'}</Text></View><ScrollView ref={chartScroll} horizontal style={styles.chart} onContentSizeChange={() => chartScroll.current?.scrollToEnd({ animated: false })} onScroll={(event) => { const next = visiblePoints(event.nativeEvent.contentOffset.x); setVisible((current) => current.first === next.first && current.last === next.last ? current : next); }} scrollEventThrottle={16} showsHorizontalScrollIndicator={chartWidth > viewportWidth}>
    <Svg width={chartWidth} height={112} viewBox={`0 0 ${chartWidth} 112`} accessibilityLabel={requiresWeight ? 'Estimated one rep max progress chart' : 'Best set reps progress chart'}>
      {[18, 94].map((y) => <Line key={y} x1="0" x2={chartWidth} y1={y} y2={y} stroke={colors.surfaceStrong} strokeWidth="1" />)}
      <Polyline points={linePoints} fill="none" stroke={colors.text} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => <Circle key={point.workoutId} cx={coordinates[index].x} cy={coordinates[index].y} r={dayKey(point.date) === activeDayKey ? 8 : 6} fill={colors.accent} stroke={colors.background} strokeWidth="3" onPress={() => setActiveDayKey(dayKey(point.date))} accessibilityLabel={`${formatDate(point.date)}: ${Math.round(point.value)} ${requiresWeight ? 'pounds estimated one rep max' : 'reps'}`} />)}
    </Svg>
  </ScrollView><View style={styles.chartLabels}><Text style={[styles.chartLabel, { color: colors.subtleText }]}>{formatDate(points[visible.first].date)}</Text><Text style={[styles.chartLabel, { color: colors.subtleText }]}>{formatDate(points[visible.last].date)}</Text></View><View style={styles.selectedSet}><View><Text style={[styles.selectedMeta, { color: colors.mutedText }]}>{formatDate(activePoint.date)}</Text><Text style={[styles.selectedValue, { color: colors.text }]}>{setValue(activePoint.bestSet)}</Text></View><Text style={[styles.selectedNote, { backgroundColor: colors.accent, color: colors.accentText }]}>{badge}</Text></View><Text style={[styles.sessionTitle, { color: colors.mutedText }]}>ALL SETS</Text><ScrollView style={styles.setList} nestedScrollEnabled showsVerticalScrollIndicator><View style={styles.setChips}>{allSets.map((set) => { const selected = dayKey(set.completedAt) === activeDayKey; return <Pressable key={`${set.workoutId}-${set.setNumber}`} onPress={() => setActiveDayKey(dayKey(set.completedAt))} style={({ pressed }) => [styles.setChip, { width: chipWidth, backgroundColor: selected ? colors.accent : colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${formatDate(set.completedAt)}, set ${set.setNumber}: ${setValue(set)}`}><Text style={[styles.setChipNumber, { color: selected ? colors.accentText : colors.subtleText }]}>SET {set.setNumber}</Text><Text style={[styles.setChipValue, { color: selected ? colors.accentText : colors.text }]}>{setValue(set)}</Text></Pressable>; })}</View></ScrollView></View>;
}

function ExerciseSheet({ visible, query, onQueryChange, lifts, selectedId, onChoose, onClose, colors }: { visible: boolean; query: string; onQueryChange: (value: string) => void; lifts: { id: string; name: string; progress: LiftProgress[] }[]; selectedId?: string; onChoose: (id: string) => void; onClose: () => void; colors: ReturnType<typeof useAppearance>['colors'] }) {
  const { height } = useWindowDimensions();
  const [backdropOpacity] = useState(() => new Animated.Value(0));
  const [sheetOffset] = useState(() => new Animated.Value(height));

  useEffect(() => {
    if (!visible) {
      backdropOpacity.setValue(0);
      sheetOffset.setValue(height);
      return;
    }
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(sheetOffset, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [backdropOpacity, height, sheetOffset, visible]);

  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}><View style={styles.sheetOverlay}><Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: backdropOpacity }]} /><Pressable onPress={onClose} style={StyleSheet.absoluteFill} accessibilityLabel="Close exercise picker" /><Animated.View style={[styles.sheet, { backgroundColor: colors.background, transform: [{ translateY: sheetOffset }] }]}><View style={[styles.handle, { backgroundColor: colors.surfaceStrong }]} /><View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: colors.text }]}>Choose exercise</Text><Pressable onPress={onClose} hitSlop={10} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close"><X width={20} height={20} color={colors.text} strokeWidth={2.5} /></Pressable></View><View style={[styles.searchField, { backgroundColor: colors.surface }]}><Search width={17} height={17} color={colors.subtleText} strokeWidth={2.3} /><TextInput autoFocus value={query} onChangeText={onQueryChange} placeholder="Search exercises" placeholderTextColor={colors.subtleText} style={[styles.searchInput, { color: colors.text }]} accessibilityLabel="Search exercises" /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetList}>{lifts.map((lift) => <Pressable key={lift.id} onPress={() => onChoose(lift.id)} style={({ pressed }) => [styles.liftRow, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityState={{ selected: lift.id === selectedId }}><View><Text style={[styles.liftName, { color: colors.text }]}>{lift.name}</Text><Text style={[styles.liftMeta, { color: colors.mutedText }]}>{lift.progress.length} sessions</Text></View>{lift.id === selectedId && <Text style={[styles.selectedMark, { color: colors.accent }]}>Selected</Text>}</Pressable>)}{lifts.length === 0 && <Text style={[styles.noMatches, { color: colors.mutedText }]}>No exercises match “{query}”.</Text>}</ScrollView></Animated.View></View></Modal>;
}

function formatDate(date: Date) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date); }
function dayKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }

const styles = StyleSheet.create({
   header: { height: 64, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },   body: { flex: 1 }, content: { paddingHorizontal: 24, paddingTop: 3, paddingBottom: 18 }, exerciseName: { fontSize: 30, lineHeight: 34, fontWeight: '900', letterSpacing: -1.3 }, summary: { marginTop: 20 }, metricHeader: { marginBottom: 5 }, metricLabel: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: -.1 }, metricValue: { fontSize: 29, lineHeight: 33, fontWeight: '900', letterSpacing: -1.45 }, metricUnit: { fontSize: 10, letterSpacing: 0 }, chart: { width: '100%', height: 112, marginTop: 7 }, chartLabels: { marginTop: -3, flexDirection: 'row', justifyContent: 'space-between' }, chartLabel: { fontSize: 9, fontWeight: '800' }, selectedSet: { marginTop: 12, paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, selectedMeta: { fontSize: 9, fontWeight: '900', letterSpacing: .5 }, selectedValue: { marginTop: 2, fontSize: 19, lineHeight: 22, fontWeight: '900', letterSpacing: -.5 }, selectedNote: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, fontSize: 8, lineHeight: 10, textAlign: 'center', fontWeight: '900', letterSpacing: .7 }, sessionTitle: { marginTop: 20, marginBottom: 7, fontSize: 9, fontWeight: '900', letterSpacing: .7 }, setList: { maxHeight: 320 }, setChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, setChip: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10 }, setChipNumber: { fontSize: 10, fontWeight: '900', letterSpacing: .6 }, setChipValue: { marginTop: 2, fontSize: 16, fontWeight: '900', letterSpacing: -.2 }, footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 }, changeButton: { minHeight: 56, paddingHorizontal: 18, borderRadius: 17, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, changeButtonText: { fontSize: 16, fontWeight: '900' }, pressed: { opacity: .68 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }, emptyTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -.9 }, emptyCopy: { marginTop: 7, fontSize: 14, textAlign: 'center', fontWeight: '600' }, sheetOverlay: { flex: 1, justifyContent: 'flex-end' }, sheetBackdrop: { backgroundColor: 'rgba(0,0,0,.38)' }, sheet: { maxHeight: '72%', minHeight: 360, paddingHorizontal: 24, paddingTop: 9, borderTopLeftRadius: 22, borderTopRightRadius: 22, }, handle: { width: 34, height: 4, borderRadius: 2, alignSelf: 'center' }, sheetHeader: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -.7 }, closeButton: { width: 38, height: 38, marginRight: -8, alignItems: 'center', justifyContent: 'center' }, searchField: { height: 42, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, searchInput: { flex: 1, height: '100%', fontSize: 14, fontWeight: '700' }, sheetList: { paddingBottom: 24 }, liftRow: { minHeight: 56, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, liftName: { fontSize: 15, fontWeight: '900', letterSpacing: -.35 }, liftMeta: { marginTop: 2, fontSize: 11, fontWeight: '700' }, selectedMark: { fontSize: 11, fontWeight: '900' }, noMatches: { paddingVertical: 22, textAlign: 'center', fontSize: 13, fontWeight: '700' },
});
