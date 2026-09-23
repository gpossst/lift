import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle } from '@shopify/react-native-skia';
import { LineGraph, type SelectionDotProps } from 'react-native-graph';
import Animated, { FadeIn, SlideInDown, useDerivedValue } from 'react-native-reanimated';
import Svg, { Line, Polyline } from 'react-native-svg';
import { closeExpiredWorkouts, getActiveWorkout, getWorkoutSplitTrends, getWorkoutVisits, type WorkoutVisitSummary } from '@/db';
import { useAppearance } from '@/components/appearance-provider';
import { syncWorkoutData } from '@/lib/cloud-sync';
import { getFriendPersonalRecords, getFriends, type FriendPersonalRecord } from '@/lib/friends';
import { getExercises } from '@/db';

function formatVolume(volume: number) {
	if (volume >= 10_000) return `${Math.round(volume / 1000)}k`;
	if (volume >= 1_000) return `${(volume / 1000).toFixed(1)}k`;
	return String(volume);
}

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatWeekOf(date: Date) { return `WEEK OF ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date).toUpperCase()}`; }

type VolumePoint = { volume: number; date: Date };

export default function HomeScreen() {
	const { colors } = useAppearance();
	const [expiredWorkoutCount] = useState(() => closeExpiredWorkouts());
	const [now] = useState(() => Date.now());
	const activeWorkout = getActiveWorkout();
	const visits = getWorkoutVisits();
	const trends = getWorkoutSplitTrends(8);
	const [selectedSplit, setSelectedSplit] = useState<'ALL' | 'PUSH' | 'PULL' | 'LEGS'>('ALL');
	const [selectedPoint, setSelectedPoint] = useState<VolumePoint | null>(null);
	const [friendRecords, setFriendRecords] = useState<FriendPersonalRecord[]>([]);
	const [friendCount, setFriendCount] = useState<number | null>(null);
	useFocusEffect(useCallback(() => {
    void Promise.all([getFriendPersonalRecords(), getFriends()])
			.then(([records, friends]) => { setFriendRecords(records); setFriendCount(friends.count); })
			.catch(() => undefined);
  }, []));
	useFocusEffect(useCallback(() => {
		const workout = getActiveWorkout();
		if (!workout) return;
		router.replace({ pathname: '/exercises', params: { split: workout.split, workoutId: workout.id } });
	}, []));
	useEffect(() => {
		if (!expiredWorkoutCount) return;
		void syncWorkoutData().catch(() => { /* Local timeout completion is never blocked by sync availability. */ });
	}, [expiredWorkoutCount]);

	if (activeWorkout) return null;
	const activeTrend = trends.find((trend) => trend.split === selectedSplit) ?? trends[0];
	const chartPoints = activeTrend?.points.map((point) => ({ volume: point.volume, date: new Date(`${point.weekStart}T12:00:00`) }))
		?? Array.from({ length: 8 }, (_, index) => ({ volume: 0, date: new Date(now - (7 - index) * 7 * 86_400_000) }));
	const displayedPoint = selectedPoint ?? chartPoints.at(-1);
	const previousPoint = chartPoints.at(-2);
	const volumeChange = previousPoint && previousPoint.volume > 0
		? Math.round(((chartPoints.at(-1)?.volume ?? 0) - previousPoint.volume) / previousPoint.volume * 100)
		: null;
	const volumeLabel = selectedSplit === 'ALL' ? 'Weekly volume' : 'Average volume';
	const trendContext = selectedPoint ? formatWeekOf(selectedPoint.date) : volumeLabel;
	const trendChange = !selectedPoint && volumeChange !== null ? `${volumeChange >= 0 ? '+' : ''}${volumeChange}% from last week` : null;

	return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
		<View style={styles.header}><Text style={[styles.title, { color: colors.text }]}>Home</Text></View>
		<ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} scrollEnabled={friendCount !== 0}>
			<View style={styles.section}>
				{activeTrend ? <>
					<View style={styles.trendSummary}><View style={styles.trendRow}><Text style={[styles.trendValue, { color: colors.text }]}>{formatVolume(displayedPoint?.volume ?? 0)} <Text style={styles.unit}>LB</Text></Text>{trendChange && <Text style={[styles.trendChange, { color: colors.mutedText }]}>{trendChange}</Text>}</View><Text style={[styles.trendContext, { color: colors.mutedText }]}>{trendContext}</Text></View>
					<VolumeChart points={chartPoints} onSelect={setSelectedPoint} onInteractionEnd={() => setSelectedPoint(null)} colors={colors} />
					<View style={styles.splitTabs}>
						{trends.map((trend) => <Pressable key={trend.split} onPress={() => { setSelectedSplit(trend.split); setSelectedPoint(null); }} style={styles.splitTab}><Text style={[styles.splitTabText, { color: colors.subtleText }, activeTrend.split === trend.split && { color: colors.text, textDecorationColor: colors.accent }]}>{trend.split === 'ALL' ? 'ALL' : trend.split[0] + trend.split.slice(1).toLowerCase()}</Text></Pressable>)}
					</View>
				</> : <Text style={[styles.emptyTrend, { color: colors.subtleText }]}>LOG A WORKOUT TO SEE YOUR TREND</Text>}
			</View>

			<MonthActivity visits={visits} colors={colors} />
			<FriendPersonalRecords records={friendRecords} friendCount={friendCount} />
		</ScrollView>
	</SafeAreaView>;
}

