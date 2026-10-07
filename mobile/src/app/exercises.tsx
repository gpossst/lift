import { ExerciseSearchControls } from '@/components/exercise-search-controls';
import { formatLabel, getExerciseMetadata, getPrimaryMuscles, matchesEquipment, matchesMuscle, staticFilter, uniqueSorted } from '@/lib/exercise-filters';
import { ui } from '@/styles/primitives';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, ChevronDown, ChevronRight, Home, Plus, Search, X } from 'react-native-feather';
import Animated, { FadeIn, FadeOut, FadeOutLeft, LinearTransition, SlideInDown } from 'react-native-reanimated';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { endWorkout, getExerciseRecommendations, getRankedExercises, getExercises, getWorkoutSplitDefinition, getWorkoutVisitExercises, getWorkoutVisitSummary, recordRecommendationFeedback, type Exercise, type ExerciseRecommendation, type WorkoutSplit, type WorkoutVisitExercise, type WorkoutVisitSummary } from '@/db';
import { syncWorkoutData } from '@/lib/cloud-sync';
import { searchExercises } from '@/lib/exercise-search';
import { useRecommendationContext } from '@/hooks/use-recommendation-context';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { MuscleCoverageGraphic } from '@/components/split-body-graphic';
import { workoutSplitLabel } from '@/lib/workout-split-label';
import { useAppearance } from '@/components/appearance-provider';
import { EmptyArt } from '@/components/empty-art';

const exercises = getExercises();
type Sort = 'ranked' | 'az' | 'area' | 'equipment';
const meaningfulExposureMs = 10_000;

const sortLabels: Record<Sort, string> = { ranked: 'For you', az: 'Name', area: 'Muscle group', equipment: 'Equipment' };


