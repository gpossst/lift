import { ui } from '@/styles/primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'react-native-feather';
import LottieView from 'lottie-react-native';
import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineGraph } from 'react-native-graph';
import Svg, { Circle as SvgCircle, Line, Polyline, Rect as SvgRect } from 'react-native-svg';
import { getExercises, getWorkoutAchievements, getWorkoutHistory, getWorkoutMuscles, getWorkoutMuscleRatings, getWorkoutVisitExercises, getWorkoutVisitSummary, getWorkoutVisits, saveWorkoutMuscleRatings, type WorkoutMuscle } from '@/db';
import { exerciseRequiresWeight } from '@/db/exercise-catalog';
import { MuscleBodyGraphic } from '@/components/muscle-body-graphic';
import { useAppearance } from '@/components/appearance-provider';
import { syncWorkoutData } from '@/lib/cloud-sync';
import { workoutSplitLabel } from '@/lib/workout-split-label';
import { hasAskedReturnPlan } from '@/lib/return-plan';
import { authClient } from '@/lib/auth-client';

type Page = 'rating' | 'celebration' | 'complete';
const exhaustionLabels: Record<number, string> = { 1: 'Fresh', 2: 'Worked', 3: 'Tired', 4: 'Spent' };
const formatVolume = (volume: number) => volume >= 10_000 ? `${Math.round(volume / 1000)}k` : volume >= 1_000 ? `${(volume / 1000).toFixed(1)}k` : String(volume);
const weightRequiredExerciseIds = new Set(getExercises().filter(exerciseRequiresWeight).map((exercise) => exercise.id));
const formatDuration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
};

export default function WorkoutSummaryScreen() {
  const { colors } = useAppearance();
  const { data: session } = authClient.useSession();
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const visit = workoutId ? getWorkoutVisitSummary(workoutId) : null;
  const isFirstCompletedWorkout = getWorkoutVisits().length === 1 && !!session?.user.id && !hasAskedReturnPlan(session.user.id);
  const muscles = useMemo(() => workoutId ? getWorkoutMuscles(workoutId) : [], [workoutId]);
  const stored = useMemo(() => workoutId ? getWorkoutMuscleRatings(workoutId) : [], [workoutId]);
  const achievements = useMemo(() => workoutId ? getWorkoutAchievements(workoutId) : [], [workoutId]);
  const exercises = useMemo(() => workoutId ? getWorkoutVisitExercises(workoutId) : [], [workoutId]);
  const [page, setPage] = useState<Page>(muscles.length ? 'rating' : 'complete');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>(() => Object.fromEntries(stored.map((rating) => [rating.id, rating.exhaustion])));
  const ratings = useMemo(() => muscles.flatMap((item) => answers[item.id] === undefined ? [] : [{ ...item, exhaustion: answers[item.id] }]), [muscles, answers]);
  const finish = () => router.replace(visit && isFirstCompletedWorkout ? '/return-plan' : '/');
  if (!visit) return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}><View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>Workout unavailable</Text><Pressable onPress={finish} style={[ui.primaryButton, { backgroundColor: colors.accent }]}><Text style={[ui.primaryButtonText, { color: colors.accentText }]}>Back home</Text></Pressable></View></SafeAreaView>;
  const duration = formatDuration((visit.workout.endedAt ?? visit.workout.createdAt).getTime() - visit.workout.createdAt.getTime());
  const muscle = muscles[index];
  const selected = muscle ? answers[muscle.id] : undefined;
  const continueRating = () => {
    if (selected === undefined) return;
    if (index < muscles.length - 1) return setIndex((value) => value + 1);
    if (workoutId) {
      saveWorkoutMuscleRatings(workoutId, answers);
      void syncWorkoutData().catch(() => undefined);
    }
    setPage('celebration');
  };
  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    {page === 'rating' && muscle && <Rating muscle={muscle} index={index} count={muscles.length} value={selected} onBack={() => index ? setIndex((value) => value - 1) : finish()} onSelect={(value) => setAnswers((current) => ({ ...current, [muscle.id]: value }))} onContinue={continueRating} onSkip={() => setPage('celebration')} />}
    {page === 'celebration' && <FlexCelebration onFinish={() => setPage('complete')} />}
    {page === 'complete' && <Complete split={workoutSplitLabel(visit.workout.split)} duration={duration} sets={visit.sets} volume={visit.volume} reps={visit.reps} achievements={achievements} exercises={exercises} ratings={ratings} onFinish={finish} />}
  </SafeAreaView>;
}

