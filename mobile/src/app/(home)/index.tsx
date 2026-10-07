import { ui } from '@/styles/primitives';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated as NativeAnimated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle } from '@shopify/react-native-skia';
import { Award, ChevronRight, Clock } from 'react-native-feather';
import LottieView from 'lottie-react-native';
import { LineGraph, type SelectionDotProps } from 'react-native-graph';
import Animated, { FadeIn, FadeInDown, FadeOut, ZoomIn, interpolate, SlideInDown, SlideOutDown, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSheetPresence } from '@/hooks/use-sheet-presence';
import Svg, { Defs, Line, LinearGradient, Polygon, Polyline, Stop } from 'react-native-svg';
import { closeExpiredWorkouts, getActiveWorkout, getCompletedWorkoutExerciseDetails, getCustomSplits, getExercises, getWorkoutHistories, getWorkoutSplitTrends, getWorkoutVisitExerciseDetails, getWorkoutVisits, type WorkoutVisitSummary } from '@/db';
import { useAppearance } from '@/components/appearance-provider';
import { EmptyArt } from '@/components/empty-art';
import { SplitRoutinePrompt } from '@/components/split-routine-prompt';
import { SectionHeader } from '@/components/overview-parts';
import { SegmentedPicker } from '@/components/segmented-picker';
import { weekStreak } from '@/lib/training-overview';
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
const contentPadding = 20;
const notificationGap = 10;
const notificationPeek = 44;
const exerciseNames = new Map(getExercises().map((exercise) => [exercise.id, exercise.name]));

function formatVolume(volume: number) {
	if (volume >= 10_000) return `${Math.round(volume / 1000)}k`;
	if (volume >= 1_000) return `${(volume / 1000).toFixed(1)}k`;
	return String(volume);
}

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function weekLabel(date: Date) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date); }
function formatWeekOf(date: Date) { return `WEEK OF ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date).toUpperCase()}`; }

type VolumePoint = { volume: number; date: Date };

function loadHomeData() {
	const activeWorkout = getActiveWorkout();
	return {
		activeWorkout,
		activeExercises: activeWorkout ? getWorkoutVisitExerciseDetails(activeWorkout.id) : [],
		visits: getWorkoutVisits(),
		trends: getWorkoutSplitTrends(8),
		customSplits: getCustomSplits(),
	};
}

/** Average session volume per week for one custom split, bucketed like getWorkoutSplitTrends. */
function customSplitTrend(split: string, visits: WorkoutVisitSummary[], weekStarts: string[]) {
	const start = new Date();
	start.setHours(0, 0, 0, 0);
	start.setDate(start.getDate() - (weekStarts.length * 7 - 1));
	const totals = weekStarts.map(() => ({ volume: 0, sessions: 0 }));
	for (const visit of visits) {
		const index = Math.floor(((visit.workout.endedAt ?? visit.workout.createdAt).getTime() - start.getTime()) / 86_400_000 / 7);
		if (visit.workout.split !== split || !totals[index]) continue;
		totals[index].volume += visit.volume;
		totals[index].sessions += 1;
	}
	return { split, points: weekStarts.map((weekStart, index) => ({ weekStart, volume: totals[index].volume / (totals[index].sessions || 1) })) };
}

