import { ui } from '@/styles/primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'react-native-feather';
import LottieView from 'lottie-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInUp, SlideInLeft, SlideInRight, ZoomIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getExercises, getWorkoutAchievements, getWorkoutHistories, getWorkoutMuscles, getWorkoutMuscleRatings, getWorkoutVisitExerciseDetails, getWorkoutVisitSummary, getWorkoutVisits, saveWorkoutMuscleRatings, type WorkoutMuscle } from '@/db';
import { exerciseRequiresWeight } from '@/db/exercise-catalog';
import { tintFlexFills } from '@/components/flex-animation';
import { MuscleBodyGraphic } from '@/components/muscle-body-graphic';
import { RulerSlider } from '@/components/ruler-slider';
import { useAppearance } from '@/components/appearance-provider';
import { EmptyArt } from '@/components/empty-art';
import { syncWorkoutData } from '@/lib/cloud-sync';
import { workoutSplitLabel } from '@/lib/workout-split-label';
import { hasAskedReturnPlan } from '@/lib/return-plan';
import { authClient } from '@/lib/auth-client';
import { exerciseProgress } from '@/lib/summary-progress';

type Page = 'rating' | 'complete';
const exhaustionLabel = (value: number) => value <= 2 ? 'Fresh' : value <= 4 ? 'Worked' : value <= 7 ? 'Tired' : 'Spent';
const formatVolume = (volume: number) => volume >= 10_000 ? `${Math.round(volume / 1000)}k` : volume >= 1_000 ? `${(volume / 1000).toFixed(1)}k` : String(volume);
const weightRequiredExerciseIds = new Set(getExercises().filter(exerciseRequiresWeight).map((exercise) => exercise.id));
const formatDuration = (ms: number) => {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
};

// Summary is a hidden tab, so it stays mounted between workouts; keying on the workout resets its state and replays the animations.
export default function WorkoutSummaryRoute() {
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  return <WorkoutSummaryScreen key={workoutId} workoutId={workoutId} />;
}

function WorkoutSummaryScreen({ workoutId }: { workoutId?: string }) {
  const { colors } = useAppearance();
  const { data: session } = authClient.useSession();
  const visit = workoutId ? getWorkoutVisitSummary(workoutId) : null;
  const isFirstCompletedWorkout = getWorkoutVisits().length === 1 && !!session?.user.id && !hasAskedReturnPlan(session.user.id);
  const muscles = useMemo(() => workoutId ? getWorkoutMuscles(workoutId) : [], [workoutId]);
  const stored = useMemo(() => workoutId ? getWorkoutMuscleRatings(workoutId) : [], [workoutId]);
  const achievements = useMemo(() => workoutId ? getWorkoutAchievements(workoutId) : [], [workoutId]);
  const exercises = useMemo(() => workoutId ? getWorkoutVisitExerciseDetails(workoutId) : [], [workoutId]);
  const [page, setPage] = useState<Page>(muscles.length ? 'rating' : 'complete');
  const [index, setIndex] = useState(0);
  const [forward, setForward] = useState<boolean>();
  const [answers, setAnswers] = useState<Record<string, number>>(() => Object.fromEntries(stored.map((rating) => [rating.id, rating.exhaustion])));
  const ratings = useMemo(() => muscles.flatMap((item) => answers[item.id] === undefined ? [] : [{ ...item, exhaustion: answers[item.id] }]), [muscles, answers]);
  const finish = () => router.replace(visit && isFirstCompletedWorkout ? '/return-plan' : '/');
  if (!visit) return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}><View style={styles.empty}><EmptyArt name="rack" /><Text style={[styles.emptyTitle, { color: colors.text }]}>Workout unavailable</Text><Pressable onPress={finish} style={[ui.primaryButton, { backgroundColor: colors.accent }]}><Text style={[ui.primaryButtonText, { color: colors.accentText }]}>Back home</Text></Pressable></View></SafeAreaView>;
  const duration = formatDuration((visit.workout.endedAt ?? visit.workout.createdAt).getTime() - visit.workout.createdAt.getTime());
  const muscle = muscles[index];
  const selected = muscle ? answers[muscle.id] ?? 5 : undefined;
  const continueRating = () => {
    if (!muscle || selected === undefined) return;
    const next = { ...answers, [muscle.id]: selected };
    setAnswers(next);
    if (index < muscles.length - 1) {
      setForward(true);
      return setIndex((value) => value + 1);
    }
    if (workoutId) {
      saveWorkoutMuscleRatings(workoutId, next);
      void syncWorkoutData().catch(() => undefined);
    }
    setPage('complete');
  };
  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    {page === 'rating' && muscle && <Rating muscle={muscle} index={index} count={muscles.length} forward={forward} value={selected ?? 5} onBack={() => { if (!index) return finish(); setForward(false); setIndex((value) => value - 1); }} onSelect={(value) => setAnswers((current) => ({ ...current, [muscle.id]: value }))} onContinue={continueRating} onSkip={() => setPage('complete')} />}
    {page === 'complete' && <Complete workoutId={visit.workout.id} completedAt={visit.workout.endedAt ?? visit.workout.createdAt} split={workoutSplitLabel(visit.workout.split)} duration={duration} sets={visit.sets} volume={visit.volume} reps={visit.reps} achievements={achievements} exercises={exercises} ratings={ratings} onFinish={finish} />}
  </SafeAreaView>;
}