type AppColors = ReturnType<typeof useAppearance>['colors'];
type VolumeChartProps = { points: VolumePoint[]; onSelect: (point: VolumePoint) => void; onInteractionEnd: () => void; colors: AppColors };

function VolumeChart({ points, onSelect, onInteractionEnd, colors }: VolumeChartProps) {
	return <View style={styles.chart}>
		{Platform.OS === 'web'
			? <WebLineGraph points={points} onSelect={onSelect} onInteractionEnd={onInteractionEnd} colors={colors} />
			: <NativeLineGraph points={points} onSelect={onSelect} onInteractionEnd={onInteractionEnd} colors={colors} />}
	</View>;
}

function CompactSelectionDot({ isActive, color, circleX, circleY }: SelectionDotProps) {
	const opacity = useDerivedValue(() => (isActive.value ? 1 : 0));
	return <Circle cx={circleX} cy={circleY} r={4} color={color} opacity={opacity} />;
}

function NativeLineGraph({ points, onSelect, onInteractionEnd, colors }: VolumeChartProps) {
	const graphPoints = points.map((point) => ({ value: point.volume, date: point.date }));
	const max = Math.max(...points.map((point) => point.volume), 1);
	const range = { x: { min: graphPoints[0].date, max: graphPoints[graphPoints.length - 1].date }, y: { min: 0, max: max * 1.1 } };
	return <View style={[styles.graphArea, { backgroundColor: colors.background }]}>
		<LineGraph points={graphPoints} range={range} animated color={colors.text} lineThickness={2} style={styles.lineGraph}
			enablePanGesture panGestureDelay={300} verticalPadding={6} horizontalPadding={6} SelectionDot={CompactSelectionDot}
			onPointSelected={(point) => onSelect({ volume: point.value, date: point.date })} onGestureEnd={onInteractionEnd} />
	</View>;
}