export default function ExerciseLibraryScreen() {
	const { colors, showWorkoutRecommendations } = useAppearance();
	const { split, workoutId } = useLocalSearchParams<{ split?: string; workoutId?: string }>();
  const [visit, setVisit] = useState<WorkoutVisitSummary | null>(() => workoutId ? getWorkoutVisitSummary(workoutId) : null);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutVisitExercise[]>(() => workoutId ? getWorkoutVisitExercises(workoutId) : []);
  const [query, setQuery] = useState('');
  const [muscleFilters, setMuscleFilters] = useState<string[]>([]);
  const [equipmentFilters, setEquipmentFilters] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>('ranked');
  const [showSorts, setShowSorts] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [screenFocused, setScreenFocused] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [skipped, setSkipped] = useState<{ workoutId?: string; ids: string[] }>({ workoutId, ids: [] });
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [fallbackWorkoutId] = useState(() => `workout-${Date.now()}`);
  const [sheetHeight, setSheetHeight] = useState(0);
  const { context: recommendationContext } = useRecommendationContext();
  const splitDefinition = useMemo(() => split ? getWorkoutSplitDefinition(split as WorkoutSplit) : null, [split]);
  const workoutSplit = splitDefinition ? split as WorkoutSplit : undefined;
  const recommendationExposure = useRef<{
    workoutId?: string; impressions: Map<string, number>; timers: Map<string, { rank: number; timeout: ReturnType<typeof setTimeout> }>;
  }>({ workoutId, impressions: new Map(), timers: new Map() });
  const skippedExerciseIds = useMemo(() => skipped.workoutId === workoutId ? skipped.ids : [], [skipped, workoutId]);
  const workoutExerciseIds = useMemo(() => workoutExercises.map((exercise) => exercise.id), [workoutExercises]);
  const splitExercises = useMemo(() => exercises.filter((exercise) => matchesSplit(exercise, split, splitDefinition?.muscles)), [split, splitDefinition]);
  const muscleOptions = useMemo(() => uniqueSorted(splitExercises.flatMap(getPrimaryMuscles)), [splitExercises]);
  const equipmentOptions = useMemo(() => [...uniqueSorted(splitExercises.map((exercise) => exercise.equipment)), staticFilter], [splitExercises]);
  const matchingExercises = useMemo(() => {
    return exercises.filter((exercise) =>
      // A typed name searches everything (abs on push day); browsing stays scoped to the split.
      (query.trim() !== '' || matchesSplit(exercise, split, splitDefinition?.muscles)) && matchesMuscle(exercise, muscleFilters) && matchesEquipment(exercise, equipmentFilters)
    );
  }, [equipmentFilters, muscleFilters, query, split, splitDefinition]);

  const hasActiveFilters = Boolean(query || muscleFilters.length || equipmentFilters.length);
  const workoutExerciseKey = workoutExerciseIds.slice().sort().join('|');
  // Sets within an already-selected exercise do not change the exercise-ID
  // list. Keep a separate revision so ranking is recalculated after every
  // logged set, not only when a new exercise is added.
  const workoutSetRevision = `${visit?.sets ?? 0}:${visit?.volume ?? 0}`;
  const coverage = useMemo(() => getWorkoutCoverage(workoutExerciseIds), [workoutExerciseIds]);
  const recommendations = useMemo(() => {
    void workoutExerciseKey; void workoutSetRevision;
    if (!showWorkoutRecommendations || !workoutId || !workoutSplit) return [];
    return getExerciseRecommendations(workoutId, workoutSplit, 3, { ...recommendationContext, excludedExerciseIds: skippedExerciseIds });
  }, [recommendationContext, skippedExerciseIds, showWorkoutRecommendations, workoutExerciseKey, workoutId, workoutSetRevision, workoutSplit]);
  const rankedExerciseScores = useMemo(() => {
    void workoutExerciseKey; void workoutSetRevision;
    if (!showWorkoutRecommendations || !workoutId || !workoutSplit) return new Map<string, number>();
    // Cache the full ranking for this workout revision/context; search and
    // filters reuse its order without reading history or rescoring movements.
    return new Map(getRankedExercises(workoutId, workoutSplit, recommendationContext)
      .map(({ exercise }, index) => [exercise.id, -index]));
  }, [recommendationContext, showWorkoutRecommendations, workoutExerciseKey, workoutId, workoutSetRevision, workoutSplit]);
  const results = useMemo(() => searchExercises(matchingExercises, query, (a, b) => {
    if (sort === 'ranked') {
      const difference = (rankedExerciseScores.get(b.id) ?? -Infinity) - (rankedExerciseScores.get(a.id) ?? -Infinity);
      if (difference) return difference;
    }
    return sort === 'area' ? a.area.localeCompare(b.area) || a.name.localeCompare(b.name) : sort === 'equipment' ? a.equipment.localeCompare(b.equipment) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name);
  }), [matchingExercises, query, rankedExerciseScores, sort]);

  const refreshVisit = useCallback(() => {
    if (!workoutId) return;
    const current = getWorkoutVisitSummary(workoutId);
    const currentExercises = getWorkoutVisitExercises(workoutId);
    setWorkoutExercises((previous) => currentExercises.length === previous.length
      && currentExercises.every((exercise, index) => exercise.id === previous[index]?.id && exercise.sets === previous[index].sets && exercise.volume === previous[index].volume)
      ? previous
      : currentExercises);
    setVisit((previous) => {
      if (!current || (previous
        && previous.sets === current.sets
        && previous.exercises === current.exercises
        && previous.volume === current.volume
        && previous.workout.endedAt?.getTime() === current.workout.endedAt?.getTime())) return previous;
      return current;
    });
  }, [workoutId]);

  useFocusEffect(useCallback(() => {
    setScreenFocused(true);
    refreshVisit();
    return () => setScreenFocused(false);
  }, [refreshVisit]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);


  useEffect(() => {
    const exposure = recommendationExposure.current;
    if (exposure.workoutId !== workoutId) {
      exposure.timers.forEach(({ timeout }) => clearTimeout(timeout));
      recommendationExposure.current = { workoutId, impressions: new Map(), timers: new Map() };
    }
    const current = recommendationExposure.current;
    if (!screenFocused || !appActive || catalogOpen) {
      current.timers.forEach(({ timeout }) => clearTimeout(timeout));
      current.timers.clear();
      return;
    }
    const visibleIds = new Set(recommendations.map(({ exercise }) => exercise.id));
    current.timers.forEach(({ timeout }, exerciseId) => {
      if (!visibleIds.has(exerciseId)) { clearTimeout(timeout); current.timers.delete(exerciseId); }
    });
    recommendations.forEach(({ exercise }, index) => {
      const rank = index + 1;
      const pending = current.timers.get(exercise.id);
      if (current.impressions.has(exercise.id) || pending?.rank === rank) return;
      if (pending) clearTimeout(pending.timeout);
      const timeout = setTimeout(() => {
        current.timers.delete(exercise.id);
        current.impressions.set(exercise.id, rank);
        if (workoutId) recordRecommendationFeedback(workoutId, exercise.id, 'impression', rank);
      }, meaningfulExposureMs);
      current.timers.set(exercise.id, { rank, timeout });
    });
  }, [appActive, catalogOpen, recommendations, screenFocused, workoutId]);

  useEffect(() => () => recommendationExposure.current.timers.forEach(({ timeout }) => clearTimeout(timeout)), []);

  // Reopening a completed exercise is not a recommendation signal.
  const openExercise = useCallback((exercise: Exercise, source: 'recommended' | 'manual' | 'completed', recommendation?: ExerciseRecommendation) => {
    if (workoutId && source === 'manual') recordRecommendationFeedback(workoutId, exercise.id, 'manual');
    setCatalogOpen(false);
    router.push({ pathname: '/workout', params: {
      ...exercise,
      workoutId: workoutId ?? fallbackWorkoutId,
      ...(recommendation && { recommendedSets: recommendation.sets }),
    } });
  }, [fallbackWorkoutId, workoutId]);
  const chooseExercise = useCallback((exercise: Exercise) => openExercise(exercise, 'manual'), [openExercise]);

  const skipRecommendation = (exerciseId: string) => {
    if (workoutId) recordRecommendationFeedback(workoutId, exerciseId, 'skipped');
    setOpenSwipeId(null);
    setSkipped((current) => {
      const ids = current.workoutId === workoutId ? current.ids : [];
      return { workoutId, ids: ids.includes(exerciseId) ? ids : [...ids, exerciseId] };
    });
  };

  const finishVisit = () => {
    if (!workoutId || !endWorkout(workoutId)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    const completed = new Set(workoutExerciseIds);
    const alreadySkipped = new Set(skippedExerciseIds);
    recommendationExposure.current.impressions.forEach((rank, exerciseId) => {
      if (!completed.has(exerciseId) && !alreadySkipped.has(exerciseId)) recordRecommendationFeedback(workoutId, exerciseId, 'skipped', rank);
    });
    void syncWorkoutData().catch(() => { /* Local completion is never blocked; the next completion retries the full snapshot. */ });
    router.replace({ pathname: '/summary', params: { workoutId } });
  };

  const doneCount = workoutExercises.length;
  return <SafeAreaView onTouchStart={() => { if (openSwipeId) setOpenSwipeId(null); }} style={[styles.safeArea, { backgroundColor: colors.background }]}>
    <ScrollView style={styles.recommendationScroll} contentContainerStyle={[styles.recommendationContent, { paddingBottom: sheetHeight + 31 }]} showsVerticalScrollIndicator={false}>
      <View style={styles.heroRow}>
        <Text style={[styles.heroTitle, { color: colors.text }]}>Active workout</Text>
        <Pressable onPress={() => router.navigate('/')} hitSlop={4} style={({ pressed }) => [styles.homeAction, { backgroundColor: colors.surface }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel="Go home. Your workout keeps running." accessibilityHint="Resume it from Home or the plus button"><Home width={15} height={15} color={colors.text} strokeWidth={2.4} /><Text style={[styles.homeActionText, { color: colors.text }]}>Home</Text></Pressable>
      </View>
      <View style={styles.statStrip}>
        {[[visit?.sets ?? 0, 'sets'], [Math.round(visit?.volume ?? 0).toLocaleString(), 'lb moved'], [doneCount, doneCount === 1 ? 'exercise' : 'exercises']].map(([value, label], index) => <View key={label} style={[styles.statCell, index > 0 && [styles.statDivider, { borderColor: colors.surfaceStrong }]]}><Text style={[styles.statValue, { color: colors.text }]}>{value}</Text><Text style={[styles.statLabel, { color: colors.mutedText }]}>{label}</Text></View>)}
      </View>
      <Pressable onPress={() => setCatalogOpen(true)} style={({ pressed }) => [styles.searchPill, { backgroundColor: colors.surface }, pressed && ui.pressed]} accessibilityRole="search" accessibilityLabel="Search all exercises"><Search width={18} height={18} color={colors.mutedText} strokeWidth={2.5} /><Text style={[styles.searchPillText, { color: colors.subtleText }]}>Search {splitExercises.length} exercises</Text></Pressable>
      {recommendations.length > 0 && <View collapsable={false} style={styles.recommendationList}>
        {recommendations.map((recommendation, index) => <Animated.View key={recommendation.exercise.id} entering={FadeIn} exiting={FadeOutLeft} layout={LinearTransition}>{index === 1 && <SectionLabel title="Or swap for" hint="Swipe to skip" />}<RecommendationCard recommendation={recommendation} featured={index === 0} open={openSwipeId === recommendation.exercise.id} onSwipeOpen={() => setOpenSwipeId(recommendation.exercise.id)} onDismiss={() => setOpenSwipeId(null)} onOpen={() => openExercise(recommendation.exercise, 'recommended', recommendation)} onSkip={() => skipRecommendation(recommendation.exercise.id)} /></Animated.View>)}
      </View>}
      <Animated.View layout={LinearTransition} style={styles.completedSection}>
        <SectionLabel title="Done today" hint={doneCount > 0 ? String(doneCount) : undefined} />
        {doneCount > 0
          ? workoutExercises.map((completed) => { const exercise = exercises.find(({ id }) => id === completed.id); return <Animated.View key={completed.id} entering={FadeIn} layout={LinearTransition}><Pressable onPress={() => { if (exercise) openExercise(exercise, 'completed'); }} style={({ pressed }) => [styles.listRow, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`${completed.name}, ${completed.sets} completed ${completed.sets === 1 ? 'set' : 'sets'}`} accessibilityHint="Opens the exercise to add sets"><ExerciseThumb exercise={exercise} size={52} done /><View style={styles.rowCopy}><Text numberOfLines={1} style={[styles.recommendationName, { color: colors.text }]}>{completed.name}</Text><Text style={[styles.recommendationMeta, { color: colors.mutedText }]}>{completed.sets} {completed.sets === 1 ? 'set' : 'sets'}{completed.volume > 0 ? ` · ${Math.round(completed.volume).toLocaleString()} lb` : ''}</Text></View><Plus width={18} height={18} color={colors.mutedText} strokeWidth={2.5} /></Pressable></Animated.View>; })
          : <Text style={[styles.completedEmpty, { color: colors.mutedText }]}>Log a set and it lands here.</Text>}
      </Animated.View>
    </ScrollView>

    <ExerciseCatalog visible={catalogOpen} query={query} onQueryChange={setQuery} muscleOptions={muscleOptions} muscleFilters={muscleFilters} onMuscleFiltersChange={setMuscleFilters} equipmentOptions={equipmentOptions} equipmentFilters={equipmentFilters} onEquipmentFiltersChange={setEquipmentFilters} results={results} hasActiveFilters={hasActiveFilters} sort={sort} showSorts={showSorts} onToggleSorts={() => setShowSorts((visible) => !visible)} onSort={(next) => { setSort(next); setShowSorts(false); }} onClear={() => { setQuery(''); setMuscleFilters([]); setEquipmentFilters([]); }} onChoose={chooseExercise} onClose={() => { setShowSorts(false); setCatalogOpen(false); }} />
    <CurrentVisit visit={visit} coverage={coverage} onEnd={finishVisit} onHeight={setSheetHeight} />
  </SafeAreaView>;
}

function RecommendationCard({ recommendation, featured, open, onSwipeOpen, onDismiss, onOpen, onSkip }: { recommendation: ExerciseRecommendation; featured: boolean; open: boolean; onSwipeOpen: () => void; onDismiss: () => void; onOpen: () => void; onSkip: () => void }) {
  const { colors } = useAppearance();
  const { exercise } = recommendation;
  const swipeRef = useRef<Swipeable>(null);
  const cancelTapRef = useRef(false);
  useEffect(() => { if (!open) swipeRef.current?.close(); }, [open]);
  const ink = featured ? colors.accentText : colors.text;
  const { min, max } = recommendation.reps;
  const reps = min === max ? String(min) : `${min}–${max}`;
  const plan = [[String(recommendation.sets), recommendation.sets === 1 ? 'set' : 'sets'], [reps, 'reps'], [`${recommendation.restSeconds}s`, 'rest']];
  const meta = `${exerciseMuscleLabel(exercise)} · ${exercise.equipment}`;
  return <View style={{ backgroundColor: colors.background }}>
    <Swipeable
      ref={swipeRef}
      containerStyle={styles.recommendationShell}
      friction={1.6}
      rightThreshold={48}
      overshootRight={false}
      renderRightActions={() => <Pressable onTouchStart={(event) => event.stopPropagation()} onPress={onSkip} style={({ pressed }) => [styles.swipeAction, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`Skip ${exercise.name}`}><Text style={styles.swipeActionText}>Skip</Text></Pressable>}
      onSwipeableWillOpen={onSwipeOpen}
      onSwipeableClose={() => { cancelTapRef.current = false; }}
    >
      <Pressable
        onTouchStart={() => { if (open) { cancelTapRef.current = true; onDismiss(); } }}
        onPress={() => { if (cancelTapRef.current) { cancelTapRef.current = false; return; } onOpen(); }}
        style={({ pressed }) => [featured ? [styles.heroCard, { backgroundColor: colors.accent }] : [styles.listRow, { backgroundColor: colors.background }], pressed && ui.pressed]}
        accessibilityRole="button"
        accessibilityLabel={featured ? `Start ${exercise.name}, up next, ${plan.map((item) => item.join(' ')).join(', ')}` : `Start ${exercise.name}`}
        accessibilityHint="Swipe left to reveal Skip"
      >
        {featured ? <>
          <View style={styles.heroTop}>
            <View style={styles.rowCopy}>
              <Text style={[styles.heroName, { color: ink }]}>{exercise.name}</Text>
              <Text numberOfLines={1} style={[styles.recommendationMeta, styles.heroMeta, { color: ink }]}>{meta}</Text>
            </View>
            <ExerciseThumb exercise={exercise} size={88} />
          </View>
          <View style={styles.heroPlan}>{plan.map(([value, label]) => <View key={label} style={styles.heroPlanItem}><Text style={[styles.heroPlanValue, { color: ink }]}>{value}</Text><Text style={[styles.heroPlanLabel, { color: ink }]}>{label}</Text></View>)}</View>
          {recommendation.relativeLoadPercent !== undefined && <Text style={[styles.recommendationMeta, styles.heroMeta, { color: ink }]}>Last load: {recommendation.relativeLoadPercent}% of bodyweight</Text>}
          <View style={[styles.heroStart, { backgroundColor: colors.accentText }]}><Text style={[styles.heroStartText, { color: colors.accent }]}>Start</Text><ChevronRight width={18} height={18} color={colors.accent} strokeWidth={3} /></View>
        </> : <>
          <ExerciseThumb exercise={exercise} size={52} />
          <View style={styles.rowCopy}>
            <Text numberOfLines={1} style={[styles.recommendationName, { color: ink }]}>{exercise.name}</Text>
            <Text numberOfLines={1} style={[styles.recommendationMeta, { color: colors.mutedText }]}>{meta}</Text>
          </View>
          <Text style={[styles.rowPlan, { color: colors.text }]}>{recommendation.sets}×{reps}</Text>
        </>}
      </Pressable>
    </Swipeable>
  </View>;
}

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  const { colors } = useAppearance();
  return <View style={styles.sectionLabel}><Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>{!!hint && <Text style={[styles.sectionHint, { color: colors.subtleText }]}>{hint}</Text>}</View>;
}

function ExerciseCatalog({ visible, query, onQueryChange, muscleOptions, muscleFilters, onMuscleFiltersChange, equipmentOptions, equipmentFilters, onEquipmentFiltersChange, results, hasActiveFilters, sort, showSorts, onToggleSorts, onSort, onClear, onChoose, onClose }: { visible: boolean; query: string; onQueryChange: (value: string) => void; muscleOptions: string[]; muscleFilters: string[]; onMuscleFiltersChange: (values: string[]) => void; equipmentOptions: string[]; equipmentFilters: string[]; onEquipmentFiltersChange: (values: string[]) => void; results: Exercise[]; hasActiveFilters: boolean; sort: Sort; showSorts: boolean; onToggleSorts: () => void; onSort: (sort: Sort) => void; onClear: () => void; onChoose: (exercise: Exercise) => void; onClose: () => void }) {
  const { colors } = useAppearance();
  const renderItem = useCallback(({ item }: { item: Exercise }) => <ExerciseRow exercise={item} onChoose={onChoose} />, [onChoose]);
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}><View style={styles.sheetOverlay}><Animated.View entering={FadeIn.duration(180)} style={styles.sheetBackdrop}><Pressable onPress={onClose} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close exercise library" /></Animated.View><Animated.View entering={SlideInDown.duration(280)} style={[styles.sheet, { backgroundColor: colors.background }]}><View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} /><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.text }]}>Exercise library</Text><Text style={[styles.sheetSubtitle, { color: colors.mutedText }]}>Find your own movement</Text></View><Pressable onPress={onClose} hitSlop={10} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close"><X width={20} height={20} color={colors.text} strokeWidth={2.5} /></Pressable></View>
    <View style={styles.searchWrap}><ExerciseSearchControls query={query} onQueryChange={onQueryChange} muscleOptions={muscleOptions} muscleFilters={muscleFilters} onMuscleFiltersChange={onMuscleFiltersChange} equipmentOptions={equipmentOptions} equipmentFilters={equipmentFilters} onEquipmentFiltersChange={onEquipmentFiltersChange} /></View>
    <FlatList data={results} keyExtractor={(exercise) => exercise.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.catalogList} ListHeaderComponentStyle={styles.listHeaderContainer} ListHeaderComponent={<View style={styles.listHeader}><Text style={[ui.eyebrow, { color: colors.mutedText }]}>{hasActiveFilters ? `${results.length} ${results.length === 1 ? 'MOVEMENT' : 'MOVEMENTS'}` : 'ALL EXERCISES'}</Text><>{query.trim() ? <Text style={[styles.sortValue, { color: colors.mutedText }]}>Best match</Text> : <Pressable onPress={onToggleSorts} hitSlop={6} style={styles.sortButton} accessibilityRole="button" accessibilityLabel={`Sort by ${sortLabels[sort]}`} accessibilityState={{ expanded: showSorts }}><Text style={[styles.sortPrefix, { color: colors.subtleText }]}>SORT:</Text><Text style={[styles.sortValue, { color: colors.text }]}>{sortLabels[sort]}</Text><ChevronDown width={14} height={14} color={colors.text} strokeWidth={2.6} /></Pressable>}</>{!query.trim() && showSorts && <View style={[styles.sortMenu, { backgroundColor: colors.background, borderColor: colors.surfaceStrong }]}>{(Object.keys(sortLabels) as Sort[]).map((option) => <Pressable key={option} onPress={() => onSort(option)} style={styles.sortOption} accessibilityRole="button" accessibilityState={{ selected: option === sort }}><Text style={[styles.sortOptionText, { color: colors.mutedText }, option === sort && { color: colors.text }]}>{sortLabels[option]}</Text>{option === sort && <Check width={16} height={16} color={colors.text} strokeWidth={3} />}</Pressable>)}</View>}</View>} ListEmptyComponent={<EmptyState query={query} onClear={onClear} />} renderItem={renderItem} />
  </Animated.View></View></Modal>;
}

function CurrentVisit({ visit, coverage, onEnd, onHeight }: { visit: WorkoutVisitSummary | null; coverage: ReturnType<typeof getWorkoutCoverage>; onEnd: () => void; onHeight: (height: number) => void }) {
	const { colors } = useAppearance();
  const { bottom } = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  useEffect(() => {
    // Schedule each refresh for the next elapsed-time boundary. The elapsed
    // value is always derived from when this workout was created, never from
    // when this screen was opened.
    let timeout: ReturnType<typeof setTimeout>;
    const refreshTimer = () => {
      setNow(Date.now());
      timeout = setTimeout(refreshTimer, 1_000 - (Date.now() % 1_000));
    };
    refreshTimer();
    return () => clearTimeout(timeout);
  }, [visit?.workout.createdAt]);
  useEffect(() => {
    if (!confirmEnd) return;
    const timeout = setTimeout(() => setConfirmEnd(false), 2_000);
    return () => clearTimeout(timeout);
  }, [confirmEnd]);
  if (!visit || visit.workout.endedAt) return null;
  const workoutStartedAt = visit.workout.createdAt.getTime();
  const seconds = Math.max(0, Math.floor((now - workoutStartedAt) / 1_000));
  const duration = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const toggleExpanded = () => {
    LayoutAnimation.configureNext({ duration: 240, update: { type: LayoutAnimation.Types.easeInEaseOut }, create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity }, delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } });
    setExpanded((value) => !value);
  };
  return <View onLayout={(event) => onHeight(event.nativeEvent.layout.height)} style={[styles.visitCard, { bottom: bottom + 15, backgroundColor: colors.surface, borderColor: colors.surfaceStrong }]} accessibilityLabel={`Current ${workoutSplitLabel(visit.workout.split)} workout, duration ${duration}`}>
    <Pressable onPress={toggleExpanded} style={styles.visitHeading} accessibilityRole="button" accessibilityLabel="Show workout muscle coverage" accessibilityState={{ expanded }}><Text style={[styles.visitTitle, { color: colors.text }]}>{workoutSplitLabel(visit.workout.split)} day</Text><View style={styles.visitTime}><Text style={[styles.visitTimeText, { color: colors.text }]}>{duration}</Text><ChevronDown width={17} height={17} color={colors.mutedText} strokeWidth={2.7} style={[styles.visitChevron, expanded && styles.visitChevronExpanded]} /></View></Pressable>
    {expanded && <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={styles.coveragePanel}><MuscleCoverageGraphic split={visit.workout.split} targetMuscles={getWorkoutSplitDefinition(visit.workout.split)?.muscles} primaryMuscles={coverage.primary} secondaryMuscles={coverage.secondary} /><View pointerEvents="none" style={styles.missedLegend}><View style={[styles.missedLegendDot, { backgroundColor: colors.mutedText }]} /><Text style={[styles.missedLegendText, { color: colors.text }]}>Not trained yet</Text></View></Animated.View>}
    <Pressable onPress={() => confirmEnd ? onEnd() : setConfirmEnd(true)} style={({ pressed }) => [styles.endVisitButton, { backgroundColor: colors.accent }, pressed && styles.endVisitButtonPressed]} accessibilityRole="button" accessibilityLabel={confirmEnd ? 'Confirm end workout' : 'End workout'}><View pointerEvents="none" style={styles.endVisitLabel}><Animated.Text key={confirmEnd ? 'confirm' : 'end'} entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={[styles.endVisitText, { color: colors.accentText }]}>{confirmEnd ? 'Confirm' : 'End workout'}</Animated.Text></View></Pressable>
  </View>;
}

function getWorkoutCoverage(workoutExerciseIds: readonly string[]) {
  const visitExercises = new Set(workoutExerciseIds);
  const primary = new Set<string>();
  const secondary = new Set<string>();
  for (const exercise of exercises) {
    if (!visitExercises.has(exercise.id)) continue;
    const details = getExerciseMetadata(exercise);
    details.primaryMuscles.forEach((muscle) => primary.add(muscle));
    details.secondaryMuscles.forEach((muscle) => secondary.add(muscle));
  }
  return { primary: [...primary], secondary: [...secondary].filter((muscle) => !primary.has(muscle)) };
}

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) { return <View style={styles.empty}><EmptyArt name="search" /><Text style={styles.emptyTitle}>Nothing found</Text><Text style={styles.emptyCopy}>{query ? `No movements match “${query}”.` : 'No movements match this focus.'}</Text><Pressable onPress={onClear} style={styles.resetButton}><Text style={styles.resetText}>Reset search</Text></Pressable></View>; }

