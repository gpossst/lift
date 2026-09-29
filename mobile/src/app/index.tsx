import { ui } from '@/styles/primitives';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle } from '@shopify/react-native-skia';
import { Clock } from 'react-native-feather';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LineGraph, type SelectionDotProps } from 'react-native-graph';
import Animated, { FadeIn, runOnJS, SlideInDown, useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Line, Polyline } from 'react-native-svg';
import { closeExpiredWorkouts, getActiveWorkout, getExercises, getWorkoutHistory, getWorkoutSplitTrends, getWorkoutVisitExerciseDetails, getWorkoutVisits, type WorkoutVisitSummary } from '@/db';
import { useAppearance } from '@/components/appearance-provider';
import { syncWorkoutData } from '@/lib/cloud-sync';
import type { FriendPersonalRecord } from '@/lib/friends';
import { preloadFriendsPage } from '@/lib/friends-page';
import { demoWorkoutIdPrefix } from '@/db/demo-data';
import { recentPersonalRecords, type PersonalRecord } from '@/lib/home-notifications';
import { workoutSplitLabel } from '@/lib/workout-split-label';
import { getReturnPlan } from '@/lib/return-plan';
import type { RecommendationPreferences } from '@/lib/profile';
import { authClient } from '@/lib/auth-client';