export default function HomeScreen() {
	const { colors, useCustomSplits } = useAppearance();
	const { data: session } = authClient.useSession();
	const userId = session?.user.id;
	const [expiredWorkoutCount] = useState(() => closeExpiredWorkouts());
	const [now] = useState(() => Date.now());
	const [{ activeWorkout, activeExercises, visits, trends: defaultTrends, customSplits }, setHomeData] = useState(loadHomeData);
	const firstHomeFocus = useRef(true);
	const [selectedSplit, setSelectedSplit] = useState('ALL');
	const [selectedPoint, setSelectedPoint] = useState<VolumePoint | null>(null);
	const [friendRecords, setFriendRecords] = useState<FriendPersonalRecord[]>([]);
	const [ownRecords, setOwnRecords] = useState<PersonalRecord[]>([]);
	const [friendCount, setFriendCount] = useState<number | null>(null);
	const [returnPlan, setReturnPlan] = useState<string | null>(null);
	const [trainingDays, setTrainingDays] = useState<number | null>(null);
	const [profilePreferences, setProfilePreferences] = useState<RecommendationPreferences | null>(null);
	const { width: windowWidth } = useWindowDimensions();
	const recentEvents = [
		...ownRecords.map((record) => ({ key: `own:${record.exerciseId}:${record.completedAt.getTime()}`, kicker: `NEW PR · ${record.weight} LB`, title: record.name, time: record.completedAt.getTime(), onPress: () => router.push({ pathname: '/stats/progress', params: { exerciseId: record.exerciseId } }) })),
		...friendRecords.filter((record) => record.completedAt * 1000 >= now - 14 * 86_400_000).map((record) => ({ key: `friend:${record.id}:${record.exerciseId}:${record.completedAt}`, kicker: `FRIEND PR · ${record.displayName.toUpperCase()} · ${record.weight} LB`, title: exerciseNames.get(record.exerciseId) ?? 'An exercise', time: record.completedAt * 1000, onPress: () => router.push('/friends') })),
	].sort((a, b) => b.time - a.time).slice(0, 3);
	const notifications = [
		...(returnPlan ? [{ key: 'plan', kicker: 'YOUR NEXT WORKOUT', title: new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(`${returnPlan}T12:00:00`)), onPress: () => router.push('/start'), accent: true }] : []),
		...recentEvents.map((event) => ({ ...event, accent: false, pr: true })),
		...(friendCount === 0 ? [{ key: 'friends', kicker: 'FRIENDS', title: 'Add friends to see updates', onPress: () => router.push('/friends'), accent: false }] : []),
		...(profilePreferences && profilePreferences.weightLb == null && profilePreferences.heightInches == null ? [{ key: 'measurements', kicker: 'BODY MEASUREMENTS', title: 'Add your height and weight', onPress: () => router.push('/settings/profile'), accent: false }] : []),
	];
	const activeSetCount = activeExercises.reduce((total, exercise) => total + exercise.sets.length, 0);
	const activeMeta = activeWorkout && [`Started ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(activeWorkout.createdAt)}`, ...(activeSetCount ? [`${activeExercises.length} exercise${activeExercises.length === 1 ? '' : 's'}`, `${activeSetCount} set${activeSetCount === 1 ? '' : 's'}`] : [])].join(' · ');
	// A lone card fills the row; with more, each is narrowed so the next one peeks in.
	const notificationWidth = windowWidth - contentPadding * 2 - (notifications.length > 1 ? notificationPeek : 0);
	useFocusEffect(useCallback(() => {
		if (firstHomeFocus.current) { firstHomeFocus.current = false; return; }
		setHomeData(loadHomeData());
	}, []));
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
		const details = getCompletedWorkoutExerciseDetails();
		const exerciseIds = new Set(getWorkoutVisits().filter(({ workout }) => !workout.id.startsWith(demoWorkoutIdPrefix) && (workout.endedAt ?? workout.createdAt).getTime() >= since).flatMap(({ workout }) => details.get(workout.id)?.map((exercise) => exercise.id) ?? []));
		const histories = getWorkoutHistories([...exerciseIds]);
		setOwnRecords(recentPersonalRecords([...exerciseIds].map((exerciseId) => ({ exerciseId, name: exerciseNames.get(exerciseId) ?? 'Exercise', sets: (histories.get(exerciseId) ?? []).filter((set) => !set.workoutId.startsWith(demoWorkoutIdPrefix)) })), since));
	}, []));
	useEffect(() => {
		if (!expiredWorkoutCount) return;
		void syncWorkoutData().catch(() => { /* Local timeout completion is never blocked by sync availability. */ });
	}, [expiredWorkoutCount]);

	const today = new Date(now);
	const weekDays = Array.from({ length: 7 }, (_, index) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() + index));
	const trainedVisits = visits.filter((visit) => visit.sets > 0);
	const trainedDays = new Set(trainedVisits.map(({ workout }) => dateKey(workout.endedAt ?? workout.createdAt)));
	const daysThisWeek = weekDays.filter((day) => trainedDays.has(dateKey(day))).length;
	const goal = trainingDays != null && trainingDays > 0 ? trainingDays : null;
	const streak = weekStreak(trainedVisits.map(({ workout }) => workout.endedAt ?? workout.createdAt), today);
	const allTrend = defaultTrends.find((trend) => trend.split === 'ALL');
	const trends: { split: string; points: { weekStart: string; volume: number }[] }[] = useCustomSplits && customSplits.length && allTrend
		? [allTrend, ...customSplits.map((split) => customSplitTrend(split.id, visits, allTrend.points.map((point) => point.weekStart))).filter((trend) => trend.points.some((point) => point.volume > 0))]
		: defaultTrends;
	const trendLabel = (split: string) => split === 'ALL' ? 'All' : customSplits.find((custom) => custom.id === split)?.name ?? split[0] + split.slice(1).toLowerCase();
	const activeTrend = trends.find((trend) => trend.split === selectedSplit) ?? trends[0];
	const chartPoints = activeTrend?.points.map((point) => ({ volume: point.volume, date: new Date(`${point.weekStart}T12:00:00`) }))
		?? Array.from({ length: 8 }, (_, index) => ({ volume: 0, date: new Date(now - (7 - index) * 7 * 86_400_000) }));
	const displayedPoint = selectedPoint ?? chartPoints.at(-1);
	const previousPoint = chartPoints.at(-2);
	const volumeChange = previousPoint && previousPoint.volume > 0
		? Math.round(((chartPoints.at(-1)?.volume ?? 0) - previousPoint.volume) / previousPoint.volume * 100)
		: null;
	const trendContext = selectedPoint ? formatWeekOf(selectedPoint.date) : selectedSplit === 'ALL' ? 'Weekly volume · 8 weeks' : 'Average session volume · 8 weeks';
	return <SafeAreaView edges={['top', 'right', 'left']} style={[ui.screen, { backgroundColor: colors.background }]}>
		{userId && <SplitRoutinePrompt key={userId} userId={userId} />}
		<View style={ui.header}>
			<Text style={[ui.title, { color: colors.text }]}>Home</Text>
			<Pressable onPress={() => router.push('/history')} style={({ pressed }) => [styles.historyAction, { backgroundColor: colors.surface }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel="Workout history"><Clock width={15} height={15} color={colors.text} strokeWidth={2.4} /><Text style={[styles.historyActionText, { color: colors.text }]}>History</Text></Pressable>
		</View>
		<ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
			{activeWorkout ? <ResumeCard title={`${workoutSplitLabel(activeWorkout.split)} workout`} meta={activeMeta || ''} colors={colors} onPress={() => router.navigate({ pathname: '/exercises', params: { split: activeWorkout.split, workoutId: activeWorkout.id } })} /> : notifications.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={notificationWidth + notificationGap} decelerationRate="fast" style={styles.notificationScroll} contentContainerStyle={styles.notificationRow}>
				{notifications.map((notification) => <Pressable key={notification.key} onPress={notification.onPress} style={({ pressed }) => [styles.notification, { width: notificationWidth, backgroundColor: notification.accent ? colors.accent : colors.surface }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`${notification.kicker}: ${notification.title}`}>{'pr' in notification && <Award width={22} height={22} color={goalGold} strokeWidth={2.4} />}<View style={styles.notificationCopy}><Text style={[ui.eyebrow, { color: notification.accent ? colors.accentText : colors.mutedText }]} numberOfLines={1}>{notification.kicker}</Text><Text style={[styles.notificationText, { color: notification.accent ? colors.accentText : colors.text }]} numberOfLines={2}>{notification.title}</Text></View><ChevronRight width={20} height={20} color={notification.accent ? colors.accentText : colors.mutedText} strokeWidth={2.6} /></Pressable>)}
			</ScrollView>}

			<MonthActivity visits={visits} colors={colors} goal={goal} daysThisWeek={daysThisWeek} streak={streak} />

			<SectionHeader title="Volume" />
			<View style={[styles.card, { backgroundColor: colors.surface }]}>
				{activeTrend ? <>
					<SegmentedPicker options={[...trends].sort((a, b) => Number(b.split === 'ALL') - Number(a.split === 'ALL')).map((trend) => ({ value: trend.split, label: trendLabel(trend.split), accessibilityLabel: `Show ${trendLabel(trend.split).toLowerCase()} volume` }))} selected={activeTrend.split} onSelect={(split) => { setSelectedSplit(split); setSelectedPoint(null); }} compact />
					<View style={styles.totalRow}>
						<AnimatedVolume volume={displayedPoint?.volume ?? 0} colors={colors} />
						{!selectedPoint && volumeChange !== null && <Text style={[styles.totalDelta, { color: volumeChange > 0 ? '#5194FF' : volumeChange < 0 ? '#FF5151' : colors.mutedText }]} accessibilityLabel={`${volumeChange >= 0 ? 'Up' : 'Down'} ${Math.abs(volumeChange)} percent from last week`}>{volumeChange === 0 ? '±0%' : `${volumeChange > 0 ? '▲' : '▼'} ${Math.abs(volumeChange)}%`}</Text>}
					</View>
					<Text style={[styles.totalMeta, { color: colors.mutedText }]}>{trendContext}</Text>
					<VolumeChart points={chartPoints} onSelect={setSelectedPoint} onInteractionEnd={() => setSelectedPoint(null)} colors={colors} />
					<View style={styles.axisRow}><Text style={[styles.axisLabel, { color: colors.subtleText }]}>{weekLabel(chartPoints[0].date)}</Text><Text style={[styles.axisLabel, { color: colors.subtleText }]}>This week</Text></View>
				</> : <View><EmptyArt name="chart" width={120} /><Text style={[styles.emptyCopy, { color: colors.mutedText, textAlign: 'center' }]}>Log a workout to see your volume trend.</Text></View>}
			</View>
		</ScrollView>
	</SafeAreaView>;
}

type AppColors = ReturnType<typeof useAppearance>['colors'];
type VolumeChartProps = { points: VolumePoint[]; onSelect: (point: VolumePoint) => void; onInteractionEnd: () => void; colors: AppColors };

// The whole card is the hit target; pressing it springs the card and visibly presses its Resume button.
function ResumeCard({ title, meta, colors, onPress }: { title: string; meta: string; colors: AppColors; onPress: () => void }) {
	const reduceMotion = useReducedMotion();
	const press = useSharedValue(0);
	const pulse = useSharedValue(1);
	useEffect(() => { if (!reduceMotion) pulse.value = withRepeat(withTiming(.25, { duration: 900 }), -1, true); }, [pulse, reduceMotion]);
	const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(press.value, [0, 1], [1, .995]) }] }));
	const buttonStyle = useAnimatedStyle(() => ({ opacity: interpolate(press.value, [0, 1], [1, .82]), transform: [{ scale: interpolate(press.value, [0, 1], [1, .97]) }] }));
	const dotStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
	const spring = (value: number) => { press.set(reduceMotion ? value : withSpring(value, { duration: value ? 120 : 260, dampingRatio: value ? 1 : .75 })); };
	return <Animated.View entering={FadeInDown.springify().duration(250).dampingRatio(.8).withInitialValues({ transform: [{ translateY: 6 }] })} style={[styles.resumeWrap, cardStyle]}>
		<Pressable onPress={onPress} onPressIn={() => spring(1)} onPressOut={() => spring(0)} style={[styles.resume, { backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityLabel={`Resume ${title}. ${meta}`}>
			<View style={styles.notificationCopy}>
				<View style={styles.resumeKicker}><Animated.View style={[styles.resumeDot, { backgroundColor: colors.accentText }, dotStyle]} /><Text style={[ui.eyebrow, { color: colors.accentText }]}>IN PROGRESS</Text></View>
				<Text style={[styles.resumeTitle, { color: colors.accentText }]} numberOfLines={1}>{title}</Text>
				<Text style={[styles.resumeMeta, { color: colors.accentText }]} numberOfLines={1}>{meta}</Text>
			</View>
			<Animated.View style={[styles.resumeButton, { backgroundColor: colors.accentText }, buttonStyle]}><Text style={[styles.resumeButtonText, { color: colors.accent }]}>Resume</Text><ChevronRight width={16} height={16} color={colors.accent} strokeWidth={3} /></Animated.View>
		</Pressable>
	</Animated.View>;
}

function AnimatedVolume({ volume, colors }: { volume: number; colors: AppColors }) {
	const [animatedVolume] = useState(() => new NativeAnimated.Value(volume));
	const [displayedVolume, setDisplayedVolume] = useState(volume);
	const reducedMotion = useReducedMotion();
	useEffect(() => {
		const listener = animatedVolume.addListener(({ value }) => setDisplayedVolume(Math.round(value)));
		const animation = NativeAnimated.timing(animatedVolume, {
			toValue: volume,
			duration: reducedMotion ? 0 : 240,
			useNativeDriver: false,
			isInteraction: false,
		});
		animation.start();
		return () => {
			animation.stop();
			animatedVolume.removeListener(listener);
		};
	}, [animatedVolume, reducedMotion, volume]);
	return <Text style={[styles.totalValue, { color: colors.text, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`${formatVolume(volume)} lb`}>{formatVolume(displayedVolume)}<Text style={[styles.totalUnit, { color: colors.mutedText }]}> lb</Text></Text>;
}

function HeroStat({ value, unit, label, colors, icon }: { value: string; unit?: string; label: string; colors: AppColors; icon?: ReactNode }) {
	return <View style={styles.heroStat} accessible accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ''}`}>
		{icon ? <View style={styles.heroStatValueRow}>{icon}{unit && <Text style={[styles.heroStatUnit, { color: colors.mutedText }]}>{unit}</Text>}</View> : <Text style={[styles.heroStatValue, { color: colors.text }]}>{value}{unit && <Text style={[styles.heroStatUnit, { color: colors.mutedText }]}> {unit}</Text>}</Text>}
		<Text style={[styles.heroStatLabel, { color: colors.mutedText }]}>{label}</Text>
	</View>;
}

function VolumeChart({ points, onSelect, onInteractionEnd, colors }: VolumeChartProps) {
	return <View style={styles.chart}>
		{Platform.OS === 'web'
			? <WebLineGraph points={points} onSelect={onSelect} onInteractionEnd={onInteractionEnd} colors={colors} />
			: <NativeLineGraph points={points} onSelect={onSelect} onInteractionEnd={onInteractionEnd} colors={colors} />}
	</View>;
}

function CompactSelectionDot({ isActive, color, circleX, circleY }: SelectionDotProps) {
	const opacity = useDerivedValue(() => (isActive.value ? 1 : 0));
	return <Circle cx={circleX} cy={circleY} r={5} color={color} opacity={opacity} />;
}

function NativeLineGraph({ points, onSelect, onInteractionEnd, colors }: VolumeChartProps) {
	const graphPoints = points.map((point) => ({ value: point.volume, date: point.date }));
	const max = Math.max(...points.map((point) => point.volume), 1);
	const range = { x: { min: graphPoints[0].date, max: graphPoints[graphPoints.length - 1].date }, y: { min: 0, max: max * 1.1 } };
	return <View style={styles.graphArea}>
		<LineGraph points={graphPoints} range={range} animated color={colors.text} lineThickness={2.5} gradientFillColors={[`${colors.accent}66`, `${colors.accent}00`]} style={styles.lineGraph}
			enablePanGesture panGestureDelay={300} verticalPadding={8} horizontalPadding={6} SelectionDot={CompactSelectionDot}
			onPointSelected={(point) => onSelect({ volume: point.value, date: point.date })} onGestureEnd={onInteractionEnd} />
	</View>;
}

function WebLineGraph({ points, onSelect, onInteractionEnd, colors }: VolumeChartProps) {
	const [size, setSize] = useState({ width: 0, height: 0 });
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
	return <Pressable style={styles.graphArea} delayLongPress={300} onLongPress={(event) => selectAtPosition(event.nativeEvent.locationX)} onPressOut={onInteractionEnd} onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}>
		{size.width > 0 && <Svg viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMinYMin meet" style={styles.lineGraph}>
			<Defs><LinearGradient id="home-volume-fill" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={colors.accent} stopOpacity={.4} /><Stop offset="1" stopColor={colors.accent} stopOpacity={0} /></LinearGradient></Defs>
			{[.25, .5, .75].map((at) => <Line key={at} x1="0" x2={size.width} y1={size.height * at} y2={size.height * at} stroke={colors.surfaceStrong} strokeWidth="1" />)}
			<Polygon points={`${x(0)},${size.height} ${linePoints} ${x(points.length - 1)},${size.height}`} fill="url(#home-volume-fill)" />
			<Polyline points={linePoints} fill="none" stroke={colors.text} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
		</Svg>}
	</Pressable>;
}

// Flame badge with the streak count inside. Sits at its last (resting) frame; replays the pop,
// and zooms the new number in, whenever the streak rises while home is mounted.
function StreakFlame({ streak }: { streak: number }) {
	const lottie = useRef<LottieView>(null);
	const previous = useRef(streak);
	const [rose, setRose] = useState(false);
	const reducedMotion = useReducedMotion();
	useEffect(() => {
		if (streak > previous.current && !reducedMotion) { lottie.current?.play(0); setRose(true); }
		previous.current = streak;
	}, [streak, reducedMotion]);
	return <View style={styles.streakFlame}>
		<LottieView ref={lottie} source={require('../../../assets/streak-flame.json')} autoPlay={false} loop={false} progress={1} style={StyleSheet.absoluteFill} />
		<Animated.Text key={streak} entering={rose ? ZoomIn.delay(150).springify() : undefined} style={styles.streakFlameCount}>{streak}</Animated.Text>
	</View>;
}

function MonthActivity({ visits, colors, goal, daysThisWeek, streak }: { visits: WorkoutVisitSummary[]; colors: AppColors; goal: number | null; daysThisWeek: number; streak: number }) {
	const [workoutPicker, setWorkoutPicker] = useState<{ date: Date; visits: WorkoutVisitSummary[] } | null>(null);
	const workoutPickerVisible = useSheetPresence(workoutPicker !== null);
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
	const cellWidth = gridWidth ? (gridWidth - 6 * calendarGap) / 7 : 0;
	const activeCount = dates.filter((day) => day.getMonth() === month.getMonth() && (visitsByDate.get(dateKey(day))?.sets ?? 0) > 0).length;
	const weekGoalMet = rows.map((week) => goal != null && week.filter((day) => (visitsByDate.get(dateKey(day))?.sets ?? 0) > 0).length >= goal);
	const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(month);
	return <>
		<SectionHeader title={monthLabel} />
		<View>
			<View style={styles.statRow}>
				<HeroStat value={String(activeCount)} label={activeCount === 1 ? 'Active day' : 'Active days'} colors={colors} />
				<View style={[styles.statDivider, { backgroundColor: colors.surfaceStrong }]} />
				<HeroStat value={String(daysThisWeek)} unit={goal != null ? `/ ${goal}` : undefined} label={goal != null && daysThisWeek >= goal ? 'Goal met' : 'This week'} colors={colors} />
				<View style={[styles.statDivider, { backgroundColor: colors.surfaceStrong }]} />
				<HeroStat value={String(streak)} unit={streak === 1 ? 'wk' : 'wks'} label="Streak" colors={colors} icon={streak > 0 && <StreakFlame streak={streak} />} />
			</View>
			<View style={styles.calendarRow}>{'SMTWTFS'.split('').map((letter, index) => <Text key={index} style={[styles.calendarWeekday, { width: cellWidth, color: colors.subtleText }]}>{letter}</Text>)}</View>
			<View style={styles.calendarGrid} onLayout={({ nativeEvent: { layout } }) => setGridWidth((width) => width === layout.width ? width : layout.width)}>{!!gridWidth && rows.map((week, rowIndex) => <View key={rowIndex} style={styles.calendarRow}>{week.map((day, columnIndex) => {
				const isThisMonth = day.getMonth() === month.getMonth();
				const dayVisits = visitsByDate.get(dateKey(day));
				const sets = dayVisits?.sets ?? 0;
				const goalMet = weekGoalMet[rowIndex];
				const isToday = dateKey(day) === dateKey(month);
				const selectDay = () => {
					if (!dayVisits) return;
					if (dayVisits.visits.length === 1) router.push({ pathname: '/history-detail', params: { workoutId: dayVisits.visits[0].workout.id } }, { withAnchor: true });
					else setWorkoutPicker({ date: day, visits: dayVisits.visits });
				};
				return <Animated.View key={dateKey(day)} entering={FadeIn.duration(260).delay((rowIndex + columnIndex) * 30)}><Pressable disabled={!isThisMonth || !dayVisits} onPress={selectDay} style={({ pressed }) => [styles.calendarCell, { width: cellWidth, height: cellWidth }, !isThisMonth && styles.calendarCellOutside, { backgroundColor: goalMet && sets > 0 ? goalGold : activityColor(sets, colors) }, isToday && { borderWidth: 2, borderColor: colors.text, paddingTop: 2, paddingLeft: 3 }, pressed && styles.calendarCellPressed]} accessibilityRole={isThisMonth && dayVisits ? 'button' : undefined} accessibilityLabel={isThisMonth && dayVisits ? `${dayVisits.visits.length} workout${dayVisits.visits.length === 1 ? '' : 's'} on ${new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(day)}${goalMet ? ', weekly goal met' : ''}` : undefined}>
					{isThisMonth && <Text style={[styles.calendarDay, { color: sets > 0 && (goalMet || sets >= 3) ? colors.accentText : colors.text }]}>{day.getDate()}</Text>}
				</Pressable></Animated.View>;
			})}</View>)}</View>
			<View style={styles.legend}>
				<View style={styles.legendScale}><Text style={[styles.legendText, { color: colors.subtleText }]}>Fewer sets</Text>{[0, 1, 2, 3].map((sets) => <View key={sets} style={[styles.legendSwatch, { backgroundColor: activityColor(sets, colors) }]} />)}<Text style={[styles.legendText, { color: colors.subtleText }]}>More</Text></View>
				{goal != null && <View style={styles.legendScale}><View style={[styles.legendSwatch, { backgroundColor: goalGold }]} /><Text style={[styles.legendText, { color: colors.subtleText }]}>Goal week</Text></View>}
			</View>
		</View>
		<Modal visible={workoutPickerVisible} transparent animationType="none" onRequestClose={() => setWorkoutPicker(null)}>
			<View style={styles.sheetOverlay}>
				{workoutPicker && <>
				<Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(200)} style={styles.sheetBackdrop}>
					<Pressable onPress={() => setWorkoutPicker(null)} style={StyleSheet.absoluteFill} accessibilityLabel="Close workout picker" />
				</Animated.View>
				<Animated.View entering={SlideInDown.duration(280)} exiting={SlideOutDown.duration(200)} style={[styles.workoutSheet, { backgroundColor: colors.background }]}>
					<View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
					<Text style={[styles.sheetTitle, { color: colors.text }]}>Choose a workout</Text>
					<Text style={[styles.sheetDate, { color: colors.mutedText }]}>{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(workoutPicker.date)}</Text>
						{workoutPicker.visits.map((visit) => <Pressable key={visit.workout.id} onPress={() => { setWorkoutPicker(null); router.push({ pathname: '/history-detail', params: { workoutId: visit.workout.id } }, { withAnchor: true }); }} style={({ pressed }) => [styles.workoutOption, { borderColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`View ${workoutSplitLabel(visit.workout.split)} workout`}>
							<View><Text style={[styles.workoutOptionTitle, { color: colors.text }]}>{workoutSplitLabel(visit.workout.split)} workout</Text><Text style={[styles.workoutOptionMeta, { color: colors.mutedText }]}>{visit.exercises} exercises  ·  {visit.sets} sets  ·  {visit.volume ? `${formatVolume(visit.volume)} lb` : `${visit.reps} reps`}</Text></View>
						</Pressable>)}
				</Animated.View>
				</>}
			</View>
		</Modal>
	</>;
}

function activityColor(sets: number, colors: AppColors) {
	if (sets === 0) return colors.surfaceStrong;
	if (sets === 1) return `${colors.accent}40`;
	if (sets === 2) return `${colors.accent}80`;
	if (sets <= 4) return colors.accent;
	return `${colors.accent}CC`;
}

const styles = StyleSheet.create({
	content: { paddingHorizontal: contentPadding, paddingTop: 4, paddingBottom: 40 },
	historyAction: { height: 36, paddingHorizontal: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6 }, historyActionText: { fontSize: 13, fontWeight: '800' },
	card: { padding: 18, borderRadius: 24, borderCurve: 'continuous' },
	notificationScroll: { marginHorizontal: -contentPadding, marginBottom: -8 }, notificationRow: { paddingHorizontal: contentPadding, gap: notificationGap }, notification: { minHeight: 66, paddingVertical: 12, paddingLeft: 18, paddingRight: 14, borderRadius: 20, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', gap: 8 }, notificationCopy: { flex: 1, minWidth: 0 }, notificationText: { marginTop: 3, fontSize: 16, fontWeight: '900', letterSpacing: -.4 },
	resumeWrap: { marginBottom: -8 }, resume: { paddingVertical: 16, paddingLeft: 18, paddingRight: 14, borderRadius: 22, borderCurve: 'continuous', flexDirection: 'row', alignItems: 'center', gap: 12 }, resumeKicker: { flexDirection: 'row', alignItems: 'center', gap: 6 }, resumeDot: { width: 7, height: 7, borderRadius: 4 }, resumeTitle: { marginTop: 4, fontSize: 22, fontWeight: '900', letterSpacing: -.7 }, resumeMeta: { marginTop: 2, fontSize: 12, fontWeight: '700', opacity: .8 }, resumeButton: { height: 38, paddingLeft: 14, paddingRight: 10, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 2 }, resumeButtonText: { fontSize: 14, fontWeight: '900' },
	statRow: { marginBottom: 18, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center' }, statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginHorizontal: 14 },
	heroStat: { flex: 1 }, heroStatValueRow: { height: 27, flexDirection: 'row', alignItems: 'center', gap: 4 }, streakFlame: { width: 30, height: 30, marginVertical: -2, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 }, streakFlameCount: { color: '#FFF', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] }, heroStatValue: { fontSize: 22, fontWeight: '900', letterSpacing: -.6, fontVariant: ['tabular-nums'] }, heroStatUnit: { fontSize: 12, fontWeight: '800', letterSpacing: 0 }, heroStatLabel: { marginTop: 1, fontSize: 11, fontWeight: '700' },
	totalRow: { marginTop: 20, flexDirection: 'row', alignItems: 'baseline', gap: 10 },
	totalValue: { fontSize: 34, fontWeight: '900', letterSpacing: -1.2, fontVariant: ['tabular-nums'] }, totalUnit: { fontSize: 15, fontWeight: '800', letterSpacing: 0 },
	totalDelta: { fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] }, totalMeta: { marginTop: 2, fontSize: 12, fontWeight: '700' },
	chart: { height: 140, marginTop: 14, marginHorizontal: -6 }, graphArea: { flex: 1 }, lineGraph: { ...StyleSheet.absoluteFill },
	axisRow: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' }, axisLabel: { fontSize: 9, fontWeight: '800' },
	emptyCopy: { marginVertical: 16, fontSize: 13, lineHeight: 19, fontWeight: '600' },
	calendarWeekday: { marginBottom: 6, textAlign: 'center', fontSize: 10, fontWeight: '900' },
	calendarGrid: { gap: calendarGap }, calendarRow: { flexDirection: 'row', gap: calendarGap }, calendarCell: { borderRadius: 8, borderCurve: 'continuous', paddingTop: 4, paddingLeft: 5 }, calendarDay: { fontSize: 11, lineHeight: 13, fontWeight: '800', includeFontPadding: false }, calendarCellOutside: { opacity: 0 }, calendarCellPressed: { opacity: .72, transform: [{ scale: .93 }] },
	legend: { marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, legendScale: { flexDirection: 'row', alignItems: 'center', gap: 4 }, legendSwatch: { width: 10, height: 10, borderRadius: 3 }, legendText: { marginHorizontal: 2, fontSize: 10, fontWeight: '800' },
	sheetOverlay: { flex: 1, justifyContent: 'flex-end' }, sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.38)' }, workoutSheet: { minHeight: 250, paddingHorizontal: 24, paddingTop: 10, paddingBottom: 28, borderTopLeftRadius: 25, borderTopRightRadius: 25 }, sheetHandle: { width: 37, height: 4, borderRadius: 2, alignSelf: 'center' }, sheetTitle: { marginTop: 22, fontSize: 22, fontWeight: '900', letterSpacing: -.8 }, sheetDate: { marginTop: 3, marginBottom: 13, fontSize: 13, fontWeight: '700' }, workoutOption: { minHeight: 68, borderTopWidth: 1, justifyContent: 'center' }, workoutOptionTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -.4 }, workoutOptionMeta: { marginTop: 3, fontSize: 12, fontWeight: '700', letterSpacing: -.1 },
});
