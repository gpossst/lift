import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Check, ChevronDown, Search, X } from 'react-native-feather';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, FlatList, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { endWorkout, getExerciseRecommendations, getExercises, getWorkoutSplitDefinition, getWorkoutVisits, getWorkoutVisitExercises, getWorkoutVisitSummary, recordRecommendationFeedback, type Exercise, type ExerciseRecommendation, type RecommendationContext, type WorkoutSplit, type WorkoutVisitExercise, type WorkoutVisitSummary } from '@/db';
import { syncWorkoutData } from '@/lib/cloud-sync';
import { getProfile, updateProfile } from '@/lib/profile';
import { takePendingOnboarding, type Onboarding } from '@/lib/onboarding';
import { authClient } from '@/lib/auth-client';
import { MuscleCoverageGraphic } from '@/components/split-body-graphic';
import { workoutSplitLabel } from '@/lib/workout-split-label';
import { useAppearance } from '@/components/appearance-provider';

const exercises = getExercises();
type Sort = 'ranked' | 'az' | 'area' | 'equipment';
const staticFilter = '__static__';
const meaningfulExposureMs = 10_000;

const sortLabels: Record<Sort, string> = { ranked: 'For you', az: 'Name', area: 'Muscle group', equipment: 'Equipment' };

function contextFromOnboarding(value: unknown): RecommendationContext {
  if (!value || typeof value !== 'object') return {};
  const onboarding = value as Partial<Onboarding>;
  return {
    goals: Array.isArray(onboarding.goals) ? onboarding.goals.filter((goal): goal is string => typeof goal === 'string') : undefined,
    experience: onboarding.experience === 'new' || onboarding.experience === 'some' || onboarding.experience === 'experienced' ? onboarding.experience : undefined,
    favoriteExerciseIds: Array.isArray(onboarding.favoriteExerciseIds) ? onboarding.favoriteExerciseIds.filter((id): id is string => typeof id === 'string') : undefined,
    trainingDays: typeof onboarding.trainingDays === 'number' && Number.isFinite(onboarding.trainingDays) ? onboarding.trainingDays : undefined,
    weightLb: typeof onboarding.weightLb === 'number' && Number.isFinite(onboarding.weightLb) ? onboarding.weightLb : undefined,
  };
}