function exerciseMuscleLabel(exercise: Exercise) {
  const muscles = getPrimaryMuscles(exercise);
  return muscles.length ? muscles.map(formatLabel).join(' · ') : exercise.area;
}

function matchesSplit(exercise: Exercise, split?: string, splitMuscles?: string[]) {
  if (!split) return true;
  const primaryMuscles = getPrimaryMuscles(exercise);
  const hasPrimary = (muscle: string) => primaryMuscles.includes(muscle);
  if (split.startsWith('custom:')) return hasPrimary('abdominals') || (splitMuscles?.some(hasPrimary) ?? true);
  // Core work is a shared accessory across lifting splits.
  if (splitMuscles && hasPrimary('abdominals')) return true;
  if (split === 'chest') return exercise.area === 'CHEST';
  if (split === 'back') return exercise.area === 'BACK';
  if (split === 'legs') return exercise.area === 'LEGS';
  if (split === 'push') return exercise.area === 'CHEST' || exercise.area === 'SHOULDERS' || hasPrimary('triceps');
  if (split === 'pull') return exercise.area === 'BACK' || hasPrimary('biceps') || hasPrimary('forearms');
  return true;
}

const ExerciseRow = memo(function ExerciseRow({ exercise, onChoose }: { exercise: Exercise; onChoose: (exercise: Exercise) => void }) { const { colors } = useAppearance(); return <Pressable onPress={() => onChoose(exercise)} style={({ pressed }) => [styles.row, { borderColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`Add ${exercise.name}`}><ExerciseThumb exercise={exercise} size={46} /><View style={styles.rowCopy}><Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{exercise.name}</Text><View style={styles.metaRow}><Text numberOfLines={1} style={[styles.area, { color: colors.mutedText }]}>{exerciseMuscleLabel(exercise)}</Text><View style={[styles.metaDot, { backgroundColor: colors.subtleText }]} /><Text numberOfLines={1} style={[styles.equipment, { color: colors.mutedText }]}>{exercise.equipment}</Text></View></View></Pressable>; });

const styles = StyleSheet.create({
  safeArea: { flex: 1, position: 'relative', backgroundColor: '#F9F9F7' },
  recommendationScroll: { flex: 1 },
  recommendationContent: { paddingHorizontal: 24, paddingTop: 28 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  homeAction: { height: 36, paddingHorizontal: 13, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  homeActionText: { fontSize: 13, fontWeight: '800' },
  heroTitle: { flexShrink: 1, fontSize: 36, lineHeight: 38, fontWeight: '900', letterSpacing: -1.8 },
  statStrip: { marginTop: 18, flexDirection: 'row' },
  statCell: { flex: 1, paddingLeft: 14 },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth },
  statValue: { fontSize: 24, lineHeight: 28, fontWeight: '900', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  statLabel: { marginTop: 1, fontSize: 11, fontWeight: '800' },
  searchPill: { height: 50, marginTop: 22, paddingHorizontal: 16, borderRadius: 25, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchPillText: { fontSize: 15, fontWeight: '800' },
  recommendationList: { marginTop: 22 },
  recommendationShell: { overflow: 'visible' },
  listRow: { minHeight: 72, paddingVertical: 10, borderRadius: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 14 },
  recommendationName: { fontSize: 16, lineHeight: 20, fontWeight: '900', letterSpacing: -.45 },
  recommendationMeta: { marginTop: 3, fontSize: 12, lineHeight: 16, fontWeight: '700', textTransform: 'capitalize' },
  rowPlan: { fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -.3 },
  heroCard: { padding: 20, gap: 18, borderRadius: 26, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  heroName: { fontSize: 28, lineHeight: 31, fontWeight: '900', letterSpacing: -1.1 },
  heroMeta: { opacity: .72 },
  heroPlan: { flexDirection: 'row' },
  heroPlanItem: { flex: 1 },
  heroPlanValue: { fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: -1.2 },
  heroPlanLabel: { fontSize: 12, fontWeight: '800', opacity: .7 },
  heroStart: { height: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  heroStartText: { fontSize: 16, fontWeight: '900', letterSpacing: -.3 },
  sectionLabel: { marginTop: 22, marginBottom: 2, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900', letterSpacing: -.5 },
  sectionHint: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  swipeAction: { width: 80, marginLeft: 12, borderRadius: 17, backgroundColor: '#D9433F', alignItems: 'center', justifyContent: 'center' },
  swipeActionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  completedSection: { marginTop: 4 },
  completedEmpty: { marginTop: 7, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.38)' },
  sheet: { height: '92%', paddingTop: 9, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetHeader: { minHeight: 76, paddingHorizontal: 24, paddingTop: 17, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 23, lineHeight: 27, fontWeight: '900', letterSpacing: -.8 },
  sheetSubtitle: { marginTop: 2, fontSize: 12, fontWeight: '700' },
  closeButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 24, paddingBottom: 10 },
  catalogList: { paddingHorizontal: 24, paddingBottom: 38 },
  listHeaderContainer: { zIndex: 100, elevation: 100, overflow: 'visible' },
  listHeader: { position: 'relative', zIndex: 100, overflow: 'visible', height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortButton: { height: 32, paddingHorizontal: 5, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortPrefix: { fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  sortValue: { fontSize: 11, fontWeight: '900' },
  sortMenu: { position: 'absolute', zIndex: 1000, elevation: 1000, top: 34, right: 0, width: 180, borderRadius: 16, borderWidth: 1, paddingVertical: 5, ...Platform.select({ web: { boxShadow: '0px 7px 18px rgba(33, 58, 40, 0.1)' }, default: { shadowColor: '#213A28', shadowOpacity: .1, shadowRadius: 18, shadowOffset: { width: 0, height: 7 } } }) },
  sortOption: { height: 43, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortOptionText: { fontSize: 14, fontWeight: '700' },
  row: { minHeight: 66, paddingVertical: 10, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCopy: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '900', letterSpacing: -.45 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  area: { fontSize: 9, fontWeight: '900', letterSpacing: .8 },
  metaDot: { width: 3, height: 3, borderRadius: 2 },
  equipment: { flexShrink: 1, fontSize: 11, fontWeight: '700' },
  visitCard: { position: 'absolute', zIndex: 1000, elevation: 20, left: 0, right: 0, overflow: 'hidden', marginHorizontal: 24, paddingTop: 16, paddingHorizontal: 16, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, ...Platform.select({ web: { boxShadow: '0px 8px 15px rgba(12, 14, 10, 0.16)' }, default: { shadowColor: '#0C0E0A', shadowOpacity: .16, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } } }) },
  visitHeading: { minHeight: 29, flexDirection: 'row', alignItems: 'center' },
  visitTime: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  visitTimeText: { fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: .15 },
  visitChevron: { transform: [{ rotate: '0deg' }] },
  visitChevronExpanded: { transform: [{ rotate: '180deg' }] },
  visitTitle: { fontSize: 23, fontWeight: '900', letterSpacing: -.8, textTransform: 'capitalize' },
  coveragePanel: { position: 'relative', marginTop: 12 },
  missedLegend: { position: 'absolute', top: 4, right: 2, flexDirection: 'row', alignItems: 'center', gap: 5 },
  missedLegendDot: { width: 7, height: 7, borderRadius: 4 },
  missedLegendText: { fontSize: 10, fontWeight: '800' },
  endVisitButton: { height: 60, marginTop: 12, marginHorizontal: -16, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  endVisitButtonPressed: { opacity: .78 },
  endVisitLabel: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  endVisitText: { fontSize: 18, fontWeight: '800', letterSpacing: -.3 },


  empty: { paddingTop: 43, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#1B1C17' },
  emptyCopy: { marginTop: 7, fontSize: 13, fontWeight: '600', color: '#7C8177' },
  resetButton: { marginTop: 17, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#EDEEE9' },
  resetText: { fontSize: 12, fontWeight: '900', color: '#1A1B16' },
});