const goalGold = '#FFD700';
const calendarGap = 6;

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
	const { data: session } = authClient.useSession();
	const userId = session?.user.id;
	const [expiredWorkoutCount] = useState(() => closeExpiredWorkouts());
	const [now] = useState(() => Date.now());
	const activeWorkout = getActiveWorkout();
	const visits = getWorkoutVisits();
	const trends = getWorkoutSplitTrends(8);
	const [selectedSplit, setSelectedSplit] = useState<'ALL' | 'PUSH' | 'PULL' | 'LEGS'>('ALL');
	const [selectedPoint, setSelectedPoint] = useState<VolumePoint | null>(null);
	const [friendRecords, setFriendRecords] = useState<FriendPersonalRecord[]>([]);
	const [ownRecords, setOwnRecords] = useState<PersonalRecord[]>([]);
	const [friendCount, setFriendCount] = useState<number | null>(null);
	const [returnPlan, setReturnPlan] = useState<string | null>(null);
	const [trainingDays, setTrainingDays] = useState<number | null>(null);
	const [profilePreferences, setProfilePreferences] = useState<RecommendationPreferences | null>(null);
	const [notificationIndex, setNotificationIndex] = useState(0);
	const exerciseNames = new Map(getExercises().map((exercise) => [exercise.id, exercise.name]));
	const recentEvents = [
		...ownRecords.map((record) => ({ key: `own:${record.exerciseId}:${record.completedAt.getTime()}`, kicker: 'NEW PERSONAL RECORD', title: `You hit ${record.weight} lb on ${record.name}`, time: record.completedAt.getTime(), onPress: () => router.push({ pathname: '/stats/progress', params: { exerciseId: record.exerciseId } }) })),
		...friendRecords.filter((record) => record.completedAt * 1000 >= now - 14 * 86_400_000).map((record) => ({ key: `friend:${record.id}:${record.exerciseId}:${record.completedAt}`, kicker: 'FRIEND PERSONAL RECORD', title: `${record.displayName} hit ${record.weight} lb on ${exerciseNames.get(record.exerciseId) ?? 'an exercise'}`, time: record.completedAt * 1000, onPress: () => router.push('/friends') })),
	].sort((a, b) => b.time - a.time).slice(0, 3);
	const notifications = [
		...(returnPlan ? [{ key: 'plan', kicker: 'YOUR NEXT WORKOUT', title: new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${returnPlan}T12:00:00`)), onPress: () => router.push('/start'), accent: true }] : []),
		...recentEvents.map((event) => ({ ...event, accent: false })),
		...(friendCount === 0 ? [{ key: 'friends', kicker: 'FRIENDS', title: 'Add friends to see updates', onPress: () => router.push('/friends'), accent: false }] : []),
		...(profilePreferences && profilePreferences.weightLb == null && profilePreferences.heightInches == null ? [{ key: 'measurements', kicker: 'BODY MEASUREMENTS', title: 'Add your height and weight', onPress: () => router.push('/settings/profile'), accent: false }] : []),
		...(profilePreferences && !profilePreferences.favoriteExerciseIds?.length ? [{ key: 'favorites', kicker: 'FAVORITE EXERCISES', title: 'Pick the exercises you love', onPress: () => router.push('/settings/workouts'), accent: false }] : []),
	];
	const notificationCount = notifications.length;
	const activeNotificationIndex = notificationCount > 1 ? notificationIndex % notificationCount : 0;
	const notificationProgress = useSharedValue(0);
	const notificationWidth = useSharedValue(0);
	useEffect(() => { notificationProgress.value = withTiming(activeNotificationIndex, { duration: 500 }); }, [activeNotificationIndex, notificationProgress]);
	const notificationTrackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -notificationProgress.value * notificationWidth.value }] }));
	const notificationSwipe = Gesture.Pan().activeOffsetX([-12, 12]).failOffsetY([-12, 12])
		.onUpdate(({ translationX }) => {
			if (notificationCount < 2 || notificationWidth.value <= 0) return;
			notificationProgress.value = Math.max(0, Math.min(notificationCount - 1, activeNotificationIndex - translationX / notificationWidth.value));
		})
		.onEnd(({ translationX }) => {
			if (notificationCount < 2) return;
			if (Math.abs(translationX) < 40) {
				notificationProgress.value = withTiming(activeNotificationIndex, { duration: 180 });
				return;
			}
			runOnJS(setNotificationIndex)((activeNotificationIndex + (translationX < 0 ? 1 : -1) + notificationCount) % notificationCount);
		});
	useFocusEffect(useCallback(() => {
		if (notificationCount < 2) return;
		const timer = setInterval(() => setNotificationIndex((index) => index + 1), 5000);
		return () => clearInterval(timer);
	}, [notificationCount]));
	useFocusEffect(useCallback(() => { setReturnPlan(session?.user.id ? getReturnPlan(session.user.id) : null); }, [session]));
	useFocusEffect(useCallback(() => {
		if (!userId) return;
		let active = true;
		void preloadFriendsPage(userId)
			.then(({ profile, friends, records }) => {
				if (!active) return;
				const days = profile.recommendationPreferences?.trainingDays;
				if (typeof days === 'number' && Number.isFinite(days)) setTrainingDays(days);
				setProfilePreferences(profile.recommendationPreferences ?? {});
				setFriendRecords(records);
				setFriendCount(friends?.count ?? 0);
			})
			.catch(() => undefined);
		return () => { active = false; };
	}, [userId]));
	useFocusEffect(useCallback(() => {
		const since = Date.now() - 14 * 86_400_000;
		const exerciseIds = new Set(getWorkoutVisits().filter(({ workout }) => !workout.id.startsWith(demoWorkoutIdPrefix) && (workout.endedAt ?? workout.createdAt).getTime() >= since).flatMap(({ workout }) => getWorkoutVisitExerciseDetails(workout.id).map((exercise) => exercise.id)));
		const names = new Map(getExercises().map((exercise) => [exercise.id, exercise.name]));
		setOwnRecords(recentPersonalRecords([...exerciseIds].map((exerciseId) => ({ exerciseId, name: names.get(exerciseId) ?? 'Exercise', sets: getWorkoutHistory(exerciseId).filter((set) => !set.workoutId.startsWith(demoWorkoutIdPrefix)) })), since));
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
	return <SafeAreaView edges={['top', 'right', 'left']} style={[ui.screen, { backgroundColor: colors.background }]}>
		<View style={[ui.header, { backgroundColor: colors.background }]}><Text style={[ui.title, { color: colors.text }]}>Home</Text></View>
		<View style={styles.content}>
			{notificationCount > 0 && <View style={styles.notificationArea}>
				<GestureDetector gesture={notificationSwipe}><View collapsable={false} style={styles.notificationFrame} onLayout={({ nativeEvent: { layout } }) => { notificationWidth.value = layout.width; }}><Animated.View style={[styles.notificationTrack, { width: `${notificationCount * 100}%` }, notificationTrackStyle]}>
					{notifications.map((notification, index) => <View key={notification.key} style={[styles.notificationPage, { width: `${100 / notificationCount}%` }]} pointerEvents={activeNotificationIndex === index ? 'auto' : 'none'} accessibilityElementsHidden={activeNotificationIndex !== index} importantForAccessibility={activeNotificationIndex === index ? 'auto' : 'no-hide-descendants'}><Pressable onPress={notification.onPress} style={({ pressed }) => [styles.notification, { backgroundColor: notification.accent ? colors.accent : colors.surface }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`${notification.kicker}: ${notification.title}`}><View style={styles.notificationCopy}><Text style={[styles.notificationKicker, { color: notification.accent ? colors.accentText : colors.mutedText }]}>{notification.kicker}</Text><Text style={[styles.notificationText, { color: notification.accent ? colors.accentText : colors.text }]} numberOfLines={1}>{notification.title}</Text></View><Text style={[styles.notificationArrow, { color: notification.accent ? colors.accentText : colors.text }]}>›</Text></Pressable></View>)}
				</Animated.View></View></GestureDetector>
				{notificationCount > 1 && <View style={styles.notificationDots}>{notifications.map((notification, index) => <Pressable key={notification.key} onPress={() => setNotificationIndex(index)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Show ${notification.kicker.toLowerCase()} notification`} accessibilityState={{ selected: activeNotificationIndex === index }}><View style={[styles.notificationDot, { width: activeNotificationIndex === index ? 12 : 6, backgroundColor: activeNotificationIndex === index ? colors.accent : colors.subtleText }]} /></Pressable>)}</View>}
			</View>}
				<View style={styles.section}>
					{activeTrend ? <>
						<View style={styles.trendSummary}><View style={styles.trendRow}><Text style={[styles.trendValue, { color: colors.text }]}>{formatVolume(displayedPoint?.volume ?? 0)} <Text style={styles.unit}>LB</Text></Text>{trendChange && <Text style={[styles.trendChange, { color: colors.mutedText }]}>{trendChange}</Text>}</View><Text style={[styles.trendContext, { color: colors.mutedText }]}>{trendContext}</Text></View>
						<VolumeChart points={chartPoints} onSelect={setSelectedPoint} onInteractionEnd={() => setSelectedPoint(null)} colors={colors} />
						<View style={styles.splitTabs}>
							{trends.map((trend) => <Pressable key={trend.split} onPress={() => { setSelectedSplit(trend.split); setSelectedPoint(null); }} style={styles.splitTab}><Text style={[styles.splitTabText, { color: colors.subtleText }, activeTrend.split === trend.split && { color: colors.text, textDecorationColor: colors.accent }]}>{trend.split === 'ALL' ? 'ALL' : trend.split[0] + trend.split.slice(1).toLowerCase()}</Text></Pressable>)}
						</View>
					</> : <Text style={[styles.emptyTrend, { color: colors.subtleText }]}>LOG A WORKOUT TO SEE YOUR TREND</Text>}
				</View>

				<MonthActivity visits={visits} colors={colors} trainingDays={trainingDays} />
		</View>
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
	const [size, setSize] = useState({ width: 0, height: 72 });
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
			{[14, 36, 58].map((lineY) => <Line key={lineY} x1="0" x2={size.width} y1={lineY} y2={lineY} stroke={colors.surfaceStrong} strokeWidth="1" />)}
			<Polyline points={linePoints} fill="none" stroke={colors.text} strokeWidth="2" strokeLinejoin="round" />
		</Svg>}
	</Pressable>;
}