export default function ExerciseLibraryScreen() {
	const { colors, showWorkoutRecommendations } = useAppearance();
	const { data: session } = authClient.useSession();
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
  const [replacements, setReplacements] = useState<{ workoutId?: string; ids: string[] }>({ workoutId, ids: [] });
  const [fallbackWorkoutId] = useState(() => `workout-${Date.now()}`);
  const [recommendationContext, setRecommendationContext] = useState<RecommendationContext>({});
  const [favoritePrompt, setFavoritePrompt] = useState<{ ids: string[]; selected: string[] } | null>(null);
  const [favoriteQuery, setFavoriteQuery] = useState('');
  const [favoriteError, setFavoriteError] = useState('');
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const recommendationExposure = useRef<{
    workoutId?: string; impressions: Map<string, number>; timers: Map<string, { rank: number; timeout: ReturnType<typeof setTimeout> }>;
  }>({ workoutId, impressions: new Map(), timers: new Map() });
  const replacedExerciseIds = useMemo(() => replacements.workoutId === workoutId ? replacements.ids : [], [replacements, workoutId]);
  const workoutExerciseIds = useMemo(() => workoutExercises.map((exercise) => exercise.id), [workoutExercises]);
  const splitExercises = useMemo(() => exercises.filter((exercise) => matchesSplit(exercise, split)), [split]);
  const muscleOptions = useMemo(() => uniqueSorted(splitExercises.flatMap(getPrimaryMuscles)), [splitExercises]);
  const equipmentOptions = useMemo(() => [...uniqueSorted(splitExercises.map((exercise) => exercise.equipment)), staticFilter], [splitExercises]);
  const matchingResults = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return exercises.filter((exercise) => {
      const searchable = `${exercise.name} ${exercise.area} ${exercise.equipment} ${exercise.detailsJson ?? ''}`.toLowerCase();
      return matchesSplit(exercise, split) && matchesMuscle(exercise, muscleFilters) && matchesEquipment(exercise, equipmentFilters) && terms.every((term) => searchable.includes(term));
    });
  }, [equipmentFilters, muscleFilters, query, split]);

  const hasActiveFilters = Boolean(query || muscleFilters.length || equipmentFilters.length);
  const workoutExerciseKey = workoutExerciseIds.slice().sort().join('|');
  // Sets within an already-selected exercise do not change the exercise-ID
  // list. Keep a separate revision so ranking is recalculated after every
  // logged set, not only when a new exercise is added.
  const workoutSetRevision = `${visit?.sets ?? 0}:${visit?.volume ?? 0}`;
  const coverage = useMemo(() => getWorkoutCoverage(workoutExerciseIds), [workoutExerciseIds]);
  const recommendations = useMemo(() => {
    void workoutExerciseKey; void workoutSetRevision;
    if (!showWorkoutRecommendations || !workoutId || !isWorkoutSplit(split)) return [];
    return getExerciseRecommendations(workoutId, split, 3, { ...recommendationContext, excludedExerciseIds: replacedExerciseIds });
  }, [recommendationContext, replacedExerciseIds, showWorkoutRecommendations, split, workoutExerciseKey, workoutId, workoutSetRevision]);
  const rankedExerciseScores = useMemo(() => {
    void workoutExerciseKey; void workoutSetRevision;
    if (!showWorkoutRecommendations || !workoutId || !isWorkoutSplit(split)) return new Map<string, number>();
    // Hidden movements must not consume the ranker's planned muscle coverage.
    const visibleIds = new Set(matchingResults.map((exercise) => exercise.id));
    return new Map(getExerciseRecommendations(workoutId, split, Infinity, {
      ...recommendationContext,
      excludedExerciseIds: exercises.filter((exercise) => !visibleIds.has(exercise.id)).map((exercise) => exercise.id),
    }).map(({ exercise }, index) => [exercise.id, -index]));
  }, [recommendationContext, showWorkoutRecommendations, split, workoutExerciseKey, workoutId, workoutSetRevision, matchingResults]);
  const results = useMemo(() => matchingResults.slice().sort((a, b) => {
    if (sort === 'ranked') {
      const difference = (rankedExerciseScores.get(b.id) ?? -Infinity) - (rankedExerciseScores.get(a.id) ?? -Infinity);
      if (difference) return difference;
    }
    return sort === 'area' ? a.area.localeCompare(b.area) || a.name.localeCompare(b.name) : sort === 'equipment' ? a.equipment.localeCompare(b.equipment) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name);
  }), [matchingResults, rankedExerciseScores, sort]);

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

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      const onboardingContext = contextFromOnboarding(await takePendingOnboarding().catch(() => null));
      if (!active) return;
      setRecommendationContext(onboardingContext);
      const profile = await getProfile().catch(() => null);
      if (!active || !profile) return;
      const preferences = profile.recommendationPreferences ?? {};
      setRecommendationContext({
        goals: preferences.goals ?? onboardingContext.goals,
        experience: preferences.experience ?? onboardingContext.experience,
        favoriteExerciseIds: preferences.favoriteExerciseIds ?? onboardingContext.favoriteExerciseIds,
        trainingDays: preferences.trainingDays ?? onboardingContext.trainingDays,
        sessionMinutes: preferences.sessionMinutes ?? onboardingContext.sessionMinutes,
        weightLb: preferences.weightLb ?? onboardingContext.weightLb,
      });
    })().catch(() => { /* Recommendations keep their local defaults offline. */ });
    return () => { active = false; };
  }, []));

  useFocusEffect(useCallback(() => {
    const userId = session?.user.id;
    if (!userId || !isWorkoutSplit(split) || !screenFocused) return;
    let active = true;
    void (async () => {
      try {
        const key = `lift-split-favorites:${userId}:${split}`;
        const asked = Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) === 'true' : await SecureStore.getItemAsync(key) === 'true';
        if (asked || !active || getWorkoutVisits().some(({ workout }) => workout.split === split)) return;
        const profile = await getProfile().catch(() => null);
        const experience = profile?.recommendationPreferences?.experience ?? recommendationContext.experience;
        if (!active || (experience !== 'some' && experience !== 'experienced')) return;
        const ids = exercises.filter((exercise) => matchesSplit(exercise, split)).sort((a, b) => b.isFeatured - a.isFeatured || a.name.localeCompare(b.name)).map(({ id }) => id);
        const current = profile?.recommendationPreferences?.favoriteExerciseIds ?? [];
        setFavoritePrompt({ ids, selected: current.filter((id) => ids.includes(id)).slice(0, 5) });
        setFavoriteQuery('');
        setFavoriteError('');
      } catch { /* Profile or local storage failures never interrupt a workout. */ }
    })();
    return () => { active = false; };
  }, [recommendationContext.experience, screenFocused, session?.user.id, split]));

  const finishFavoritePrompt = async (save: boolean) => {
    if (!favoritePrompt) return;
    const prompt = favoritePrompt;
    const userId = session?.user.id;
    if (!userId || !isWorkoutSplit(split)) return;
    setFavoriteSaving(true);
    setFavoriteError('');
    try {
      if (save) {
        const latest = await getProfile();
        const existing = latest.recommendationPreferences?.favoriteExerciseIds ?? [];
        const keep = existing.filter((id) => !prompt.ids.includes(id));
        const favorites = [...prompt.selected, ...keep].slice(0, 20);
        await updateProfile({ recommendationPreferences: { favoriteExerciseIds: favorites } });
        setRecommendationContext((current) => ({ ...current, favoriteExerciseIds: favorites }));
      }
      const key = `lift-split-favorites:${userId}:${split}`;
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, 'true');
      else await SecureStore.setItemAsync(key, 'true');
      setFavoritePrompt(null);
    } catch {
      if (save) setFavoriteError('Could not save your favorites. Check your connection and try again.');
      else setFavoritePrompt(null);
    } finally { setFavoriteSaving(false); }
  };

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

  const openExercise = (exercise: Exercise, source: 'recommended' | 'manual', recommendation?: ExerciseRecommendation) => {
    if (workoutId && source === 'manual') recordRecommendationFeedback(workoutId, exercise.id, 'manual');
    setCatalogOpen(false);
    router.push({ pathname: '/workout', params: {
      ...exercise,
      workoutId: workoutId ?? fallbackWorkoutId,
      ...(recommendation && { recommendedSets: recommendation.sets, recommendedRepMin: recommendation.reps.min, recommendedRepMax: recommendation.reps.max, recommendedRestSeconds: recommendation.restSeconds }),
    } });
  };

  const replaceRecommendation = (exerciseId: string) => {
    if (workoutId) recordRecommendationFeedback(workoutId, exerciseId, 'replaced');
    setReplacements((current) => {
      const ids = current.workoutId === workoutId ? current.ids : [];
      return { workoutId, ids: ids.includes(exerciseId) ? ids : [...ids, exerciseId] };
    });
  };

  const finishVisit = () => {
    if (!workoutId || !endWorkout(workoutId)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const completed = new Set(workoutExerciseIds);
    const replaced = new Set(replacedExerciseIds);
    recommendationExposure.current.impressions.forEach((rank, exerciseId) => {
      if (!completed.has(exerciseId) && !replaced.has(exerciseId)) recordRecommendationFeedback(workoutId, exerciseId, 'skipped', rank);
    });
    void syncWorkoutData().catch(() => { /* Local completion is never blocked; the next completion retries the full snapshot. */ });
    router.replace({ pathname: '/summary', params: { workoutId } });
  };

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
    <ScrollView style={styles.recommendationScroll} contentContainerStyle={styles.recommendationContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.heroTitle, { color: colors.text }]}>Active workout</Text>
      {recommendations.length > 0 && <Text style={[styles.recommendationHeading, { color: colors.text }]}>Your next exercise</Text>}
      <View style={styles.recommendationList}>
        {recommendations.map((recommendation, index) => <RecommendationCard key={recommendation.exercise.id} recommendation={recommendation} featured={index === 0} onOpen={() => openExercise(recommendation.exercise, 'recommended', recommendation)} onReplace={() => replaceRecommendation(recommendation.exercise.id)} />)}
      </View>
      <Pressable onPress={() => setCatalogOpen(true)} style={({ pressed }) => [styles.browseButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Browse all"><View><Text style={[styles.browseTitle, { color: colors.text }]}>Browse all</Text><Text style={[styles.browseCopy, { color: colors.mutedText }]}>Search, filter, or choose something else</Text></View><Search width={20} height={20} color={colors.text} strokeWidth={2.5} /></Pressable>
      <View style={styles.completedSection}>
        <Text style={[styles.completedTitle, { color: colors.text }]}>Completed</Text>
        {workoutExercises.length > 0
          ? <View style={styles.completedList}>{workoutExercises.map((exercise) => <View key={exercise.id} style={styles.completedRow} accessibilityLabel={`${exercise.name}, ${exercise.sets} completed ${exercise.sets === 1 ? 'set' : 'sets'}`}><View style={[styles.completedCheck, { backgroundColor: colors.surface }]}><Check width={14} height={14} color={colors.accent} strokeWidth={3} /></View><Text numberOfLines={1} style={[styles.completedName, { color: colors.text }]}>{exercise.name}</Text><Text style={[styles.completedSets, { color: colors.mutedText }]}>{exercise.sets} {exercise.sets === 1 ? 'set' : 'sets'}</Text></View>)}</View>
          : <Text style={[styles.completedEmpty, { color: colors.mutedText }]}>Complete an exercise to see it here.</Text>}
      </View>
    </ScrollView>
    {favoritePrompt && <Modal visible transparent animationType="fade" onRequestClose={() => { void finishFavoritePrompt(false); }}><View style={styles.favoriteOverlay}><View style={[styles.favoriteSheet, { backgroundColor: colors.background }]}><Text style={[styles.favoriteTitle, { color: colors.text }]}>What do you usually enjoy on {getWorkoutSplitDefinition(split as WorkoutSplit)?.name ?? 'this'} day?</Text><Text style={[styles.favoriteSubtitle, { color: colors.mutedText }]}>Choose exercises that should shape your recommendations.</Text><Text style={[styles.favoriteCount, { color: colors.mutedText }]}>{favoritePrompt.selected.length} of 5 selected</Text><View style={[styles.favoriteSearch, { backgroundColor: colors.surface }]}><Search width={17} height={17} color={colors.mutedText} /><TextInput value={favoriteQuery} onChangeText={setFavoriteQuery} placeholder="Search exercises" placeholderTextColor={colors.subtleText} autoCapitalize="none" autoCorrect={false} style={[styles.favoriteSearchInput, { color: colors.text }]} accessibilityLabel="Search split exercises" /></View><ScrollView style={styles.favoriteChoices}>{favoritePrompt.ids.filter((id) => { const exercise = exercises.find((item) => item.id === id); return exercise && (!favoriteQuery.trim() ? favoritePrompt.ids.indexOf(id) < 12 : exercise.name.toLowerCase().includes(favoriteQuery.trim().toLowerCase())); }).map((id) => { const exercise = exercises.find((item) => item.id === id); if (!exercise) return null; const selected = favoritePrompt.selected.includes(id); const atLimit = favoritePrompt.selected.length >= 5; return <Pressable key={id} disabled={!selected && atLimit || favoriteSaving} onPress={() => setFavoritePrompt((current) => current && ({ ...current, selected: selected ? current.selected.filter((value) => value !== id) : [...current.selected, id] }))} style={[styles.favoriteChoice, { borderColor: colors.surfaceStrong }, !selected && atLimit && styles.favoriteChoiceDisabled]} accessibilityRole="checkbox" accessibilityState={{ checked: selected, disabled: !selected && atLimit }}><Text style={[styles.favoriteChoiceText, { color: colors.text }]}>{exercise.name}</Text>{selected && <Check width={18} height={18} color={colors.accent} strokeWidth={3} />}</Pressable>; })}</ScrollView>{favoriteError ? <Text style={[styles.favoriteError, { color: '#C43F36' }]}>{favoriteError}</Text> : null}<Pressable disabled={favoriteSaving} onPress={() => { void finishFavoritePrompt(true); }} style={[styles.favoriteSave, { backgroundColor: colors.accent }, favoriteSaving && styles.favoriteChoiceDisabled]}><Text style={[styles.favoriteSaveText, { color: colors.accentText }]}>{favoriteSaving ? 'Saving…' : 'Save favorites'}</Text></Pressable><Pressable disabled={favoriteSaving} onPress={() => { void finishFavoritePrompt(false); }} style={styles.favoriteSkip}><Text style={[styles.favoriteSkipText, { color: colors.mutedText }]}>Skip</Text></Pressable></View></View></Modal>}
    <ExerciseCatalog visible={catalogOpen} query={query} onQueryChange={setQuery} muscleOptions={muscleOptions} muscleFilters={muscleFilters} onMuscleFiltersChange={setMuscleFilters} equipmentOptions={equipmentOptions} equipmentFilters={equipmentFilters} onEquipmentFiltersChange={setEquipmentFilters} results={results} hasActiveFilters={hasActiveFilters} sort={sort} showSorts={showSorts} onToggleSorts={() => setShowSorts((visible) => !visible)} onSort={(next) => { setSort(next); setShowSorts(false); }} onClear={() => { setQuery(''); setMuscleFilters([]); setEquipmentFilters([]); }} onChoose={(exercise) => openExercise(exercise, 'manual')} onClose={() => { setShowSorts(false); setCatalogOpen(false); }} />
    <CurrentVisit visit={visit} coverage={coverage} onEnd={finishVisit} onRefresh={refreshVisit} />
  </SafeAreaView>;
}

function RecommendationCard({ recommendation, featured, onOpen, onReplace }: { recommendation: ExerciseRecommendation; featured: boolean; onOpen: () => void; onReplace: () => void }) {
  const { colors } = useAppearance();
  const { exercise } = recommendation;
  const swipeAction = () => <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.swipeAction, { backgroundColor: colors.accent }]}><Text style={[styles.swipeActionText, { color: colors.accentText }]}>Swap</Text></View>;
  return <View style={[styles.recommendationShell, { backgroundColor: colors.accent }]}>
    <Swipeable
      friction={1.6}
      leftThreshold={64}
      rightThreshold={64}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={swipeAction}
      renderRightActions={swipeAction}
      onSwipeableOpen={(_, swipeable) => { swipeable.close(); onReplace(); }}
    >
      <Pressable
        onPress={onOpen}
        onAccessibilityAction={({ nativeEvent }) => nativeEvent.actionName === 'swap' ? onReplace() : onOpen()}
        style={({ pressed }) => [styles.recommendationCard, { backgroundColor: colors.surface }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Start ${exercise.name}`}
        accessibilityHint="Swipe either direction to swap this exercise"
        accessibilityActions={[{ name: 'activate', label: 'Start exercise' }, { name: 'swap', label: 'Swap exercise' }]}
      >
        <Text style={[styles.recommendationName, { color: colors.text }]}>{exercise.name}</Text>
        <Text numberOfLines={1} style={[styles.recommendationMeta, { color: colors.mutedText }, featured && styles.recommendationMetaWithBadge]}>{exerciseMuscleLabel(exercise)} · {exercise.equipment}</Text>
        {recommendation.relativeLoadPercent !== undefined && <Text style={[styles.recommendationMeta, { color: colors.mutedText }]}>Last logged load: {recommendation.relativeLoadPercent}% of your bodyweight</Text>}
        {featured && <View style={[styles.nextBadge, { backgroundColor: colors.accent }]}><Text style={[styles.nextBadgeText, { color: colors.accentText }]}>Up next</Text></View>}
      </Pressable>
    </Swipeable>
  </View>;
}

function ExerciseCatalog({ visible, query, onQueryChange, muscleOptions, muscleFilters, onMuscleFiltersChange, equipmentOptions, equipmentFilters, onEquipmentFiltersChange, results, hasActiveFilters, sort, showSorts, onToggleSorts, onSort, onClear, onChoose, onClose }: { visible: boolean; query: string; onQueryChange: (value: string) => void; muscleOptions: string[]; muscleFilters: string[]; onMuscleFiltersChange: (values: string[]) => void; equipmentOptions: string[]; equipmentFilters: string[]; onEquipmentFiltersChange: (values: string[]) => void; results: Exercise[]; hasActiveFilters: boolean; sort: Sort; showSorts: boolean; onToggleSorts: () => void; onSort: (sort: Sort) => void; onClear: () => void; onChoose: (exercise: Exercise) => void; onClose: () => void }) {
  const { colors } = useAppearance();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.sheetOverlay}><Pressable onPress={onClose} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close exercise library" /><View style={[styles.sheet, { backgroundColor: colors.background }]}><View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} /><View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.text }]}>Exercise library</Text><Text style={[styles.sheetSubtitle, { color: colors.mutedText }]}>Find your own movement</Text></View><Pressable onPress={onClose} hitSlop={10} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close"><X width={20} height={20} color={colors.text} strokeWidth={2.5} /></Pressable></View>
    <View style={styles.searchWrap}><View style={[styles.searchBox, { backgroundColor: colors.surface }]}><Search width={19} height={19} color={colors.mutedText} strokeWidth={2.35} /><TextInput value={query} onChangeText={onQueryChange} placeholder="Search movements" placeholderTextColor={colors.subtleText} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={[styles.searchInput, { color: colors.text }]} accessibilityLabel="Search exercises" />{query.length > 0 && <Pressable onPress={() => onQueryChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search"><X width={18} height={18} color={colors.mutedText} strokeWidth={2.5} /></Pressable>}</View><FilterRow options={muscleOptions} selected={muscleFilters} onSelect={onMuscleFiltersChange} /><FilterRow options={equipmentOptions} selected={equipmentFilters} onSelect={onEquipmentFiltersChange} /></View>
    <FlatList data={results} keyExtractor={(exercise) => exercise.id} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.catalogList} ListHeaderComponentStyle={styles.listHeaderContainer} ListHeaderComponent={<View style={styles.listHeader}><Text style={[styles.listEyebrow, { color: colors.mutedText }]}>{hasActiveFilters ? `${results.length} ${results.length === 1 ? 'MOVEMENT' : 'MOVEMENTS'}` : 'ALL EXERCISES'}</Text><Pressable onPress={onToggleSorts} style={styles.sortButton} accessibilityRole="button" accessibilityLabel={`Sort by ${sortLabels[sort]}`} accessibilityState={{ expanded: showSorts }}><Text style={[styles.sortPrefix, { color: colors.subtleText }]}>SORT:</Text><Text style={[styles.sortValue, { color: colors.text }]}>{sortLabels[sort]}</Text><ChevronDown width={14} height={14} color={colors.text} strokeWidth={2.6} /></Pressable>{showSorts && <View style={[styles.sortMenu, { backgroundColor: colors.background, borderColor: colors.surfaceStrong }]}>{(Object.keys(sortLabels) as Sort[]).map((option) => <Pressable key={option} onPress={() => onSort(option)} style={styles.sortOption} accessibilityRole="button" accessibilityState={{ selected: option === sort }}><Text style={[styles.sortOptionText, { color: colors.mutedText }, option === sort && { color: colors.text }]}>{sortLabels[option]}</Text>{option === sort && <Check width={16} height={16} color={colors.text} strokeWidth={3} />}</Pressable>)}</View>}</View>} ListEmptyComponent={<EmptyState query={query} onClear={onClear} />} renderItem={({ item }) => <ExerciseRow exercise={item} onPress={() => onChoose(item)} />} />
  </View></View></Modal>;
}

function CurrentVisit({ visit, coverage, onEnd, onRefresh }: { visit: WorkoutVisitSummary | null; coverage: ReturnType<typeof getWorkoutCoverage>; onEnd: () => void; onRefresh: () => void }) {
	const { colors, mode } = useAppearance();
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    // Schedule each refresh for the next elapsed-time boundary. The elapsed
    // value is always derived from when this workout was created, never from
    // when this screen was opened.
    let timeout: ReturnType<typeof setTimeout>;
    const refreshTimer = () => {
      setNow(Date.now());
      onRefresh();
      timeout = setTimeout(refreshTimer, 1_000 - (Date.now() % 1_000));
    };
    refreshTimer();
    return () => clearTimeout(timeout);
  }, [onRefresh, visit?.workout.createdAt]);
  if (!visit || visit.workout.endedAt) return null;
  const workoutStartedAt = visit.workout.createdAt.getTime();
  const seconds = Math.max(0, Math.floor((now - workoutStartedAt) / 1_000));
  const duration = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const toggleExpanded = () => {
    LayoutAnimation.configureNext({ duration: 240, update: { type: LayoutAnimation.Types.easeInEaseOut }, create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity }, delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } });
    setExpanded((value) => !value);
  };
  return <View style={[styles.visitCard, { backgroundColor: colors.inverse }]} accessibilityLabel={`Current ${workoutSplitLabel(visit.workout.split)} workout, duration ${duration}`}>
    <Pressable onPress={toggleExpanded} style={styles.visitHeading} accessibilityRole="button" accessibilityLabel="Show workout muscle coverage" accessibilityState={{ expanded }}><Text style={[styles.visitTitle, { color: colors.inverseText }]}>{workoutSplitLabel(visit.workout.split)} day</Text><View style={styles.visitTime}><Text style={[styles.visitTimeText, { color: colors.inverseText }]}>{duration}</Text><ChevronDown width={17} height={17} color={colors.accent} strokeWidth={2.7} style={[styles.visitChevron, expanded && styles.visitChevronExpanded]} /></View></Pressable>
    {expanded && <View style={styles.coveragePanel}><MuscleCoverageGraphic split={visit.workout.split} targetMuscles={getWorkoutSplitDefinition(visit.workout.split)?.muscles} primaryMuscles={coverage.primary} secondaryMuscles={coverage.secondary} /><View pointerEvents="none" style={styles.missedLegend}><View style={[styles.missedLegendDot, { backgroundColor: mode === 'dark' ? '#B34842' : '#FF7565' }]} /><Text style={[styles.missedLegendText, { color: colors.inverseText }]}>Not trained yet</Text></View></View>}
    <Pressable onPress={onEnd} style={({ pressed }) => [styles.endVisitButton, { backgroundColor: colors.accent }, pressed && styles.endVisitButtonPressed]} accessibilityRole="button" accessibilityLabel="End workout"><Text style={styles.endVisitText}>End workout</Text></Pressable>
  </View>;
}

function getWorkoutCoverage(workoutExerciseIds: readonly string[]) {
  const visitExercises = new Set(workoutExerciseIds);
  const primary = new Set<string>();
  const secondary = new Set<string>();
  for (const exercise of exercises) {
    if (!visitExercises.has(exercise.id)) continue;
    try {
      const details = JSON.parse(exercise.detailsJson ?? '{}') as { primaryMuscles?: string[]; secondaryMuscles?: string[] };
      details.primaryMuscles?.forEach((muscle) => primary.add(muscle));
      details.secondaryMuscles?.forEach((muscle) => secondary.add(muscle));
    } catch { /* A diagram is optional; malformed catalog metadata should not block the workout. */ }
  }
  return { primary: [...primary], secondary: [...secondary].filter((muscle) => !primary.has(muscle)) };
}

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) { return <View style={styles.empty}><Text style={styles.emptyTitle}>Nothing found</Text><Text style={styles.emptyCopy}>{query ? `No movements match “${query}”.` : 'No movements match this focus.'}</Text><Pressable onPress={onClear} style={styles.resetButton}><Text style={styles.resetText}>Reset search</Text></Pressable></View>; }

function FilterRow({ options, selected, onSelect }: { options: string[]; selected: string[]; onSelect: (values: string[]) => void }) { const { colors } = useAppearance(); const selectedValues = selected ?? []; return <View style={styles.filterGroup}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{options.map((option) => { const isSelected = selectedValues.includes(option); return <Pressable key={option} onPress={() => onSelect(isSelected ? selectedValues.filter((value) => value !== option) : [...selectedValues, option])} accessibilityRole="button" accessibilityState={{ selected: isSelected }} style={[styles.filterPill, { backgroundColor: isSelected ? colors.accent : colors.surface }]}><Text style={[styles.filterText, { color: isSelected ? colors.accentText : colors.mutedText }]}>{formatLabel(option)}</Text></Pressable>; })}</ScrollView></View>; }

function matchesMuscle(exercise: Exercise, filters: string[] | null) { return !filters?.length || filters.some((filter) => getPrimaryMuscles(exercise).includes(filter)); }

function matchesEquipment(exercise: Exercise, filters: string[] | null) {
  return !filters?.length || filters.some((filter) => filter === staticFilter ? isStaticExercise(exercise) : filter === exercise.equipment);
}

function uniqueSorted(values: string[]) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }

function formatLabel(value: string) { return value === staticFilter ? 'Static' : value.replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function isWorkoutSplit(value?: string): value is WorkoutSplit { return !!value && !!getWorkoutSplitDefinition(value as WorkoutSplit); }

function getPrimaryMuscles(exercise: Exercise): string[] {
  try { return JSON.parse(exercise.detailsJson ?? '{}').primaryMuscles ?? []; } catch { return []; }
}

function exerciseMuscleLabel(exercise: Exercise) {
  const muscles = getPrimaryMuscles(exercise);
  return muscles.length ? muscles.map(formatLabel).join(' · ') : exercise.area;
}

function isStaticExercise(exercise: Exercise) {
  try { return JSON.parse(exercise.detailsJson ?? '{}').force === 'static'; } catch { return false; }
}

function matchesSplit(exercise: Exercise, split?: string) {
  if (!split) return true;
  let primaryMuscles: string[] = [];
  try { primaryMuscles = JSON.parse(exercise.detailsJson ?? '{}').primaryMuscles ?? []; } catch { /* Catalog rows remain usable without details. */ }
  const hasPrimary = (muscle: string) => primaryMuscles.includes(muscle);
  if (split?.startsWith('custom:')) return hasPrimary('abdominals') || (getWorkoutSplitDefinition(split as WorkoutSplit)?.muscles.some(hasPrimary) ?? true);
  // Core work is a shared accessory across lifting splits.
  if (isWorkoutSplit(split) && hasPrimary('abdominals')) return true;
  if (split === 'chest') return exercise.area === 'CHEST';
  if (split === 'back') return exercise.area === 'BACK';
  if (split === 'legs') return exercise.area === 'LEGS';
  if (split === 'push') return exercise.area === 'CHEST' || exercise.area === 'SHOULDERS' || hasPrimary('triceps');
  if (split === 'pull') return exercise.area === 'BACK' || hasPrimary('biceps') || hasPrimary('forearms');
  return true;
}

function ExerciseRow({ exercise, onPress }: { exercise: Exercise; onPress: () => void }) { const { colors } = useAppearance(); return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Add ${exercise.name}`}><View style={styles.rowCopy}><Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{exercise.name}</Text><View style={styles.metaRow}><Text numberOfLines={1} style={[styles.area, { color: colors.mutedText }]}>{exerciseMuscleLabel(exercise)}</Text><View style={[styles.metaDot, { backgroundColor: colors.subtleText }]} /><Text numberOfLines={1} style={[styles.equipment, { color: colors.mutedText }]}>{exercise.equipment}</Text></View></View></Pressable>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, position: 'relative', backgroundColor: '#F9F9F7' },
  recommendationScroll: { flex: 1 },
  recommendationContent: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 240 },
  heroTitle: { maxWidth: 310, marginBottom: 24, fontSize: 36, lineHeight: 38, fontWeight: '900', letterSpacing: -1.8 },
  recommendationHeading: { marginBottom: 10, fontSize: 16, lineHeight: 20, fontWeight: '900', letterSpacing: -.4 },
  recommendationList: { gap: 8 },
  recommendationShell: { borderRadius: 16, overflow: 'hidden' },
  recommendationCard: { position: 'relative', minHeight: 92, paddingHorizontal: 16, paddingVertical: 13, justifyContent: 'center' },
  nextBadge: { position: 'absolute', bottom: 12, right: 14, height: 22, paddingHorizontal: 9, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nextBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: -.1 },
  recommendationName: { marginTop: 5, fontSize: 20, lineHeight: 23, fontWeight: '900', letterSpacing: -.7 },
  recommendationMeta: { marginTop: 4, fontSize: 11, lineHeight: 15, fontWeight: '700', textTransform: 'capitalize' },
  recommendationMetaWithBadge: { paddingRight: 72 },
  swipeAction: { width: 82, alignItems: 'center', justifyContent: 'center' },
  swipeActionText: { fontSize: 12, fontWeight: '900' },
  browseButton: { minHeight: 68, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  browseTitle: { fontSize: 15, fontWeight: '900', letterSpacing: -.35 },
  browseCopy: { marginTop: 3, fontSize: 11, fontWeight: '700' },
  completedSection: { marginTop: 22 },
  completedTitle: { fontSize: 16, lineHeight: 20, fontWeight: '900', letterSpacing: -.4 },
  completedEmpty: { marginTop: 7, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  completedList: { marginTop: 10, gap: 10 },
  completedRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center' },
  completedCheck: { width: 28, height: 28, marginRight: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  completedName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '800', letterSpacing: -.2 },
  completedSets: { marginLeft: 12, fontSize: 11, fontWeight: '800' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.38)' },
  sheet: { height: '92%', paddingTop: 9, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetHeader: { minHeight: 76, paddingHorizontal: 24, paddingTop: 17, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 23, lineHeight: 27, fontWeight: '900', letterSpacing: -.8 },
  sheetSubtitle: { marginTop: 2, fontSize: 12, fontWeight: '700' },
  closeButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 24, paddingBottom: 10 },
  searchBox: { height: 52, paddingHorizontal: 16, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '800', height: '100%' },
  filterGroup: { marginTop: 8 },
  filters: { gap: 7 },
  filterPill: { height: 32, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 12, fontWeight: '900' },
  catalogList: { paddingHorizontal: 24, paddingBottom: 38 },
  listHeaderContainer: { zIndex: 100, elevation: 100, overflow: 'visible' },
  listHeader: { position: 'relative', zIndex: 100, overflow: 'visible', height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  sortButton: { height: 32, paddingHorizontal: 5, borderRadius: 9, flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortPrefix: { fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  sortValue: { fontSize: 11, fontWeight: '900' },
  sortMenu: { position: 'absolute', zIndex: 1000, elevation: 1000, top: 34, right: 0, width: 180, borderRadius: 16, borderWidth: 1, paddingVertical: 5, shadowColor: '#213A28', shadowOpacity: .1, shadowRadius: 18, shadowOffset: { width: 0, height: 7 } },
  sortOption: { height: 43, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortOptionText: { fontSize: 14, fontWeight: '700' },
  row: { minHeight: 66, paddingVertical: 10, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '900', letterSpacing: -.45 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  area: { fontSize: 9, fontWeight: '900', letterSpacing: .8 },
  metaDot: { width: 3, height: 3, borderRadius: 2 },
  equipment: { flexShrink: 1, fontSize: 11, fontWeight: '700' },
  visitCard: { position: 'absolute', zIndex: 1000, elevation: 20, left: 0, right: 0, bottom: 28, overflow: 'hidden', marginHorizontal: 16, paddingTop: 16, paddingHorizontal: 16, borderRadius: 19, shadowColor: '#0C0E0A', shadowOpacity: .16, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } },
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
  endVisitButton: { height: 48, marginTop: 12, marginHorizontal: -16, borderTopLeftRadius: 14, borderTopRightRadius: 14, alignItems: 'center', justifyContent: 'center' },
  endVisitButtonPressed: { opacity: .78 },
  endVisitText: { fontSize: 13, fontWeight: '900', letterSpacing: -.15, color: '#151612' },
  favoriteOverlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,.48)' },
  favoriteSheet: { maxHeight: '82%', borderRadius: 24, padding: 22 },
  favoriteTitle: { fontSize: 23, lineHeight: 28, fontWeight: '900', letterSpacing: -.5 },
  favoriteSubtitle: { marginTop: 7, fontSize: 14, lineHeight: 20 },
  favoriteCount: { marginTop: 12, fontSize: 12, fontWeight: '800' },
  favoriteSearch: { height: 42, marginTop: 12, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  favoriteSearchInput: { flex: 1, height: '100%', fontSize: 14 },
  favoriteError: { marginTop: 10, fontSize: 12, fontWeight: '700' },
  favoriteChoices: { marginTop: 16, flexGrow: 0 },
  favoriteChoice: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  favoriteChoiceText: { fontSize: 14, fontWeight: '700' },
  favoriteChoiceDisabled: { opacity: .45 },
  favoriteSave: { minHeight: 52, marginTop: 16, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  favoriteSaveText: { fontSize: 15, fontWeight: '900' },
  favoriteSkip: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  favoriteSkipText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: .78, transform: [{ scale: .985 }] },
  empty: { paddingTop: 43, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#1B1C17' },
  emptyCopy: { marginTop: 7, fontSize: 13, fontWeight: '600', color: '#7C8177' },
  resetButton: { marginTop: 17, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#EDEEE9' },
  resetText: { fontSize: 12, fontWeight: '900', color: '#1A1B16' },
});