function Rating({ muscle, index, count, forward, value, onBack, onSelect, onContinue, onSkip }: { muscle: WorkoutMuscle; index: number; count: number; forward?: boolean; value: number; onBack: () => void; onSelect: (value: number) => void; onContinue: () => void; onSkip: () => void }) {
  const last = index === count - 1;
  const { colors } = useAppearance();
  const reducedMotion = useReducedMotion();
  // Same curve as onboarding's step slide: no spring overshoot on a full-width slide.
  // No slide on first mount: the entering animation pins originY before SafeAreaView applies its inset, leaving the content overlapping the header.
  const slide = reducedMotion || forward === undefined ? undefined : (forward ? SlideInRight : SlideInLeft).duration(280).easing(Easing.bezier(0.33, 1, 0.68, 1));
  return <View style={styles.page}><View style={styles.ratingHeader}><Pressable onPress={onBack} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Previous muscle"><ArrowLeft width={21} height={21} color={colors.text} strokeWidth={2.5} /></Pressable><Text style={[ui.eyebrow, { color: colors.mutedText }]}>{index + 1} OF {count}</Text><Pressable onPress={onSkip} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip muscle check-in"><Text style={[styles.skipText, { color: colors.mutedText }]}>Skip</Text></Pressable></View><View style={styles.progressTrack}>{Array.from({ length: count }, (_, itemIndex) => <View key={itemIndex} style={[styles.progressSegment, { backgroundColor: itemIndex <= index ? colors.accent : colors.surfaceStrong }]} />)}</View><Animated.View key={muscle.id} entering={slide} style={styles.ratingSlide}><View style={styles.ratingCopy}><Text style={[ui.eyebrow, { color: colors.mutedText }]}>HOW DOES IT FEEL?</Text><Text style={[styles.ratingTitle, { color: colors.text }]}>{muscle.name}</Text><MuscleBodyGraphic muscle={muscle.id} /></View><RulerSlider value={value} min={0} max={10} onChange={onSelect} unit={exhaustionLabel(value)} accessibilityLabel={`${muscle.name} exhaustion`} accessibilityText={`${value} of 10, ${exhaustionLabel(value)}`} /></Animated.View><View style={[styles.bottomActions, styles.ratingActions]}><Pressable onPress={onContinue} style={[ui.primaryButton, { backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityLabel={last ? 'Save muscle check-in' : 'Continue to next muscle'}><Text style={[ui.primaryButtonText, { color: colors.accentText }]}>{last ? 'Save check-in' : 'Continue'}</Text></Pressable></View></View>;
}

function Complete({ workoutId, completedAt, split, duration, sets, volume, reps, achievements, exercises, ratings, onFinish }: { workoutId: string; completedAt: Date; split: string; duration: string; sets: number; volume: number; reps: number; achievements: ReturnType<typeof getWorkoutAchievements>; exercises: ReturnType<typeof getWorkoutVisitExerciseDetails>; ratings: ReturnType<typeof getWorkoutMuscleRatings>; onFinish: () => void }) {
  const { colors } = useAppearance();
  const reducedMotion = useReducedMotion();
  const histories = useMemo(() => getWorkoutHistories(exercises.map((exercise) => exercise.id)), [exercises]);
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(completedAt);
  const newBests = achievements.filter((item) => item.level === 'gold');
  const totalReps = exercises.reduce((total, exercise) => total + exercise.sets.reduce((sum, set) => sum + set.reps, 0), 0);
  // A PR gets its own beat first; the summary mounts after so its stagger plays fresh.
  const [celebrating, setCelebrating] = useState(newBests.length > 0 && !reducedMotion);
  const endCelebration = useCallback(() => setCelebrating(false), []);
  if (celebrating) return <PrCelebration names={newBests.map((item) => item.name)} onFinish={endCelebration} />;
  return <View style={[styles.summaryPage, { backgroundColor: colors.background }]}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.summaryContent}>
      <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(400).easing(Easing.out(Easing.cubic))} style={[styles.summaryHero, { backgroundColor: colors.inverse }]}>
        <View style={styles.summaryHeroTop}><Text style={[ui.eyebrow, { color: colors.accent }]}>SESSION COMPLETE</Text><View style={[styles.completeMark, { backgroundColor: colors.accent }]}><Text style={[styles.completeMarkText, { color: colors.accentText }]}>✓</Text></View></View>
        <Text style={[styles.summaryTitle, { color: colors.inverseText }]}>{split} workout</Text>
        <Text style={[styles.summaryMetaText, { color: colors.inverseText }]}>{date}  ·  {duration}</Text>
        <View style={[styles.heroRule, { backgroundColor: colors.inverseText }]} />
        <View style={styles.sessionStats}>
          <View style={styles.sessionStat}><Text style={[styles.sessionStatValue, { color: colors.inverseText }]}>{sets}</Text><Text style={[styles.sessionStatLabel, { color: colors.inverseText }]}>sets</Text></View>
          <View style={styles.sessionStat}><Text style={[styles.sessionStatValue, { color: colors.inverseText }]}>{totalReps || reps}</Text><Text style={[styles.sessionStatLabel, { color: colors.inverseText }]}>reps</Text></View>
          <View style={styles.sessionStat}><Text style={[styles.sessionStatValue, { color: colors.inverseText }]}>{exercises.length}</Text><Text style={[styles.sessionStatLabel, { color: colors.inverseText }]}>exercises</Text></View>
        </View>
      </Animated.View>
      {newBests.length > 0 && <Animated.View entering={reducedMotion ? undefined : FadeInUp.delay(120).duration(400).easing(Easing.out(Easing.cubic))} style={[styles.bestBanner, { backgroundColor: colors.accent }]}><Animated.Text entering={reducedMotion ? undefined : ZoomIn.delay(240).springify().damping(12).stiffness(180)} style={[styles.bestBannerIcon, { color: colors.accentText }]}>✦</Animated.Text><View style={styles.bestBannerCopy}><Text style={[styles.bestBannerTitle, { color: colors.accentText }]}>{newBests.length} new personal {newBests.length === 1 ? 'best' : 'bests'}</Text><Text style={[styles.bestBannerDetail, { color: colors.accentText }]} numberOfLines={2}>{newBests.map((item) => item.name).join(' · ')}</Text></View></Animated.View>}
      <View style={styles.summarySectionHeading}><Text style={[styles.sectionTitle, { color: colors.text }]}>What you did</Text><Text style={[styles.sectionCount, { color: colors.mutedText }]}>{exercises.length} exercises</Text></View>
      {exercises.map((exercise, index) => {
        const weighted = weightRequiredExerciseIds.has(exercise.id);
        const progress = exerciseProgress(exercise.sets, histories.get(exercise.id) ?? [], workoutId, completedAt, weighted);
        const achievement = achievements.find((item) => item.exerciseId === exercise.id);
        const exerciseVolume = exercise.sets.reduce((sum, set) => sum + set.weight * set.reps, 0);
        return <Animated.View key={exercise.id} entering={reducedMotion ? undefined : FadeInUp.delay((newBests.length ? 240 : 120) + index * 80).duration(400).easing(Easing.out(Easing.cubic))} style={[styles.exerciseCard, { backgroundColor: colors.surface }]}>
          <View style={styles.exerciseCardHeading}><View style={styles.exerciseCardTitleGroup}><Text style={[styles.exerciseOrdinal, { color: colors.mutedText }]}>{String(index + 1).padStart(2, '0')}</Text><Text style={[styles.exerciseName, { color: colors.text }]}>{exercise.name}</Text></View>{achievement && <View style={[styles.bestPill, { backgroundColor: achievement.level === 'gold' ? colors.accent : colors.surfaceStrong }]}><Text style={[styles.bestPillText, { color: achievement.level === 'gold' ? colors.accentText : colors.mutedText }]}>{achievement.level === 'gold' ? 'New best' : 'Matched best'}</Text></View>}</View>
          <Text style={[styles.exerciseMeta, { color: colors.mutedText }]}>{exercise.sets.length} {exercise.sets.length === 1 ? 'set' : 'sets'}  ·  {exercise.sets.reduce((sum, set) => sum + set.reps, 0)} reps{exerciseVolume ? `  ·  ${formatVolume(exerciseVolume)} lb volume` : ''}</Text>
          <View style={[styles.setTable, { borderColor: colors.surfaceStrong }]}>
            <View style={styles.setTableHeader}><Text style={[styles.setHeaderNumber, { color: colors.mutedText }]}>Set</Text><Text style={[styles.setHeaderPerformance, { color: colors.mutedText }]}>Performance</Text></View>
            {exercise.sets.map((set) => <View key={set.number} style={[styles.setRow, { borderColor: colors.surfaceStrong }]}><Text style={[styles.setNumber, { color: colors.mutedText }]}>{String(set.number).padStart(2, '0')}</Text><Text style={[styles.setPerformance, { color: colors.text }]}>{weighted ? `${set.weight} lb  ×  ${set.reps} reps` : `${set.reps} reps${set.weight ? `  ·  +${set.weight} lb` : ''}`}</Text></View>)}
          </View>
          <Text style={[styles.exerciseComparison, { color: progress.improved ? colors.text : colors.mutedText }]}>{progress.label}</Text>
        </Animated.View>;
      })}
      {ratings.length > 0 && <View style={styles.muscleRecapSection}><Text style={[styles.sectionTitle, { color: colors.text }]}>Muscle check-in</Text><View style={styles.muscleChips}>{ratings.map((rating) => <View key={rating.id} style={[styles.muscleChip, { borderColor: colors.surfaceStrong }]}><Text style={[styles.muscleChipName, { color: colors.text }]}>{rating.name}</Text><Text style={[styles.muscleChipLevel, { color: rating.exhaustion >= 5 ? colors.accent : colors.mutedText }]}>{rating.exhaustion}/10</Text></View>)}</View></View>}
      {volume > 0 && <Text style={[styles.summaryFootnote, { color: colors.mutedText }]}>Total training volume: {formatVolume(volume)} lb</Text>}
    </ScrollView>
    <View style={[styles.bottomActions, { backgroundColor: colors.background }]}><Pressable onPress={onFinish} style={[ui.primaryButton, { backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityLabel="Finish workout summary"><Text style={[ui.primaryButtonText, { color: colors.accentText }]}>Done</Text></Pressable></View>
  </View>;
}

function PrCelebration({ names, onFinish }: { names: string[]; onFinish: () => void }) {
  const { colors } = useAppearance();
  const source = useMemo(() => tintFlexFills(require('../../assets/flex-pr.json'), colors.accent), [colors.accent]);
  const opacity = useSharedValue(1);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const [done, setDone] = useState(false);
  const fadeOut = useCallback(() => {
    if (done) return;
    setDone(true);
    opacity.set(withTiming(0, { duration: 240, easing: Easing.inOut(Easing.cubic) }));
    setTimeout(onFinish, 240);
  }, [done, opacity, onFinish]);
  // Lottie's finish event drives the exit; the timer covers a missed event.
  useEffect(() => {
    const timer = setTimeout(fadeOut, 3600);
    return () => clearTimeout(timer);
  }, [fadeOut]);
  return <Animated.View style={[styles.celebration, { backgroundColor: colors.background }, fadeStyle]}>
    <Pressable onPress={fadeOut} style={styles.celebrationContent} accessibilityRole="button" accessibilityLabel={`New personal record: ${names.join(', ')}. Tap to continue`}>
      <LottieView autoPlay loop={false} resizeMode="contain" source={source} style={styles.celebrationAnimation} webStyle={styles.celebrationAnimation} onAnimationFinish={fadeOut} onAnimationFailure={fadeOut} />
      {/* Lands as the arm locks out (frame 47 of the 30fps animation). */}
      <Animated.Text entering={ZoomIn.delay(1550).springify().damping(20).stiffness(220)} style={[styles.celebrationTitle, { color: colors.text }]}>NEW PR</Animated.Text>
      <Animated.Text entering={FadeInUp.delay(1750).duration(300)} style={[styles.celebrationDetail, { color: colors.mutedText }]} numberOfLines={2}>{names.join(' · ')}</Animated.Text>
    </Pressable>
  </Animated.View>;
}

const styles = StyleSheet.create({
  celebration: { flex: 1 },
  celebrationContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  celebrationAnimation: { width: 260, height: 260 },
  celebrationTitle: { marginTop: 8, fontSize: 64, lineHeight: 70, fontWeight: '900', letterSpacing: -3 },
  celebrationDetail: { marginTop: 6, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  page: { flex: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 18 },
  ratingHeader: { height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skipText: { fontSize: 13, fontWeight: '800' },
  progressTrack: { flexDirection: 'row', gap: 4, marginTop: 18 },
  progressSegment: { flex: 1, height: 4, borderRadius: 4 },
  ratingSlide: { flex: 1 },
  ratingCopy: { alignItems: 'center', paddingTop: 28 },
  ratingTitle: { marginTop: 8, fontSize: 38, lineHeight: 41, fontWeight: '900', letterSpacing: -1.9 },
  bottomActions: { paddingTop: 12 },
  ratingActions: { marginTop: 0 },
  summaryPage: { flex: 1, paddingHorizontal: 20 },
  summaryContent: { paddingTop: 12, paddingBottom: 24 },
  summaryHero: { borderRadius: 28, padding: 24 },
  summaryHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  completeMark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  completeMarkText: { fontSize: 20, fontWeight: '900', lineHeight: 25 },
  summaryTitle: { marginTop: 25, fontSize: 36, lineHeight: 40, fontWeight: '900', letterSpacing: -1.7 },
  summaryMetaText: { marginTop: 8, fontSize: 13, fontWeight: '600', opacity: .7 },
  heroRule: { height: 1, opacity: .18, marginTop: 28, marginBottom: 18 },
  sessionStats: { flexDirection: 'row' },
  sessionStat: { flex: 1 },
  sessionStatValue: { fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -.7 },
  sessionStatLabel: { marginTop: 2, fontSize: 12, fontWeight: '600', opacity: .65 },
  bestBanner: { marginTop: 14, borderRadius: 20, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 13 },
  bestBannerIcon: { fontSize: 25, fontWeight: '900' },
  bestBannerCopy: { flex: 1 },
  bestBannerTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -.3 },
  bestBannerDetail: { marginTop: 3, fontSize: 12, fontWeight: '600', opacity: .75 },
  summarySectionHeading: { marginTop: 32, marginBottom: 14, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -.8 },
  sectionCount: { fontSize: 12, fontWeight: '700' },
  exerciseCard: { borderRadius: 22, padding: 18, marginBottom: 12 },
  exerciseCardHeading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  exerciseCardTitleGroup: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exerciseOrdinal: { width: 23, paddingTop: 2, fontSize: 11, fontWeight: '800' },
  exerciseName: { flex: 1, fontSize: 17, lineHeight: 21, fontWeight: '900', letterSpacing: -.45 },
  bestPill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  bestPillText: { fontSize: 10, fontWeight: '900' },
  exerciseMeta: { marginTop: 7, marginLeft: 33, fontSize: 12, fontWeight: '600' },
  setTable: { marginTop: 17, borderTopWidth: 1 },
  setTableHeader: { flexDirection: 'row', paddingTop: 11, paddingBottom: 4 },
  setHeaderNumber: { width: 45, fontSize: 11, fontWeight: '700' },
  setHeaderPerformance: { fontSize: 11, fontWeight: '700' },
  setRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  setNumber: { width: 45, fontSize: 12, fontWeight: '700' },
  setPerformance: { fontSize: 14, fontWeight: '800', letterSpacing: -.2 },
  exerciseComparison: { marginTop: 13, fontSize: 12, fontWeight: '800' },
  muscleRecapSection: { marginTop: 20 },
  muscleChips: { marginTop: 8 },
  muscleChip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  muscleChipName: { fontSize: 14, fontWeight: '800' },
  muscleChipLevel: { fontSize: 12, fontWeight: '800' },
  summaryFootnote: { marginTop: 22, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  empty: { flex: 1, padding: 24, justifyContent: 'center', gap: 18 },
  emptyTitle: { fontSize: 26, fontWeight: '900' },
});