function MonthActivity({ visits, colors, trainingDays }: { visits: WorkoutVisitSummary[]; colors: AppColors; trainingDays: number | null }) {
	const [workoutPicker, setWorkoutPicker] = useState<{ date: Date; visits: WorkoutVisitSummary[] } | null>(null);
	const [gridWidth, setGridWidth] = useState(0);
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
	const emptyCells = 6 - lastDay.getDay();
	const cellWidth = gridWidth ? (gridWidth - 6 * calendarGap) / 7 : 0;
	const activeCount = dates.filter((day) => day.getMonth() === month.getMonth() && (visitsByDate.get(dateKey(day))?.sets ?? 0) > 0).length;
	const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(month);
	const historyButton = (span: number) => <Pressable onPress={() => router.push('/history')} style={({ pressed }) => [styles.calendarHistory, span === 7 ? { flex: 1 } : { position: 'absolute', right: 0, top: 0, bottom: 0, width: span * cellWidth + (span - 1) * calendarGap }, { backgroundColor: colors.surface }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel="View full workout history">
		<Clock width={18} height={18} color={colors.text} strokeWidth={2.2} />
		{span > 1 && <Text style={[styles.calendarHistoryText, { color: colors.text }]} numberOfLines={1}>{span === 7 ? 'View full workout history' : 'History'}</Text>}
	</Pressable>;
	return <View style={[styles.section, styles.monthSection]}>
		<View style={styles.sectionHeader}><Text style={[styles.activityTitle, { color: colors.text }]}>{monthLabel} activity</Text><Text style={[styles.sectionNote, { color: colors.subtleText }]}>{activeCount} DAYS</Text></View>
		<View style={[styles.calendarGrid, !gridWidth && { opacity: 0 }]} onLayout={({ nativeEvent: { layout } }) => setGridWidth((width) => width === layout.width ? width : layout.width)}>{rows.map((week, rowIndex) => {
			const goalMet = trainingDays != null && trainingDays > 0 && week.filter((day) => (visitsByDate.get(dateKey(day))?.sets ?? 0) > 0).length >= trainingDays;
			return <View key={rowIndex} style={styles.calendarRow}>{week.map((day) => {
				if (rowIndex === rows.length - 1 && day > lastDay) return null;
				const isThisMonth = day.getMonth() === month.getMonth();
				const dayVisits = visitsByDate.get(dateKey(day));
				const sets = dayVisits?.sets ?? 0;
				const selectDay = () => {
					if (!dayVisits) return;
					if (dayVisits.visits.length === 1) router.push({ pathname: '/history-detail', params: { workoutId: dayVisits.visits[0].workout.id } });
					else setWorkoutPicker({ date: day, visits: dayVisits.visits });
				};
				return <Pressable key={dateKey(day)} disabled={!isThisMonth || !dayVisits} onPress={selectDay} style={({ pressed }) => [styles.calendarCell, { width: cellWidth }, !isThisMonth && styles.calendarCellOutside, { backgroundColor: goalMet && sets > 0 ? goalGold : activityColor(sets, colors) }, pressed && styles.calendarCellPressed]} accessibilityRole={isThisMonth && dayVisits ? 'button' : undefined} accessibilityLabel={isThisMonth && dayVisits ? `${dayVisits.visits.length} workout${dayVisits.visits.length === 1 ? '' : 's'} on ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(day)}${goalMet ? ', weekly goal met' : ''}` : undefined}>
					{isThisMonth && <Text style={[styles.calendarDay, { color: sets > 0 && (goalMet || sets >= 3) ? colors.accentText : colors.text }]}>{day.getDate()}</Text>}
				</Pressable>;
			})}{rowIndex === rows.length - 1 && emptyCells > 0 && gridWidth > 0 && historyButton(emptyCells)}</View>;
		})}{emptyCells === 0 && <View style={styles.calendarRow}>{historyButton(7)}</View>}</View>
		<Modal visible={workoutPicker !== null} transparent animationType="none" onRequestClose={() => setWorkoutPicker(null)}>
			<View style={styles.sheetOverlay}>
				<Animated.View entering={FadeIn.duration(180)} style={styles.sheetBackdrop}>
					<Pressable onPress={() => setWorkoutPicker(null)} style={StyleSheet.absoluteFill} accessibilityLabel="Close workout picker" />
				</Animated.View>
				<Animated.View entering={SlideInDown.duration(280)} style={[styles.workoutSheet, { backgroundColor: colors.background }]}>
					<View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
					<Text style={[styles.sheetTitle, { color: colors.text }]}>Choose a workout</Text>
					{workoutPicker && <><Text style={[styles.sheetDate, { color: colors.mutedText }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(workoutPicker.date)}</Text>
						{workoutPicker.visits.map((visit) => <Pressable key={visit.workout.id} onPress={() => { setWorkoutPicker(null); router.push({ pathname: '/history-detail', params: { workoutId: visit.workout.id } }); }} style={({ pressed }) => [styles.workoutOption, { borderColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`View ${workoutSplitLabel(visit.workout.split)} workout`}>
							<View><Text style={[styles.workoutOptionTitle, { color: colors.text }]}>{workoutSplitLabel(visit.workout.split)} workout</Text><Text style={[styles.workoutOptionMeta, { color: colors.mutedText }]}>{visit.exercises} exercises  ·  {visit.sets} sets  ·  {visit.volume ? `${formatVolume(visit.volume)} lb` : `${visit.reps} reps`}</Text></View>
						</Pressable>)}</>}
				</Animated.View>
			</View>
		</Modal>
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
	content: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
	section: { paddingBottom: 12 }, monthSection: { flex: 1, minHeight: 0 }, notificationArea: { marginBottom: 10 }, notificationFrame: { height: 60, borderRadius: 18, overflow: 'hidden' }, notificationTrack: { height: 60, flexDirection: 'row' }, notificationPage: { height: 60 }, notification: { height: 60, paddingHorizontal: 18, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, notificationCopy: { flex: 1, minWidth: 0 }, notificationKicker: { fontSize: 9, fontWeight: '900', letterSpacing: .9 }, notificationText: { marginTop: 3, fontSize: 17, fontWeight: '900', letterSpacing: -.5 }, notificationArrow: { fontSize: 28, fontWeight: '500', marginLeft: 8 }, notificationDots: { flexDirection: 'row', alignSelf: 'center', gap: 5, marginTop: 10 }, notificationDot: { width: 6, height: 6, borderRadius: 3 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }, sectionNote: { fontSize: 9, fontWeight: '800', letterSpacing: .7, color: '#95998F' },
	splitTabs: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingHorizontal: 4 }, splitTab: { minWidth: 55, alignItems: 'center', paddingVertical: 8 }, splitTabText: { fontSize: 12, fontWeight: '900', letterSpacing: .1, color: '#858980' }, splitTabTextActive: { color: '#1A1B16', textDecorationLine: 'underline', textDecorationColor: '#FFCC4A', textDecorationStyle: 'solid' }, trendSummary: { marginBottom: 5 }, trendRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }, trendValue: { fontSize: 29, lineHeight: 33, fontWeight: '900', letterSpacing: -1.45, color: '#1B1C17' }, trendChange: { flexShrink: 1, fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: -.1, textAlign: 'right' }, trendContext: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: -.1 }, activityTitle: { fontSize: 25, lineHeight: 29, fontWeight: '900', letterSpacing: -1.2, color: '#1B1C17' }, emptyTrend: { fontSize: 10, fontWeight: '900', letterSpacing: .8, color: '#969A91', paddingVertical: 26, textAlign: 'center' }, chart: { height: 72 }, graphArea: { height: 72, position: 'relative', backgroundColor: '#F9F9F7' }, lineGraph: { ...StyleSheet.absoluteFill }, unit: { fontSize: 10, letterSpacing: 0 },
	calendarGrid: { flex: 1, minHeight: 0, gap: calendarGap }, calendarRow: { flex: 1, minHeight: 0, flexDirection: 'row', gap: calendarGap }, calendarCell: { borderRadius: 4, paddingTop: 3, paddingLeft: 4 }, calendarDay: { fontSize: 10, lineHeight: 12, fontWeight: '700', includeFontPadding: false }, calendarCellOutside: { opacity: 0 }, calendarCellPressed: { opacity: .72, transform: [{ scale: .93 }] }, calendarHistory: { minWidth: 0, borderRadius: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, calendarHistoryText: { fontSize: 12, fontWeight: '800' },
	sheetOverlay: { flex: 1, justifyContent: 'flex-end' }, sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.38)' }, workoutSheet: { minHeight: 250, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 28, borderTopLeftRadius: 25, borderTopRightRadius: 25 }, sheetHandle: { width: 37, height: 4, borderRadius: 2, alignSelf: 'center' }, sheetTitle: { marginTop: 22, fontSize: 22, fontWeight: '900', letterSpacing: -.8 }, sheetDate: { marginTop: 3, marginBottom: 13, fontSize: 13, fontWeight: '700' }, workoutOption: { minHeight: 68, borderTopWidth: 1, justifyContent: 'center' }, workoutOptionTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -.4 }, workoutOptionMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', letterSpacing: -.1 },
});