function FlexCelebration({ onFinish }: { onFinish: () => void }) {
  const { colors } = useAppearance();
  return <View style={styles.celebration} accessibilityLabel="Workout complete" accessibilityRole="progressbar">
    <LottieView autoPlay loop={false} resizeMode="contain" source={require('../../assets/workout-complete.json')} colorFilters={[{ keypath: 'Accent', color: colors.accent }, { keypath: 'Speed Lines', color: colors.accent }, { keypath: 'Accent Text', color: colors.accentText }]} style={styles.celebrationAnimation} webStyle={styles.celebrationAnimation} onAnimationFinish={(isCancelled) => { if (!isCancelled) onFinish(); }} onAnimationFailure={onFinish} />
  </View>;
}

function Rating({ muscle, index, count, value, onBack, onSelect, onContinue, onSkip }: { muscle: WorkoutMuscle; index: number; count: number; value?: number; onBack: () => void; onSelect: (value: number) => void; onContinue: () => void; onSkip: () => void }) {
  const last = index === count - 1;
  const { colors } = useAppearance();
  const isReady = value !== undefined;
  return <View style={styles.page}><View style={styles.ratingHeader}><Pressable onPress={onBack} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Previous muscle"><ArrowLeft width={21} height={21} color={colors.text} strokeWidth={2.5} /></Pressable><Text style={[styles.stepText, { color: colors.mutedText }]}>{index + 1} OF {count}</Text><Pressable onPress={onSkip} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip muscle check-in"><Text style={[styles.skipText, { color: colors.mutedText }]}>Skip</Text></Pressable></View><View style={styles.progressTrack}>{Array.from({ length: count }, (_, itemIndex) => <View key={itemIndex} style={[styles.progressSegment, { backgroundColor: itemIndex <= index ? colors.accent : colors.surfaceStrong }]} />)}</View><View style={styles.ratingCopy}><Text style={[styles.ratingEyebrow, { color: colors.mutedText }]}>HOW DOES IT FEEL?</Text><Text style={[styles.ratingTitle, { color: colors.text }]}>{muscle.name}</Text><MuscleBodyGraphic muscle={muscle.id} /></View><View style={styles.ratingOptions}>{[{ label: 'Fresh', value: 1 }, { label: 'Worked', value: 2 }, { label: 'Tired', value: 3 }, { label: 'Spent', value: 4 }].map((option) => { const selected = value === option.value; return <Pressable key={option.value} onPress={() => onSelect(option.value)} style={[styles.ratingOption, { backgroundColor: selected ? colors.accent : colors.surface }]} accessibilityRole="button" accessibilityLabel={`${option.label} exhaustion`}><Text style={[styles.ratingOptionText, { color: selected ? colors.accentText : colors.text }]}>{option.label}</Text></Pressable>; })}</View><View style={[styles.bottomActions, styles.ratingActions]}><Pressable disabled={!isReady} onPress={onContinue} style={[ui.primaryButton, { backgroundColor: isReady ? colors.accent : colors.surfaceStrong }]} accessibilityRole="button" accessibilityLabel={last ? 'Save muscle check-in' : 'Continue to next muscle'}><Text style={[ui.primaryButtonText, { color: isReady ? colors.accentText : colors.subtleText }]}>{last ? 'Save check-in' : 'Continue'}</Text></Pressable></View></View>;
}