function WebLineGraph({ points, onSelect, onInteractionEnd, colors }: VolumeChartProps) {
	const [size, setSize] = useState({ width: 0, height: 88 });
	const max = Math.max(...points.map((point) => point.volume), 1);
	const padding = 10;
	const x = (index: number) => padding + index * ((size.width - padding * 2) / Math.max(points.length - 1, 1));
	const y = (value: number) => size.height - padding - (value / (max * 1.1)) * (size.height - padding * 2);
	const linePoints = points.map((point, index) => `${x(index)},${y(point.volume)}`).join(' ');
	function selectAtPosition(position: number) {
		const graphWidth = Math.max(size.width - padding * 2, 1);
		const index = Math.max(0, Math.min(points.length - 1, Math.round(((position - padding) / graphWidth) * (points.length - 1))));
		onSelect(points[index]);
	}
	return <Pressable style={[styles.graphArea, { backgroundColor: colors.background }]} delayLongPress={300} onLongPress={(event) => selectAtPosition(event.nativeEvent.locationX)} onPressOut={onInteractionEnd} onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}>
		{size.width > 0 && <Svg viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMinYMin meet" style={styles.lineGraph}>
			{[18, 47, 76].map((lineY) => <Line key={lineY} x1="0" x2={size.width} y1={lineY} y2={lineY} stroke={colors.surfaceStrong} strokeWidth="1" />)}
			<Polyline points={linePoints} fill="none" stroke={colors.text} strokeWidth="2" strokeLinejoin="round" />
		</Svg>}
	</Pressable>;
}

function MonthActivity({ visits, colors }: { visits: WorkoutVisitSummary[]; colors: AppColors }) {
	const [workoutPicker, setWorkoutPicker] = useState<{ date: Date; visits: WorkoutVisitSummary[] } | null>(null);
	const month = new Date();
	const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
	const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
	const gridStart = new Date(firstDay);
	gridStart.setDate(firstDay.getDate() - firstDay.getDay());
	const gridEnd = new Date(lastDay);
	gridEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()));
	const visitsByDate = visits.reduce((days, visit) => {
		const date = visit.workout.endedAt ?? visit.workout.createdAt;
		const key = dateKey(date);
		const day = days.get(key) ?? { sets: 0, visits: [] as WorkoutVisitSummary[] };
		day.sets += visit.sets;
		day.visits.push(visit);
		days.set(key, day);
		return days;
	}, new Map<string, { sets: number; visits: WorkoutVisitSummary[] }>());
	const dates: Date[] = [];
	for (let day = new Date(gridStart); day <= gridEnd; day.setDate(day.getDate() + 1)) dates.push(new Date(day));
	const rows = Array.from({ length: dates.length / 7 }, (_, index) => dates.slice(index * 7, index * 7 + 7));
	const activeCount = dates.filter((day) => day.getMonth() === month.getMonth() && (visitsByDate.get(dateKey(day))?.sets ?? 0) > 0).length;
	const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(month);
	return <View style={styles.section}>
		<View style={styles.sectionHeader}><Text style={[styles.activityTitle, { color: colors.text }]}>{monthLabel} activity</Text><Text style={[styles.sectionNote, { color: colors.subtleText }]}>{activeCount} DAYS</Text></View>
		<View style={styles.weekdayLabels}>{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => <Text key={`${label}-${index}`} style={[styles.weekdayLabel, { color: colors.subtleText }]}>{label}</Text>)}</View>
		<View style={styles.calendarGrid}>{rows.map((week, rowIndex) => <View key={rowIndex} style={styles.calendarRow}>{week.map((day) => {
			const isThisMonth = day.getMonth() === month.getMonth();
			const dayVisits = visitsByDate.get(dateKey(day));
			const sets = dayVisits?.sets ?? 0;
			const selectDay = () => {
				if (!dayVisits) return;
				if (dayVisits.visits.length === 1) router.push({ pathname: '/history-detail', params: { workoutId: dayVisits.visits[0].workout.id } });
				else setWorkoutPicker({ date: day, visits: dayVisits.visits });
			};
			return <Pressable key={dateKey(day)} disabled={!isThisMonth || !dayVisits} onPress={selectDay} style={({ pressed }) => [styles.calendarCell, !isThisMonth && styles.calendarCellOutside, { backgroundColor: activityColor(sets, colors) }, pressed && styles.calendarCellPressed]} accessibilityRole={isThisMonth && dayVisits ? 'button' : undefined} accessibilityLabel={isThisMonth && dayVisits ? `${dayVisits.visits.length} workout${dayVisits.visits.length === 1 ? '' : 's'} on ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(day)}` : undefined} />;
		})}</View>)}</View>
		<Modal visible={workoutPicker !== null} transparent animationType="none" onRequestClose={() => setWorkoutPicker(null)}>
			<View style={styles.sheetOverlay}>
				<Animated.View entering={FadeIn.duration(180)} style={styles.sheetBackdrop}>
					<Pressable onPress={() => setWorkoutPicker(null)} style={StyleSheet.absoluteFill} accessibilityLabel="Close workout picker" />
				</Animated.View>
				<Animated.View entering={SlideInDown.duration(280)} style={[styles.workoutSheet, { backgroundColor: colors.background }]}>
					<View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
					<Text style={[styles.sheetTitle, { color: colors.text }]}>Choose a workout</Text>
					{workoutPicker && <><Text style={[styles.sheetDate, { color: colors.mutedText }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(workoutPicker.date)}</Text>
						{workoutPicker.visits.map((visit) => <Pressable key={visit.workout.id} onPress={() => { setWorkoutPicker(null); router.push({ pathname: '/history-detail', params: { workoutId: visit.workout.id } }); }} style={({ pressed }) => [styles.workoutOption, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`View ${visit.workout.split} workout`}>
							<View><Text style={[styles.workoutOptionTitle, { color: colors.text }]}>{visit.workout.split[0].toUpperCase() + visit.workout.split.slice(1)} workout</Text><Text style={[styles.workoutOptionMeta, { color: colors.mutedText }]}>{visit.exercises} exercises  ·  {visit.sets} sets  ·  {visit.volume ? `${formatVolume(visit.volume)} lb` : `${visit.reps} reps`}</Text></View>
						</Pressable>)}</>}
				</Animated.View>
			</View>
		</Modal>
	</View>;
}

function FriendPersonalRecords({ records, friendCount }: { records: FriendPersonalRecord[]; friendCount: number | null }) {
	const { colors } = useAppearance();
	const exercises = new Map(getExercises().map((exercise) => [exercise.id, exercise.name]));
	if (!records.length && friendCount !== 0) return null;
	if (friendCount === 0) return <Pressable onPress={() => router.push('/friends')} style={({ pressed }) => [styles.addFriendsCard, { backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Add friends to see updates">
		<Text style={[styles.addFriendsText, { color: colors.text }]}>Add friends to see updates</Text>
	</Pressable>;
	return <View style={styles.friendRecords}>
		<Text style={[styles.friendRecordsLabel, { color: colors.mutedText }]}>FRIENDS’ RECENT PRS</Text>
		<View style={[styles.friendRecordList, { borderColor: colors.surfaceStrong }]}>{records.map((record) => {
			const initials = record.displayName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'L';
			return <View key={record.id} style={[styles.friendRecord, { borderColor: colors.surfaceStrong }]}>
				{record.imageUrl ? <Image source={{ uri: record.imageUrl }} style={styles.friendAvatar} accessibilityLabel={`${record.displayName}'s profile photo`} /> : <View style={[styles.friendAvatar, styles.friendInitials, { backgroundColor: colors.surfaceStrong }]}><Text style={[styles.friendInitialsText, { color: colors.text }]}>{initials}</Text></View>}
				<View style={styles.friendRecordCopy}><Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>{record.displayName}</Text><Text style={[styles.friendExercise, { color: colors.mutedText }]} numberOfLines={1}>{exercises.get(record.exerciseId) ?? 'Exercise'} · {record.reps} reps</Text></View>
				<Text style={[styles.friendWeight, { color: colors.text }]}>{record.weight} <Text style={styles.friendWeightUnit}>LB</Text></Text>
			</View>;
		})}</View>
	</View>;
}

function activityColor(sets: number, colors: AppColors) {
	if (sets === 0) return colors.surfaceStrong;
	if (sets === 1) return `${colors.accent}40`;
	if (sets === 2) return `${colors.accent}80`;
	if (sets <= 4) return colors.accent;
	return `${colors.accent}CC`;
}

const styles = StyleSheet.create({
	safeArea: { flex: 1, backgroundColor: '#F9F9F7' },
	header: { height: 72, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2 },
	content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
	section: { paddingBottom: 21 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }, sectionNote: { fontSize: 9, fontWeight: '800', letterSpacing: .7, color: '#95998F' },
	splitTabs: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingHorizontal: 4 }, splitTab: { minWidth: 55, alignItems: 'center', paddingVertical: 8 }, splitTabText: { fontSize: 12, fontWeight: '900', letterSpacing: .1, color: '#858980' }, splitTabTextActive: { color: '#1A1B16', textDecorationLine: 'underline', textDecorationColor: '#FFCC4A', textDecorationStyle: 'solid' }, trendSummary: { marginBottom: 5 }, trendRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }, trendValue: { fontSize: 29, lineHeight: 33, fontWeight: '900', letterSpacing: -1.45, color: '#1B1C17' }, trendChange: { flexShrink: 1, fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: -.1, textAlign: 'right' }, trendContext: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: -.1 }, activityTitle: { fontSize: 25, lineHeight: 29, fontWeight: '900', letterSpacing: -1.2, color: '#1B1C17' }, emptyTrend: { fontSize: 10, fontWeight: '900', letterSpacing: .8, color: '#969A91', paddingVertical: 38, textAlign: 'center' }, chart: { height: 88 }, graphArea: { height: 88, position: 'relative', backgroundColor: '#F9F9F7' }, lineGraph: { ...StyleSheet.absoluteFill }, unit: { fontSize: 10, letterSpacing: 0 },
	weekdayLabels: { flexDirection: 'row', gap: 6, marginBottom: 6 }, weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 8, fontWeight: '900', letterSpacing: .35, color: '#969A91' }, calendarGrid: { gap: 6 }, calendarRow: { flexDirection: 'row', gap: 6 }, calendarCell: { flex: 1, aspectRatio: 1, borderRadius: 4 }, calendarCellOutside: { opacity: 0 }, calendarCellPressed: { opacity: .72, transform: [{ scale: .93 }] },
	sheetOverlay: { flex: 1, justifyContent: 'flex-end' }, sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.38)' }, workoutSheet: { minHeight: 250, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 28, borderTopLeftRadius: 25, borderTopRightRadius: 25 }, sheetHandle: { width: 37, height: 4, borderRadius: 2, alignSelf: 'center' }, sheetTitle: { marginTop: 22, fontSize: 22, fontWeight: '900', letterSpacing: -.8 }, sheetDate: { marginTop: 3, marginBottom: 13, fontSize: 13, fontWeight: '700' }, workoutOption: { minHeight: 68, borderTopWidth: 1, justifyContent: 'center' }, workoutOptionTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -.4 }, workoutOptionMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', letterSpacing: -.1 },
	pressed: { opacity: .78, transform: [{ scale: .985 }] },
	friendRecords: { marginTop: 4 }, friendRecordsLabel: { marginBottom: 10, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, friendRecordList: { borderTopWidth: 1 }, friendRecord: { minHeight: 62, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }, friendAvatar: { width: 36, height: 36, borderRadius: 12 }, friendInitials: { alignItems: 'center', justifyContent: 'center' }, friendInitialsText: { fontSize: 12, fontWeight: '900' }, friendRecordCopy: { flex: 1, minWidth: 0 }, friendName: { fontSize: 15, fontWeight: '900', letterSpacing: -.3 }, friendExercise: { marginTop: 1, fontSize: 11, fontWeight: '700' }, friendWeight: { fontSize: 16, fontWeight: '900', letterSpacing: -.4 }, friendWeightUnit: { fontSize: 9, letterSpacing: 0 },
	addFriendsCard: { marginTop: 4, minHeight: 72, paddingHorizontal: 18, borderRadius: 18, justifyContent: 'center' }, addFriendsText: { fontSize: 16, fontWeight: '900', letterSpacing: -.4 },
});