function Complete({ split, duration, sets, volume, reps, achievements, exercises, ratings, onFinish }: { split: string; duration: string; sets: number; volume: number; reps: number; achievements: ReturnType<typeof getWorkoutAchievements>; exercises: ReturnType<typeof getWorkoutVisitExercises>; ratings: ReturnType<typeof getWorkoutMuscleRatings>; onFinish: () => void }) {
  const { colors } = useAppearance();
  const recoveryDue = ratings.some((rating) => rating.exhaustion >= 3);
  const hasRequiredWeight = exercises.some((exercise) => weightRequiredExerciseIds.has(exercise.id));
  return <View style={[styles.summaryPage, { backgroundColor: colors.background }]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.summaryContent}>
      <View style={styles.summaryHero}><View style={[styles.completeMark, { backgroundColor: colors.accent }]}><Text style={[styles.completeMarkText, { color: colors.accentText }]}>✓</Text></View><Text style={[styles.summaryKicker, { color: colors.mutedText }]}>WORKOUT COMPLETE</Text><Text style={[styles.summaryTitle, { color: colors.text }]}>Strong work.</Text><Text style={[styles.summaryMetaText, { color: colors.mutedText }]}>{split} · {duration}</Text></View>
      <View style={styles.sessionStats}><View style={[ui.stat, { backgroundColor: colors.surface }]}><Text style={[ui.statValue, { color: colors.text }]}>{volume ? `${formatVolume(volume)} lb` : reps}</Text><Text style={[ui.statLabel, { color: colors.mutedText }]}>{volume ? hasRequiredWeight ? 'Volume' : 'Added volume' : 'Reps'}</Text></View><View style={[ui.stat, { backgroundColor: colors.surface }]}><Text style={[ui.statValue, { color: colors.text }]}>{sets}</Text><Text style={[ui.statLabel, { color: colors.mutedText }]}>Sets</Text></View><View style={[ui.stat, { backgroundColor: colors.surface }]}><Text style={[ui.statValue, { color: colors.text }]}>{exercises.length}</Text><Text style={[ui.statLabel, { color: colors.mutedText }]}>Exercises</Text></View></View>
      {achievements.length > 0 && <View style={styles.personalBestSection}><Text style={[styles.personalBestTitle, { color: colors.mutedText }]}>Personal bests</Text>{achievements.slice(0, 2).map((item, index, shown) => { const isBest = item.level === 'gold'; const required = weightRequiredExerciseIds.has(item.exerciseId); return <View style={[styles.achievement, { borderColor: colors.surfaceStrong, borderBottomWidth: index === shown.length - 1 ? 0 : 1 }]} key={item.exerciseId}><View style={[styles.bestMedal, { backgroundColor: isBest ? colors.accent : colors.surface }]}><Text style={[styles.bestMedalText, { color: isBest ? colors.accentText : colors.mutedText }]}>★</Text></View><View style={styles.achievementCopy}><Text style={[styles.achievementName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text><Text style={[styles.achievementDetail, { color: colors.mutedText }]}>{item.metric === 'weight' ? `${required ? '' : '+'}${item.weight} lb max` : `${item.reps} reps${item.weight ? ` @ ${required ? '' : '+'}${item.weight} lb` : ''}`}</Text></View><Text style={[styles.achievementLevelText, { color: isBest ? colors.accent : colors.mutedText }]}>{isBest ? 'New best' : 'Matched'}</Text></View>; })}</View>}
      <View style={styles.exerciseListSection}><Text style={[styles.personalBestTitle, { color: colors.mutedText }]}>Today’s training</Text>{exercises.map((exercise, index) => { const weighted = weightRequiredExerciseIds.has(exercise.id); return <View key={exercise.id} style={[styles.exerciseRow, { borderColor: colors.surfaceStrong, borderBottomWidth: index === exercises.length - 1 ? 0 : 1 }]}><Text style={[ui.listIndex, { color: colors.subtleText }]}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.exerciseCopy}><Text style={[ui.listName, { color: colors.text }]} numberOfLines={1}>{exercise.name}</Text><Text style={[ui.listMeta, { color: colors.mutedText }]}>{exercise.sets} {exercise.sets === 1 ? 'set' : 'sets'}{weighted ? ` · ${formatVolume(exercise.volume)} lb` : exercise.volume ? ` · added weight` : ''}</Text></View></View>; })}</View>
      <View style={styles.progressListSection}><Text style={[styles.personalBestTitle, { color: colors.mutedText }]}>Your progress</Text>{exercises.map((exercise, index) => { const weighted = weightRequiredExerciseIds.has(exercise.id); return <View key={exercise.id} style={[styles.exerciseProgress, { borderColor: colors.surfaceStrong, borderBottomWidth: index === exercises.length - 1 ? 0 : 1 }]}><View style={styles.progressHeading}><Text style={[styles.progressExerciseName, { color: colors.text }]}>{exercise.name}</Text><View style={styles.progressLegend}><View style={[styles.legendDot, { backgroundColor: colors.text }]} /><Text style={[styles.progressLegendText, { color: colors.mutedText }]}>{weighted ? 'Max weight' : 'Max reps'}</Text><View style={[styles.legendDot, { backgroundColor: colors.accent }]} /><Text style={[styles.progressLegendText, { color: colors.mutedText }]}>{weighted ? 'Volume' : 'Total reps'}</Text></View></View><ExerciseChart points={groupedExerciseHistory(exercise.id, weighted)} onSelect={() => undefined} onInteractionEnd={() => undefined} /></View>; })}</View>
      {ratings.length > 0 && <View style={styles.muscleRecapSection}><View style={styles.muscleRecapHeading}><Text style={[styles.personalBestTitle, { color: colors.mutedText, marginBottom: 0 }]}>Muscle check-in</Text>{recoveryDue && <Text style={[styles.recoveryBadgeText, { color: colors.accent }]}>Recovery due</Text>}</View><View style={styles.muscleChips}>{ratings.map((rating, index) => { const tired = rating.exhaustion >= 3; return <View key={rating.id} style={[styles.muscleChip, { borderColor: colors.surfaceStrong, borderBottomWidth: index === ratings.length - 1 ? 0 : 1 }]} accessibilityLabel={`${rating.name} ${exhaustionLabels[rating.exhaustion] ?? ''}`}><Text style={[styles.muscleChipName, { color: colors.text }]}>{rating.name}</Text><Text style={[styles.muscleChipLevel, { color: tired ? colors.accent : colors.mutedText }]}>{exhaustionLabels[rating.exhaustion] ?? ''}</Text></View>; })}</View></View>}
    </ScrollView>
    <View style={styles.bottomActions}><Pressable onPress={onFinish} style={[ui.primaryButton, { backgroundColor: colors.accent }]}><Text style={[ui.primaryButtonText, { color: colors.accentText }]}>Done</Text></Pressable></View>
  </View>;
}

type ExerciseProgressPoint = { maxWeight: number; repsAtMaxWeight: number; totalVolume: number; date: Date };
function groupedExerciseHistory(exerciseId: string, usesWeight: boolean): ExerciseProgressPoint[] {
  const sessions = new Map<string, ExerciseProgressPoint>();
  for (const set of getWorkoutHistory(exerciseId)) {
    const current = sessions.get(set.workoutId) ?? { maxWeight: 0, repsAtMaxWeight: 0, totalVolume: 0, date: set.completedAt };
    current.totalVolume += usesWeight ? set.weight * set.reps : set.reps;
    current.date = set.completedAt;
    const primary = usesWeight ? set.weight : set.reps;
    if (primary > current.maxWeight || (primary === current.maxWeight && set.reps > current.repsAtMaxWeight)) {
      current.maxWeight = primary;
      current.repsAtMaxWeight = set.reps;
    }
    sessions.set(set.workoutId, current);
  }
  return [...sessions.values()].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(-16);
}
function ExerciseChart({ points, onSelect, onInteractionEnd }: { points: ExerciseProgressPoint[]; onSelect: (point: ExerciseProgressPoint) => void; onInteractionEnd: () => void }) {
  const { colors } = useAppearance();
  const [size, setSize] = useState({ width: 0, height: 112 });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [scrubX, setScrubX] = useState<number | null>(null);
  const isScrubbing = useRef(false);
  const activeIndexRef = useRef<number | null>(null);
  const scrubXRef = useRef<number | null>(null);
  const chartData = useMemo(() => {
    if (points.length < 2) return null;
    const range = (values: number[]) => { const min = Math.min(...values); const max = Math.max(...values); const padding = Math.max((max - min) * .2, max * .06, 1); return { min: Math.max(0, min - padding), max: max + padding }; };
    const chartStart = points[0].date.getTime();
    const chartEnd = points.at(-1)!.date.getTime();
    const graphDates = points.map((_, index) => new Date(chartStart + (chartEnd - chartStart) * (index / Math.max(points.length - 1, 1))));
    return {
      weightRange: range(points.map((point) => point.maxWeight)),
      volumeRange: range(points.map((point) => point.totalVolume)),
      xRange: { min: graphDates[0], max: graphDates.at(-1)! },
      weightGraphPoints: points.map((point, index) => ({ value: point.maxWeight, date: graphDates[index] })),
      volumeGraphPoints: points.map((point, index) => ({ value: point.totalVolume, date: graphDates[index] })),
    };
  }, [points]);
  if (!chartData) return <View style={[styles.chart, styles.chartEmpty, { backgroundColor: colors.background }]}><Text style={[styles.chartEmptyText, { color: colors.mutedText }]}>Complete this exercise again to see your progression.</Text></View>;
  const chartPoints = points;
  const { weightRange, volumeRange, xRange, weightGraphPoints, volumeGraphPoints } = chartData;
  const graphPadding = 10;
  const graphWidth = Platform.OS === 'web' ? size.width : Math.round(size.width);
  const graphHeight = Platform.OS === 'web' ? size.height : Math.round(size.height);
  const x = (index: number) => Platform.OS === 'web'
    ? graphPadding + index * ((graphWidth - graphPadding * 2) / Math.max(chartPoints.length - 1, 1))
    : graphPadding + Math.floor((graphWidth - graphPadding * 2) * (index / Math.max(chartPoints.length - 1, 1)));
  const y = (value: number, metricRange: { min: number; max: number }) => Platform.OS === 'web'
    ? graphHeight - graphPadding - ((value - metricRange.min) / (metricRange.max - metricRange.min)) * (graphHeight - graphPadding * 2)
    : graphHeight - graphPadding - Math.floor((graphHeight - graphPadding * 2) * ((value - metricRange.min) / (metricRange.max - metricRange.min)));
  const weightLine = chartPoints.map((point, index) => `${x(index)},${y(point.maxWeight, weightRange)}`).join(' ');
  const volumeLine = chartPoints.map((point, index) => `${x(index)},${y(point.totalVolume, volumeRange)}`).join(' ');
  const selectAtPosition = (position: number) => {
    const graphWidth = Math.max(size.width - graphPadding * 2, 1);
    const cursor = Math.max(graphPadding, Math.min(graphPadding + graphWidth, position));
    const index = Math.max(0, Math.min(chartPoints.length - 1, Math.round(((cursor - graphPadding) / graphWidth) * (chartPoints.length - 1))));
    const roundedCursor = Math.round(cursor);
    if (scrubXRef.current !== roundedCursor) {
      scrubXRef.current = roundedCursor;
      setScrubX(roundedCursor);
    }
    if (activeIndexRef.current !== index) {
      activeIndexRef.current = index;
      setActiveIndex(index);
      onSelect(chartPoints[index]);
    }
  };
  const beginScrub = (position: number) => { isScrubbing.current = true; selectAtPosition(position); };
  const continueScrub = (position: number) => { if (isScrubbing.current) selectAtPosition(position); };
  const endScrub = () => { isScrubbing.current = false; activeIndexRef.current = null; scrubXRef.current = null; setActiveIndex(null); setScrubX(null); onInteractionEnd(); };
  const activePoint = activeIndex === null ? null : chartPoints[activeIndex];
  const cursorX = scrubX ?? (activeIndex === null ? null : x(activeIndex));
  const markerY = (values: number[], metricRange: { min: number; max: number }) => {
    const coordinates = values.map((value, index) => ({ x: x(index), y: y(value, metricRange) }));
    return Platform.OS === 'web' ? linearYAtX(coordinates, cursorX!) : bezierYAtX(coordinates, cursorX!);
  };
  const selectionOverlay = size.width > 0 && activePoint && cursorX !== null ? <Svg pointerEvents="none" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMinYMin meet" style={styles.lineGraph}><SvgRect x={cursorX} y="0" width={Math.max(0, size.width - cursorX)} height={size.height} fill={colors.background} opacity="0.68" /><Line x1={cursorX} x2={cursorX} y1="0" y2={size.height} stroke={colors.subtleText} strokeWidth="1" strokeDasharray="3 3" /><SvgCircle cx={cursorX} cy={markerY(chartPoints.map((point) => point.maxWeight), weightRange)} r="4" fill={colors.text} /><SvgCircle cx={cursorX} cy={markerY(chartPoints.map((point) => point.totalVolume), volumeRange)} r="4" fill={colors.accent} /></Svg> : null;
  return <View style={[styles.chart, { backgroundColor: colors.background }]} onLayout={({ nativeEvent: { layout } }) => setSize((current) => current.width === layout.width && current.height === layout.height ? current : { width: layout.width, height: layout.height })}>{Platform.OS === 'web' ? <Pressable style={styles.chartScrubber} delayLongPress={300} onLongPress={(event) => beginScrub(event.nativeEvent.locationX)} onTouchMove={(event) => continueScrub(event.nativeEvent.locationX)} onPressOut={endScrub} accessibilityRole="adjustable" accessibilityLabel="Hold and drag to view exercise history">{size.width > 0 && <Svg viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="xMinYMin meet" style={styles.lineGraph}>{[18, 56, 94].map((lineY) => <Line key={lineY} x1="0" x2={size.width} y1={lineY} y2={lineY} stroke={colors.surfaceStrong} strokeWidth="1" />)}<Polyline points={volumeLine} fill="none" stroke={colors.accent} strokeWidth="2.5" strokeLinejoin="round" /><Polyline points={weightLine} fill="none" stroke={colors.text} strokeWidth="2.5" strokeLinejoin="round" /></Svg>}{selectionOverlay}</Pressable> : <><LineGraph points={weightGraphPoints} range={{ x: xRange, y: weightRange }} animated color={colors.text} lineThickness={2.5} horizontalPadding={10} verticalPadding={10} style={styles.lineGraph} pointerEvents="none" /><LineGraph points={volumeGraphPoints} range={{ x: xRange, y: volumeRange }} animated color={colors.accent} lineThickness={2.5} horizontalPadding={10} verticalPadding={10} style={styles.lineGraph} pointerEvents="none" />{selectionOverlay}<Pressable style={styles.chartScrubber} delayLongPress={300} onLongPress={(event) => beginScrub(event.nativeEvent.locationX)} onTouchMove={(event) => continueScrub(event.nativeEvent.locationX)} onPressOut={endScrub} accessibilityRole="adjustable" accessibilityLabel="Hold and drag to view exercise history" /></>}</View>;
}

type GraphCoordinate = { x: number; y: number };
function linearYAtX(points: GraphCoordinate[], targetX: number) {
  const segmentIndex = Math.max(0, points.findIndex((point) => point.x >= targetX) - 1);
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1] ?? start;
  if (end.x === start.x) return start.y;
  return start.y + (end.y - start.y) * ((targetX - start.x) / (end.x - start.x));
}
function bezierYAtX(points: GraphCoordinate[], targetX: number) {
  if (points.length < 2) return points[0]?.y ?? 0;
  const segments: { from: GraphCoordinate; c1: GraphCoordinate; c2: GraphCoordinate; to: GraphCoordinate }[] = [];
  let from = points[0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const beforePrevious = points[index - 2] ?? previous;
    const point = points[index];
    const c1 = { x: (2 * beforePrevious.x + previous.x) / 3, y: (2 * beforePrevious.y + previous.y) / 3 };
    const c2 = { x: (beforePrevious.x + 2 * previous.x) / 3, y: (beforePrevious.y + 2 * previous.y) / 3 };
    const to = { x: (beforePrevious.x + 4 * previous.x + point.x) / 6, y: (beforePrevious.y + 4 * previous.y + point.y) / 6 };
    segments.push({ from, c1, c2, to });
    from = to;
    if (index === points.length - 1) segments.push({ from, c1: point, c2: point, to: point });
  }
  const segment = segments.find((item) => targetX >= item.from.x && targetX <= item.to.x) ?? segments.at(-1)!;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const middle = (low + high) / 2;
    if (cubicValue(segment.from.x, segment.c1.x, segment.c2.x, segment.to.x, middle) < targetX) low = middle;
    else high = middle;
  }
  return cubicValue(segment.from.y, segment.c1.y, segment.c2.y, segment.to.y, (low + high) / 2);
}
function cubicValue(start: number, controlOne: number, controlTwo: number, end: number, progress: number) {
  const inverse = 1 - progress;
  return inverse ** 3 * start + 3 * inverse ** 2 * progress * controlOne + 3 * inverse * progress ** 2 * controlTwo + progress ** 3 * end;
}

const styles: Record<string, any> = StyleSheet.create({
  celebration: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  celebrationAnimation: { width: 320, height: 320 },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 18 }, summaryPage: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 18 }, summaryContent: { paddingBottom: 16 }, summaryHero: { alignItems: 'center', paddingTop: 14, paddingBottom: 26 }, completeMark: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, completeMarkText: { fontSize: 29, fontWeight: '900' }, summaryKicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, summaryMetaText: { marginTop: 8, fontSize: 14, fontWeight: '700', letterSpacing: -.15, textTransform: 'capitalize' }, summaryTitle: { marginTop: 5, fontSize: 38, lineHeight: 42, fontWeight: '900', letterSpacing: -1.8 }, sessionStats: { flexDirection: 'row', gap: 8 }, ratingHeader: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, stepText: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#73786E' }, skipText: { fontSize: 13, fontWeight: '800', color: '#73786E' }, progressTrack: { flexDirection: 'row', gap: 4, marginTop: 18 }, progressSegment: { flex: 1, height: 4, borderRadius: 4, backgroundColor: '#E0E3DD' }, progressSegmentActive: { backgroundColor: '#171914' }, ratingCopy: { alignItems: 'center', paddingTop: 28 }, ratingEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#747970' }, ratingTitle: { marginTop: 8, fontSize: 38, lineHeight: 41, fontWeight: '900', letterSpacing: -1.9, color: '#161813' }, ratingOptions: { marginTop: 'auto', flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, ratingOption: { width: '48.5%', height: 66, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECEEE8' }, ratingOptionText: { fontSize: 17, fontWeight: '900', letterSpacing: -.45, color: '#252722' }, bottomActions: { paddingTop: 16 }, ratingActions: { marginTop: 0, paddingTop: 12 }, primaryButtonDisabled: { backgroundColor: '#CDD0C9' }, personalBestSection: { marginTop: 28 }, personalBestTitle: { marginBottom: 8, fontSize: 10, fontWeight: '900', letterSpacing: .8, textTransform: 'uppercase' }, achievement: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 }, achievementCopy: { flex: 1, minWidth: 0, marginLeft: 10 }, achievementName: { fontSize: 15, fontWeight: '900', letterSpacing: -.45 }, achievementDetail: { marginTop: 2, fontSize: 12, fontWeight: '700' }, bestMedal: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, bestMedalText: { fontSize: 13 }, achievementLevelText: { fontSize: 11, fontWeight: '900', letterSpacing: -.1 }, exerciseListSection: { marginTop: 28 }, exerciseRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 }, exerciseCopy: { flex: 1, minWidth: 0 }, progressListSection: { marginTop: 28 }, exerciseProgress: { paddingBottom: 18, marginBottom: 18, borderBottomWidth: 1 }, progressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }, progressExerciseName: { flex: 1, paddingRight: 12, fontSize: 15, fontWeight: '800', letterSpacing: -.35 }, progressLegend: { flexDirection: 'row', alignItems: 'center', gap: 4 }, legendDot: { width: 6, height: 6, borderRadius: 3 }, progressLegendText: { fontSize: 9, fontWeight: '800', marginRight: 5 }, chart: { height: 112, position: 'relative', overflow: 'hidden' }, chartEmpty: { alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderBottomWidth: 1 }, chartEmptyText: { maxWidth: 250, fontSize: 12, lineHeight: 18, fontWeight: '700', textAlign: 'center' }, lineGraph: { ...StyleSheet.absoluteFill }, chartScrubber: { ...StyleSheet.absoluteFill, backgroundColor: 'transparent' }, muscleRecapSection: { marginTop: 28 }, muscleRecapHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }, recoveryBadgeText: { fontSize: 12, fontWeight: '900', letterSpacing: -.1 }, muscleChips: { gap: 0 }, muscleChip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 }, muscleChipName: { fontSize: 14, fontWeight: '800', letterSpacing: -.3 }, muscleChipLevel: { fontSize: 12, fontWeight: '800' }, empty: { flex: 1, padding: 24, justifyContent: 'center', gap: 18 }, emptyTitle: { fontSize: 26, fontWeight: '900', color: '#191B16' },
});
