import { searchExercises } from '@/lib/exercise-search';
import { isValidWorkoutSetValues } from '@/lib/workout-set-validation';
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { ChevronLeft, Delete, Info, Plus, X } from "react-native-feather";
import { useEffect, useMemo, useRef, useState } from "react";
import Animated, { FadeIn, FadeInLeft, FadeInRight, FadeOut, FadeOutLeft, FadeOutRight, interpolate, interpolateColor, LinearTransition, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withSequence, withSpring } from "react-native-reanimated";
import Svg, { Defs, G, Line, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  Vibration,
  View,
} from "react-native";
import { ui } from "@/styles/primitives";
import { useSheetPresence } from "@/hooks/use-sheet-presence";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  deleteWorkoutSet,
  getExercises,
  getNextSetNumberForWorkout,
  getRecentExerciseExhaustion,
  getWorkoutHistory,
  recordRecommendationFeedback,
  saveWorkoutSet,
  type Exercise,
  type WorkoutHistoryPoint,
} from "@/db";
import { exerciseRequiresWeight } from "@/db/exercise-catalog";
import { useAppearance } from "@/components/appearance-provider";
import { ExerciseThumb } from "@/components/exercise-thumb";
import { ExerciseDetailSheet } from "@/components/exercise-detail-sheet";
import { StatsPanel } from "@/components/stats-panel";
import { SwipeWatermark } from "@/components/swipe-watermark";
import { getProgressiveOverloadLoadOptions, getProgressiveOverloadRecommendation, resolveExercisePrescription } from "@/lib/exercise-recommendations";
import { useRecommendationContext } from "@/hooks/use-recommendation-context";
import { normalizeRestTimerSeconds } from "@/lib/appearance";
import { syncRestLiveActivity } from "@/lib/rest-live-activity";
import { availableBarWeights, BAR_WEIGHT_LB, formatPlateCounts, MAX_BAR_WEIGHT_LB, PLATE_INCREMENT_LB, platesPerSide } from "@/lib/plate-loading";

type Field = "weight" | "reps";
type WeightInputMode = "plates" | "keypad";
const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"];
const plateDialWeights = availableBarWeights;
const plateTickWidth = 24;
const rulerHeight = 88;
const normalizeBarWeight = (value: string) => Math.min(MAX_BAR_WEIGHT_LB, Math.max(BAR_WEIGHT_LB, Math.round(((Number(value) || BAR_WEIGHT_LB) - BAR_WEIGHT_LB) / PLATE_INCREMENT_LB) * PLATE_INCREMENT_LB + BAR_WEIGHT_LB));
const exerciseCatalog = getExercises();
const restTickCount = 60;
const restTicks = Array.from({ length: restTickCount }, (_, index) => {
  const angle = (index / restTickCount) * 2 * Math.PI;
  const inner = index % 5 === 0 ? 120 : 128;
  return { x1: 150 + inner * Math.sin(angle), y1: 150 - inner * Math.cos(angle), x2: 150 + 144 * Math.sin(angle), y2: 150 - 144 * Math.cos(angle) };
});
const plateLayout = LinearTransition.duration(180);
const leftPlateEnter = FadeInLeft.duration(180);
const rightPlateEnter = FadeInRight.duration(180);
const recentSetEnter = FadeInRight.duration(220);
const leftPlateExit = FadeOutLeft.duration(120);
const rightPlateExit = FadeOutRight.duration(120);

function PlateDial({ value, onChange, colors, showSwipeHint, onSwipeStart }: {
  value: string;
  onChange: (value: string) => void;
  colors: ReturnType<typeof useAppearance>["colors"];
  showSwipeHint: boolean;
  onSwipeStart: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const lastEmittedValue = useRef<number | null>(null);
  const [width, setWidth] = useState(0);
  const total = Math.min(MAX_BAR_WEIGHT_LB, Math.max(BAR_WEIGHT_LB, Number(value) || BAR_WEIGHT_LB));
  const plates = platesPerSide(total);
  const plateWidth = Math.max(4, Math.min(8, 82 / Math.max(plates.length, 1) - 2));
  const plateStackWidth = plates.length * (plateWidth + 2);

  useEffect(() => {
    if (!width || lastEmittedValue.current === total) return;
    const index = Math.round((total - BAR_WEIGHT_LB) / PLATE_INCREMENT_LB);
    lastEmittedValue.current = total;
    scrollRef.current?.scrollTo({ x: index * plateTickWidth, animated: false });
  }, [total, width]);

  return <View style={styles.plateDial}>
    <View style={styles.barbell} accessibilityElementsHidden>
      <View style={[styles.barEnd, { backgroundColor: colors.subtleText }]} />
      <Animated.View layout={plateLayout} style={[styles.plateSide, styles.plateSideLeft, { width: plateStackWidth }]}>
        {[...plates].reverse().map((plate, index) => <Animated.View key={`left-${plate}-${index}`} entering={leftPlateEnter} exiting={leftPlateExit} layout={plateLayout} style={[styles.barPlate, {
          width: plateWidth,
          height: 22 + plate * .78,
          backgroundColor: colors.text,
        }]} />)}
      </Animated.View>
      <View style={[styles.barCollar, { backgroundColor: colors.accent }]} />
      <View style={[styles.barGrip, { backgroundColor: colors.subtleText }]} />
      <View style={[styles.barCollar, { backgroundColor: colors.accent }]} />
      <Animated.View layout={plateLayout} style={[styles.plateSide, styles.plateSideRight, { width: plateStackWidth }]}>
        {plates.map((plate, index) => <Animated.View key={`right-${plate}-${index}`} entering={rightPlateEnter} exiting={rightPlateExit} layout={plateLayout} style={[styles.barPlate, {
          width: plateWidth,
          height: 22 + plate * .78,
          backgroundColor: colors.text,
        }]} />)}
      </Animated.View>
      <View style={[styles.barEnd, { backgroundColor: colors.subtleText }]} />
    </View>
    <View style={styles.plateSummary} accessible accessibilityRole="text" accessibilityLabel={`Each side: ${formatPlateCounts(plates)}`}>
      <Text style={[styles.plateSummaryLabel, { color: colors.subtleText }]}>Each side</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.75} style={[styles.plateSummaryValue, { color: colors.text }]}>{formatPlateCounts(plates)}</Text>
    </View>
    <View
      style={styles.rulerFrame}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessibilityLabel={`Barbell weight ${total} pounds. Swipe left or right to adjust.`}
    >
      {showSwipeHint && <SwipeWatermark colors={colors} height={rulerHeight} />}
      <ScrollView
          ref={scrollRef}
          style={styles.rulerScroll}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={plateTickWidth}
          decelerationRate="normal"
          directionalLockEnabled
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: Math.max(0, width / 2 - plateTickWidth / 2) }}
          onScrollBeginDrag={() => {
            onSwipeStart();
          }}
          onScroll={(event) => {
            const index = Math.max(0, Math.min(plateDialWeights.length - 1, Math.round(event.nativeEvent.contentOffset.x / plateTickWidth)));
            const next = plateDialWeights[index];
            if (next === lastEmittedValue.current) return;
            lastEmittedValue.current = next;
            if (showSwipeHint) onSwipeStart();
            onChange(String(next));
          }}
          onMomentumScrollEnd={() => {
            void Haptics.selectionAsync().catch(() => {});
          }}
        >
          {plateDialWeights.map((tick) => {
            const major = tick % 25 === 0;
            return <View key={tick} style={styles.rulerTickSlot}>
              <View style={[styles.rulerTick, { backgroundColor: major ? colors.mutedText : colors.subtleText, opacity: major ? 1 : .45 }, major && styles.rulerTickMajor]} />
            </View>;
          })}
      </ScrollView>
      <Svg pointerEvents="none" style={styles.rulerEdgeFade} width="100%" height={rulerHeight} viewBox={`0 0 300 ${rulerHeight}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="leftRulerFade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.background} stopOpacity={1} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="rightRulerFade" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.background} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={24} height={rulerHeight} fill="url(#leftRulerFade)" />
        <Rect x={276} y={0} width={24} height={rulerHeight} fill="url(#rightRulerFade)" />
      </Svg>
      <View pointerEvents="none" style={[styles.rulerIndicator, { backgroundColor: colors.accent }]} />
    </View>
  </View>;
}

function readSupersetIds(value: string | string[] | undefined, currentExerciseId: string) {
  const serialized = Array.isArray(value) ? value[0] : value;
  try {
    const ids = JSON.parse(serialized ?? "[]");
    if (Array.isArray(ids) && ids.every((id) => typeof id === "string")) {
      return [...new Set([...ids, currentExerciseId])];
    }
  } catch { /* A malformed link should still open the current exercise. */ }
  return [currentExerciseId];
}

export default function WorkoutScreen() {
	const { colors, restTimerEnabled, useRecommendedRestTimer, restTimerSeconds } = useAppearance();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const { width: inputAreaWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{
    id: string;
    name: string;
    area: string;
    mark: string;
    color: string;
    workoutId: string;
    recommendedSets?: string;
    superset?: string | string[];
  }>();
  const exerciseId = params.id ?? "free_exercise_db:Barbell_Squat";
  const name = params.name ?? "Barbell Squat";
  const accentColor = colors.accent;
  const workoutId = params.workoutId ?? "legacy-workout";
  // Preserve the plan's volume cap for its exercise when switching supersets.
  const [plannedVolume] = useState(() => ({ exerciseId, sets: Number(params.recommendedSets) }));
  const exercise = useMemo(() => exerciseCatalog.find((item) => item.id === exerciseId) ?? {
    id: exerciseId,
    name,
    area: params.area ?? "",
    mark: params.mark ?? "",
    color: params.color ?? "",
    equipment: "",
    isFeatured: 0,
    detailsJson: null,
  }, [exerciseId, name, params.area, params.color, params.mark]);
  const requiresWeight = exerciseRequiresWeight(exercise);
  const loadOptions = useMemo(() => getProgressiveOverloadLoadOptions(exercise), [exercise]);
  const { context: recommendationContext, ready: contextReady } = useRecommendationContext();
  const prescription = useMemo(() => resolveExercisePrescription(
    exercise, recommendationContext, getRecentExerciseExhaustion(exerciseId, workoutId),
    plannedVolume.exerciseId === exerciseId ? plannedVolume.sets : undefined,
  ), [exercise, exerciseId, plannedVolume, recommendationContext, workoutId]);
  const exerciseDetails = useMemo(() => {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(exercise.detailsJson ?? "{}") ?? {}; } catch { /* Catalog rows may lack details; show the empty state. */ }
    const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    const instructions = strings(parsed.instructions);
    const muscles = strings(parsed.primaryMuscles);
    const meta = [typeof parsed.level === "string" ? parsed.level : "", muscles.join(", ")].filter(Boolean).join(" · ");
    return { instructions, meta };
  }, [exercise.detailsJson]);
  const [field, setField] = useState<Field>("weight");
  // Prefilled values are shown muted; the first keypad digit replaces them instead of appending (10 → 8, not 108).
  const [typed, setTyped] = useState({ weight: false, reps: false });
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [weightInputMode, setWeightInputMode] = useState<WeightInputMode>("plates");
  const [plateHintDismissed, setPlateHintDismissed] = useState(false);
  const [includesAddedWeight, setIncludesAddedWeight] = useState(false);
  const usesWeight = requiresWeight || includesAddedWeight;
  const supportsPlateDial = exercise.equipment === "barbell";
  const [setNumber, setSetNumber] = useState(1);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<WorkoutHistoryPoint[]>([]);
  const completedHistory = useMemo(() => getWorkoutHistory(exerciseId, { completedOnly: true }), [exerciseId]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const historySheetVisible = useSheetPresence(historyOpen);
  const [infoOpen, setInfoOpen] = useState(false);
  const [supersetPickerOpen, setSupersetPickerOpen] = useState(false);
  const [supersetQuery, setSupersetQuery] = useState("");
  const [restDuration, setRestDuration] = useState(restTimerSeconds);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restNow, setRestNow] = useState(() => Date.now());
  const [restDone, setRestDone] = useState(false);
  const restScale = useSharedValue(1);
  const restTimeAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: restScale.value }] }));
  const setLabelScale = useSharedValue(1);
  const setLabelAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: setLabelScale.value }] }));
  const valueScale = useSharedValue(1);
  const valueAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: valueScale.value }] }));
  const inputPagerRef = useRef<ScrollView>(null);
  const inputScrollProgress = useSharedValue(0);
  const plateDotStyle = useAnimatedStyle(() => ({ width: interpolate(inputScrollProgress.value, [0, 1], [12, 6]), backgroundColor: interpolateColor(inputScrollProgress.value, [0, 1], [colors.accent, colors.subtleText]) }));
  const keypadDotStyle = useAnimatedStyle(() => ({ width: interpolate(inputScrollProgress.value, [0, 1], [6, 12]), backgroundColor: interpolateColor(inputScrollProgress.value, [0, 1], [colors.subtleText, colors.accent]) }));
  const skippingRestRef = useRef(false);
  const supersetIds = useMemo(() => readSupersetIds(params.superset, exerciseId), [exerciseId, params.superset]);
  const supersetExercises = useMemo(() => supersetIds
    .map((id) => exerciseCatalog.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise)), [supersetIds]);
  const supersetCandidates = useMemo(() => {
    return searchExercises(exerciseCatalog.filter((exercise) => !supersetIds.includes(exercise.id)), supersetQuery).slice(0, 40);
  }, [supersetIds, supersetQuery]);
  useEffect(() => {
    if (restEndsAt === null) return;
    const tick = () => {
      const now = Date.now();
      if (skippingRestRef.current) return;
      setRestNow(now);
      if (now >= restEndsAt) {
        // Hold the modal briefly so the inverted screen and pulse register before it closes.
        skippingRestRef.current = true;
        setRestDone(true);
        restScale.value = withSequence(
          withSpring(1.14, { duration: 160, dampingRatio: 0.5 }),
          withSpring(1, { duration: 300, dampingRatio: 0.6 }),
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        Vibration.vibrate([0, 400, 200, 400]);
        setTimeout(() => {
          skippingRestRef.current = false;
          setRestDone(false);
          setRestEndsAt(null);
        }, 900);
      }
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [restEndsAt, restScale]);
  useEffect(() => {
    syncRestLiveActivity(restEndsAt, restDuration);
  }, [restEndsAt, restDuration]);
  useEffect(() => () => syncRestLiveActivity(null), []);
  useEffect(() => {
    if (!contextReady) return;
    const timer = setTimeout(() => {
      const nextHistory = getWorkoutHistory(exerciseId);
      const currentSets = nextHistory.filter((set) => set.workoutId === workoutId);
      const lastSet = currentSets.at(-1);
      const continueAddedWeight = !requiresWeight && Boolean(lastSet?.weight);
      const nextSetNumber = getNextSetNumberForWorkout(exerciseId, workoutId);
      setSetNumber(nextSetNumber);
      setHistory(nextHistory);
      setIncludesAddedWeight(continueAddedWeight);
      const nextRecommendation = getProgressiveOverloadRecommendation([...completedHistory, ...currentSets], prescription, {
        ...loadOptions,
        currentWorkoutId: workoutId, setNumber: nextSetNumber, exhaustion: getRecentExerciseExhaustion(exerciseId, workoutId),
      });
      const lastWeight = requiresWeight || continueAddedWeight ? nextRecommendation.weight ?? lastSet?.weight : undefined;
      setWeight(String(lastWeight ?? ""));
      setReps(String(nextRecommendation.action === "start" ? lastSet?.reps ?? "" : nextRecommendation.reps));
      setField(requiresWeight || continueAddedWeight ? "weight" : "reps");
      const canShowLastWeightOnBar = !lastWeight || lastWeight >= BAR_WEIGHT_LB && (lastWeight - BAR_WEIGHT_LB) % PLATE_INCREMENT_LB === 0;
      setWeightInputMode(exercise.equipment === "barbell" && canShowLastWeightOnBar ? "plates" : "keypad");
      setPlateHintDismissed(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [completedHistory, contextReady, exercise.equipment, exerciseId, loadOptions, prescription, requiresWeight, workoutId]);
  useEffect(() => {
    if (supportsPlateDial && weightInputMode === "plates" && field === "weight" && !Number(weight)) {
      setWeight(String(BAR_WEIGHT_LB));
    }
  }, [field, supportsPlateDial, weight, weightInputMode]);
  useEffect(() => {
    inputPagerRef.current?.scrollTo({ x: supportsPlateDial && field === "weight" && weightInputMode === "keypad" ? inputAreaWidth : 0, animated: true });
  }, [field, inputAreaWidth, supportsPlateDial, weightInputMode]);
  useEffect(() => setTyped({ weight: false, reps: false }), [exerciseId, setNumber]);
  const value = field === "weight" ? weight : reps;
  function edit(key: string) {
    if (key === "." && field === "reps") return;
    const replace = !typed[field] && /^\d$/.test(key);
    setTyped((current) => ({ ...current, [field]: true }));
    const next = (current: string) => {
      const v = replace ? "" : current;
      return key === "backspace"
        ? v.slice(0, -1)
        : key === "." && (field === "reps" || v.includes(".") || v.split(".")[1]?.length >= 2)
          ? v
          : field === "weight" && v.includes(".") && v.split(".")[1].length >= 2
            ? v
          : v === "0"
            ? key
            : v + key;
    };
    if (field === "weight") setWeight(next);
    else setReps(next);
  }
  async function saveSet() {
    if ((usesWeight && !Number(weight)) || !isValidWorkoutSetValues({ weight: usesWeight ? Number(weight) : 0, reps: Number(reps) }) || setNumber > 100 || saving) return;
    setSaving(true);
    try {
      saveWorkoutSet({
        exerciseId,
        workoutId,
        setNumber,
        weight: usesWeight ? Number(weight) : 0,
        reps: Number(reps),
        completedAt: new Date(),
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setLabelScale.value = withSequence(
        withSpring(1.15, { duration: 120, dampingRatio: 0.55 }),
        withSpring(1, { duration: 200, dampingRatio: 0.65 }),
      );
      setSetNumber((v) => v + 1);
      const nextHistory = getWorkoutHistory(exerciseId);
      const currentSets = nextHistory.filter((set) => set.workoutId === workoutId);
      const lastSet = currentSets.at(-1);
      setHistory(nextHistory);
      const nextRecommendation = getProgressiveOverloadRecommendation([...completedHistory, ...currentSets], prescription, {
        ...loadOptions,
        currentWorkoutId: workoutId, setNumber: setNumber + 1, exhaustion: getRecentExerciseExhaustion(exerciseId, workoutId),
      });
      setWeight(String(usesWeight ? nextRecommendation.weight ?? lastSet?.weight ?? "" : ""));
      setReps(String(nextRecommendation.action === "start" ? lastSet?.reps ?? "" : nextRecommendation.reps));
      setField(usesWeight ? "weight" : "reps");
      if (supersetExercises.length > 1) {
        const currentIndex = supersetExercises.findIndex((exercise) => exercise.id === exerciseId);
        switchExercise(supersetExercises[(currentIndex + 1) % supersetExercises.length]);
        if (currentIndex === supersetExercises.length - 1) startRest();
      } else {
        startRest();
      }
    } finally {
      setSaving(false);
    }
  }
  function deleteSet(set: WorkoutHistoryPoint) {
    // Swipe + tap is enough for today's sets; past sessions are history, so confirm first.
    if (set.workoutId === workoutId) return removeSet(set);
    const message = `Set ${set.setNumber} from ${set.completedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })} will be permanently removed.`;
    if (Platform.OS === "web") {
      if (window.confirm(message)) removeSet(set);
      return;
    }
    Alert.alert("Delete past set?", message, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => removeSet(set) }]);
  }
  function removeSet(set: WorkoutHistoryPoint) {
    if (set.workoutId === workoutId && history.filter((item) => item.workoutId === workoutId).length === 1) {
      recordRecommendationFeedback(workoutId, exerciseId, "removed");
    }
    deleteWorkoutSet(exerciseId, set);
    setHistory(getWorkoutHistory(exerciseId));
    setSetNumber(getNextSetNumberForWorkout(exerciseId, workoutId));
  }
  function continueFlow() {
    if (field === "weight") {
      if (Number(weight)) setField("reps");
      return;
    }
    saveSet();
  }
  function goBack() {
    if (field === "reps" && usesWeight) setField("weight");
    else router.back();
  }
  function toggleAddedWeight() {
    if (includesAddedWeight) {
      setIncludesAddedWeight(false);
      setWeight("");
      setField("reps");
    } else {
      setIncludesAddedWeight(true);
      setWeight("");
      setField("weight");
    }
  }
  function startRest() {
    if (!restTimerEnabled) return;
    const now = Date.now();
    const duration = useRecommendedRestTimer ? prescription.restSeconds : normalizeRestTimerSeconds(restTimerSeconds);
    skippingRestRef.current = false;
    restScale.value = 1;
    setRestDuration(duration);
    setRestNow(now);
    setRestEndsAt(now + duration * 1_000);
  }
  function adjustRest(seconds: number) {
    if (skippingRestRef.current) return;
    const nextDuration = Math.max(15, Math.min(600, restDuration + seconds));
    const delta = nextDuration - restDuration;
    restScale.value = withSequence(
      withSpring(1.06, { duration: 100, dampingRatio: 0.6 }),
      withSpring(1, { duration: 140, dampingRatio: 0.65 }),
    );
    setRestDuration(nextDuration);
    setRestEndsAt((endsAt) => endsAt === null ? null : endsAt + delta * 1_000);
  }
  function skipRest() {
    if (skippingRestRef.current) return;
    skippingRestRef.current = true;
    const duration = 500;
    setRestNow(restEndsAt ?? Date.now());
    restScale.value = withSequence(
      withSpring(1.08, { duration: 180, dampingRatio: 0.55 }),
      withSpring(1, { duration: 260, dampingRatio: 0.65 }),
    );
    setTimeout(() => {
      skippingRestRef.current = false;
      setRestEndsAt(null);
    }, duration + 120);
  }
  function switchExercise(exercise: Exercise, ids = supersetIds) {
    // Superset exercises are views within this workout, not separate screens.
    // Updating the current route's params preserves its single stack entry.
    router.setParams({
      ...exercise,
      workoutId,
      superset: JSON.stringify(ids),
    });
  }
  function addSupersetExercise(exercise: Exercise) {
    const ids = [...supersetIds, exercise.id];
    setSupersetPickerOpen(false);
    setSupersetQuery("");
    switchExercise(exercise, ids);
  }
  const validInput = field === "weight" ? Number(weight) > 0 && Number(weight) <= 10_000 && isValidWorkoutSetValues({ weight: Number(weight), reps: 1 }) : isValidWorkoutSetValues({ weight: usesWeight ? Number(weight) : 0, reps: Number(reps) }) && setNumber <= 100;
  const action = field === "weight" ? "Next" : "Log set";
  const restRemaining = restEndsAt === null ? 0 : Math.max(0, Math.ceil((restEndsAt - restNow) / 1_000));
  const restLitTicks = restEndsAt === null ? 0 : Math.max(0, restEndsAt - restNow) / (restDuration * 1_000) * restTickCount;
  const formatRest = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const recentSets = history.slice(-5);
  const recommendation = useMemo(
    () => getProgressiveOverloadRecommendation([
      ...completedHistory,
      ...history.filter((set) => set.workoutId === workoutId),
    ], prescription, {
      ...loadOptions,
      currentWorkoutId: workoutId,
      setNumber,
      exhaustion: getRecentExerciseExhaustion(exerciseId, workoutId),
    }),
    [completedHistory, exerciseId, history, loadOptions, prescription, setNumber, workoutId],
  );
  const recommendationValue = `${usesWeight && recommendation.weight !== undefined ? `${recommendation.weight} lb × ` : ""}${recommendation.reps} reps`;
  const recommendationLabel = ({ start: "START", increase: recommendation.weight === 0 ? "ADD REPS" : "ADD WEIGHT", retain: "HOLD", reduce: "EASE BACK", deload: "LIGHT DAY" } as const)[recommendation.action];
  const valueDisplay = <Animated.Text key={field} entering={FadeIn.duration(180)} numberOfLines={1} adjustsFontSizeToFit style={[styles.value, { color: typed[field] || !value ? colors.text : colors.mutedText }, valueAnimatedStyle]}>
    {value || "0"}{field === "weight" ? " lb" : " reps"}
  </Animated.Text>;
  function applyRecommendation() {
    if (recommendation.weight !== undefined) setWeight(String(recommendation.weight));
    setReps(String(recommendation.reps));
    setTyped({ weight: false, reps: false });
    valueScale.value = withSequence(
      withSpring(1.06, { duration: 100, dampingRatio: 0.6 }),
      withSpring(1, { duration: 140, dampingRatio: 0.65 }),
    );
  }
  const keypad = <View style={styles.keypad}>
    {keys.map((key) => (
      <Pressable
        key={key}
        onPress={() => edit(key)}
        style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.surface }]}
        accessibilityRole="button"
        accessibilityLabel={key === "backspace" ? "Delete" : key === "." ? "Decimal point" : key}
      >
        {key === "backspace" ? (
          <Delete width={25} height={25} color={colors.text} strokeWidth={2.25} />
        ) : (
          <Text style={[styles.keyText, { color: colors.text }]}>{key}</Text>
        )}
      </Pressable>
    ))}
  </View>;
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={16} accessibilityRole="button" accessibilityLabel={field === "reps" && usesWeight ? "Back to weight" : "Close exercise"}>
          {field === "reps" && usesWeight ? <ChevronLeft width={28} height={28} color={colors.text} strokeWidth={2} /> : <X width={28} height={28} color={colors.text} strokeWidth={2} />}
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>{name}</Text>
        <Pressable
          onPress={() => setInfoOpen(true)}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel={`How to do ${name}`}
        >
          <Info width={24} height={24} color={colors.mutedText} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={styles.supersetBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.supersetTabs}>
          {supersetExercises.length > 1 && supersetExercises.map((exercise) => {
            const active = exercise.id === exerciseId;
            return <Pressable
              key={exercise.id}
              onPress={() => !active && switchExercise(exercise)}
              hitSlop={{ top: 5, bottom: 5 }}
              style={({ pressed }) => [styles.supersetTab, { backgroundColor: active ? colors.accent : colors.surface }, pressed && !active && styles.supersetTabPressed]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Switch to ${exercise.name}`}
            ><Text numberOfLines={1} style={[styles.supersetTabText, { color: active ? colors.accentText : colors.mutedText }]}>{exercise.name}</Text></Pressable>;
          })}
          <Pressable
            onPress={() => setSupersetPickerOpen(true)}
            hitSlop={{ top: 5, bottom: 5 }}
            style={({ pressed }) => [styles.addSupersetButton, { borderColor: colors.surfaceStrong }, pressed && styles.supersetTabPressed]}
            accessibilityRole="button"
            accessibilityLabel="Add an exercise to this superset"
          ><Plus width={15} height={15} color={colors.text} strokeWidth={3} /><Text style={[styles.addSupersetText, { color: colors.text }]}>Superset</Text></Pressable>
        </ScrollView>
      </View>
      <View style={styles.exerciseBlock}>
        <Animated.Text style={[styles.exerciseName, { color: colors.text }, setLabelAnimatedStyle]}>SET {setNumber}</Animated.Text>
        {!requiresWeight && <Pressable onPress={toggleAddedWeight} hitSlop={8} accessibilityRole="button" accessibilityLabel={includesAddedWeight ? "Remove added weight" : "Add weight to this exercise"}><Text style={[styles.weightMode, { color: colors.mutedText }]}>{includesAddedWeight ? "− REMOVE ADDED WEIGHT" : "+ ADD WEIGHT"}</Text></Pressable>}
      </View>
      <View style={styles.valueBlock}>
        <View style={styles.valueRow}>
          {field === "weight" && supportsPlateDial ? <Pressable
            onPress={() => {
              if (weightInputMode === "plates") setWeightInputMode("keypad");
              else {
                setWeight(String(normalizeBarWeight(weight)));
                setWeightInputMode("plates");
              }
            }}
            style={({ pressed }) => [pressed && styles.valuePressed]}
            accessibilityRole="button"
            accessibilityLabel={weightInputMode === "plates" ? "Show weight keypad" : "Show plate loading"}
          >{valueDisplay}</Pressable> : valueDisplay}
          {value !== "" && !(field === "weight" && supportsPlateDial && weightInputMode === "plates") && <Pressable
            onPress={() => field === "weight" ? setWeight("") : setReps("")}
            style={styles.clearValue}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${field}`}
          ><Text style={[styles.clearValueText, { color: colors.mutedText }]}>CLEAR</Text></Pressable>}
        </View>
        {!!recentSets.length && <Pressable
          onPress={() => setHistoryOpen(true)}
          style={({ pressed }) => [styles.recentSets, pressed && styles.recentSetPressed]}
          accessibilityRole="button"
          accessibilityLabel="View latest set history"
        >
          <Text style={[styles.edgeLabel, { color: colors.mutedText }]}>HISTORY</Text>
          {recentSets.map((set, index) => <Animated.View key={`recent-${set.completedAt.getTime()}-${set.setNumber}`} entering={recentSetEnter} layout={plateLayout} style={styles.recentSet}>
            <Text numberOfLines={1} style={[styles.recentSetValue, { color: index === recentSets.length - 1 ? colors.text : colors.mutedText }]}>{requiresWeight ? `${set.weight}×${set.reps}` : set.weight ? `+${set.weight}×${set.reps}` : `${set.reps} reps`}</Text>
          </Animated.View>)}
        </Pressable>}
        <Pressable
          onPress={applyRecommendation}
          style={({ pressed }) => [styles.recommendationButton, pressed && styles.recommendationPressed]}
          accessibilityRole="button"
          accessibilityLabel={`Use recommendation: ${recommendationValue} for ${recommendation.sets} sets. ${recommendation.reason}`}
          accessibilityHint={usesWeight && recommendation.weight !== undefined ? "Fills weight and reps" : "Fills reps"}
        >
          <Text style={[styles.edgeLabel, { color: colors.accent }]}>{recommendationLabel}</Text>
          <Text numberOfLines={2} style={[styles.recommendationValue, { color: colors.text }]}>{usesWeight && recommendation.weight !== undefined ? `${recommendation.weight}×${recommendation.reps}` : `${recommendation.reps} reps`}</Text>
          <Text style={[styles.recommendationSets, { color: colors.subtleText }]}>{recommendation.sets} sets</Text>
        </Pressable>
      </View>
      <View style={styles.inputArea}>
          {supportsPlateDial && field === "weight" ? <ScrollView
            ref={inputPagerRef}
            style={styles.inputPager}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            bounces={false}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            onScroll={(event) => { inputScrollProgress.value = Math.max(0, Math.min(1, event.nativeEvent.contentOffset.x / inputAreaWidth)); }}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const nextMode: WeightInputMode = event.nativeEvent.contentOffset.x >= inputAreaWidth / 2 ? "keypad" : "plates";
              if (nextMode === weightInputMode) return;
              if (nextMode === "plates") setWeight(String(normalizeBarWeight(weight)));
              setWeightInputMode(nextMode);
              void Haptics.selectionAsync().catch(() => {});
            }}
          >
            <View style={[styles.inputPage, { width: inputAreaWidth }]} accessibilityElementsHidden={weightInputMode !== "plates"} importantForAccessibility={weightInputMode === "plates" ? "auto" : "no-hide-descendants"}>
              <PlateDial value={weight} onChange={(next) => { setWeight(next); setTyped((current) => ({ ...current, weight: true })); }} colors={colors} showSwipeHint={!plateHintDismissed} onSwipeStart={() => setPlateHintDismissed(true)} />
            </View>
            <View style={[styles.inputPage, { width: inputAreaWidth }]} accessibilityElementsHidden={weightInputMode !== "keypad"} importantForAccessibility={weightInputMode === "keypad" ? "auto" : "no-hide-descendants"}>
              {keypad}
            </View>
          </ScrollView> : <View style={[styles.inputPage, styles.inputPageSingle]}>{keypad}</View>}
          {supportsPlateDial && field === "weight" && <View style={styles.inputPagination} accessibilityRole="text" accessibilityLabel={`${weightInputMode === "plates" ? "Plate loading" : "Keypad"}, 2 input options`}>
            <Animated.View style={[styles.inputPaginationDot, plateDotStyle]} />
            <Animated.View style={[styles.inputPaginationDot, keypadDotStyle]} />
          </View>}
      </View>
      <View style={styles.footer}>
        {!validInput && value !== "" && <Text style={{ color: colors.mutedText, fontSize: 12 }}>{setNumber > 100 ? 'This exercise supports up to 100 sets per workout.' : 'Use up to 10,000 lb (two decimal places) and 1–10,000 whole reps.'}</Text>}
        <Pressable
          onPress={continueFlow}
          disabled={!validInput || saving}
          accessibilityState={{ disabled: !validInput || saving }}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: accentColor },
            !validInput && styles.saveDisabled,
            pressed && styles.savePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={action}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.saveText, { color: colors.accentText }]}>{action}</Text>
          )}
        </Pressable>
      </View>
      <Modal visible={restEndsAt !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={skipRest}>
        <SafeAreaView edges={["top", "left", "right"]} style={[styles.restModal, { backgroundColor: restDone ? colors.accent : colors.background }]}>
          <View style={[styles.restScreen, { paddingBottom: bottomInset + 15 }]}>
            <Text style={[styles.restTitle, { color: restDone ? colors.accentText : colors.mutedText }]}>Rest</Text>
            <View style={styles.restBody}>
              <View style={styles.restDial}>
                <Svg width="100%" height="100%" viewBox="0 0 300 300" accessibilityElementsHidden>
                  {restTicks.map((tick, index) => {
                    // Remaining time is the clockwise run of ticks ending at 12 o'clock.
                    // The boundary tick fades with the fractional remainder; 12 o'clock goes out with the last tick.
                    const position = index === 0 ? restTickCount - 1 : index;
                    const level = restDone ? 1 : Math.min(1, Math.max(0, restLitTicks - (restTickCount - 1 - position)));
                    const strokeWidth = index % 5 === 0 ? 5 : 4;
                    return <G key={index}>
                      {level < 1 && <Line {...tick} stroke={colors.surfaceStrong} strokeWidth={strokeWidth} strokeLinecap="round" />}
                      {level > 0 && <Line {...tick} stroke={restDone ? colors.accentText : colors.accent} strokeOpacity={level} strokeWidth={strokeWidth} strokeLinecap="round" />}
                    </G>;
                  })}
                </Svg>
                <Animated.View style={[styles.restTimeBlock, restTimeAnimatedStyle]}>
                  <Text accessibilityLiveRegion="polite" style={[styles.restTime, { color: restDone ? colors.accentText : colors.text }]}>{formatRest(restRemaining)}</Text>
                  <Text style={[styles.restTotal, { color: restDone ? colors.accentText : colors.subtleText }]}>of {formatRest(restDuration)}</Text>
                </Animated.View>
              </View>
              <View style={styles.restAdjustments}>
                <Pressable hitSlop={10} onPress={() => adjustRest(-15)} style={({ pressed }) => [styles.restAdjustButton, { backgroundColor: restDone ? `${colors.accentText}1F` : colors.surface }, pressed && styles.restPressed]} accessibilityRole="button" accessibilityLabel="Reduce rest by 15 seconds">
                  <Text style={[styles.restAdjustText, { color: restDone ? colors.accentText : colors.text }]}>−15</Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => adjustRest(15)} style={({ pressed }) => [styles.restAdjustButton, { backgroundColor: restDone ? `${colors.accentText}1F` : colors.surface }, pressed && styles.restPressed]} accessibilityRole="button" accessibilityLabel="Add 15 seconds of rest">
                  <Text style={[styles.restAdjustText, { color: restDone ? colors.accentText : colors.text }]}>+15</Text>
                </Pressable>
              </View>
            </View>
            <Pressable onPress={skipRest} style={({ pressed }) => [styles.skipRestButton, { backgroundColor: restDone ? colors.accentText : colors.accent }, pressed && styles.restPressed]} accessibilityRole="button">
              <Text style={[styles.skipRestText, { color: restDone ? colors.accent : colors.accentText }]}>Skip rest</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
      <Modal
        transparent
        visible={historySheetVisible}
        animationType="none"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View style={styles.modal}>
          {historyOpen && <>
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(200)} style={styles.backdropLayer}>
            <Pressable
              onPress={() => setHistoryOpen(false)}
              style={styles.backdrop}
            />
          </Animated.View>
          <Animated.View entering={SlideInDown.duration(280)} exiting={SlideOutDown.duration(200)} style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
            <View style={styles.sheetHeader}>
              <Text numberOfLines={2} style={[styles.sheetTitle, { color: colors.text }]}>{name}</Text>
              <Pressable onPress={() => setHistoryOpen(false)} hitSlop={12} style={styles.sheetClose}>
                <X width={24} height={24} color={colors.mutedText} strokeWidth={2} />
              </Pressable>
            </View>
            <StatsPanel initialExerciseId={exerciseId} history={history} onDeleteSet={deleteSet} embedded />
          </Animated.View>
          </>}
        </View>
      </Modal>
      <Modal transparent visible={supersetPickerOpen} animationType="none" onRequestClose={() => setSupersetPickerOpen(false)}>
        <View style={styles.modal}>
          <Animated.View entering={FadeIn.duration(180)} style={styles.backdropLayer}><Pressable onPress={() => setSupersetPickerOpen(false)} style={styles.backdrop} /></Animated.View>
          <Animated.View entering={SlideInDown.duration(280)} style={[styles.supersetSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
            <View style={styles.sheetHeader}>
              <View><Text style={[ui.eyebrow, { color: colors.mutedText }]}>SUPERSET</Text><Text style={[styles.pickerTitle, { color: colors.text }]}>Add an exercise</Text></View>
              <Pressable onPress={() => setSupersetPickerOpen(false)} hitSlop={12} style={styles.sheetClose}><X width={24} height={24} color={colors.mutedText} strokeWidth={2} /></Pressable>
            </View>
            <TextInput value={supersetQuery} onChangeText={setSupersetQuery} autoFocus placeholder="Search exercises" placeholderTextColor={colors.subtleText} style={[styles.supersetSearch, { backgroundColor: colors.surface, color: colors.text }]} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.pickerList}>
              {supersetCandidates.map((exercise) => <Pressable key={exercise.id} onPress={() => addSupersetExercise(exercise)} style={({ pressed }) => [styles.pickerRow, { borderColor: colors.surfaceStrong }, pressed && styles.supersetTabPressed]} accessibilityRole="button" accessibilityLabel={`Add ${exercise.name} to superset`}><ExerciseThumb exercise={exercise} size={46} /><View style={styles.pickerCopy}><Text numberOfLines={1} style={[styles.pickerName, { color: colors.text }]}>{exercise.name}</Text><Text numberOfLines={1} style={[styles.pickerMeta, { color: colors.mutedText }]}>{exercise.area} · {exercise.equipment}</Text></View><Plus width={19} height={19} color={colors.text} strokeWidth={2.5} /></Pressable>)}
              {!supersetCandidates.length && <Text style={[styles.emptyPicker, { color: colors.mutedText }]}>No available exercises match that search.</Text>}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
      <Modal transparent visible={infoOpen} animationType="none" onRequestClose={() => setInfoOpen(false)}>
        <View style={styles.modal}>
          <Animated.View entering={FadeIn.duration(180)} style={styles.backdropLayer}><Pressable onPress={() => setInfoOpen(false)} style={styles.backdrop} /></Animated.View>
          <Animated.View entering={SlideInDown.duration(280)} style={[styles.infoSheet, { backgroundColor: colors.background }]} accessibilityViewIsModal>
            <ExerciseDetailSheet key={exercise.id} exercise={exercise} onDismiss={() => setInfoOpen(false)} dismissIcon="close" headingDetails={exerciseDetails.meta ? <Text style={[styles.infoMeta, { color: colors.mutedText }]}>{exerciseDetails.meta}</Text> : undefined}>
              <Text style={[styles.infoSectionTitle, { color: colors.text }]}>How to</Text>
              {exerciseDetails.instructions.map((step, index) => <View key={`step-${index}`} style={styles.infoStep}>
                <Text style={[styles.infoStepNumber, { color: colors.accent, backgroundColor: colors.surface }]}>{index + 1}</Text>
                <Text style={[styles.infoStepText, { color: colors.text }]}>{step}</Text>
              </View>)}
              {!exerciseDetails.instructions.length && <Text style={[styles.emptyHistory, { color: colors.mutedText }]}>No instructions available for this exercise yet.</Text>}
            </ExerciseDetailSheet>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    height: 52,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    position: "absolute",
    top: 12,
    left: 64,
    right: 64,
    height: 28,
    textAlign: "center",
    textAlignVertical: "center",
    lineHeight: 28,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#141510",
  },
  supersetBar: { height: 44 },
  supersetTabs: { alignItems: "center", gap: 8, paddingHorizontal: 24, paddingVertical: 5 },
  supersetTab: { maxWidth: 144, height: 34, paddingHorizontal: 13, borderRadius: 12, justifyContent: "center" },
  supersetTabText: { fontSize: 12, fontWeight: "900", letterSpacing: -0.15 },
  addSupersetButton: { height: 34, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center" },
  addSupersetText: { fontSize: 11, fontWeight: "900", letterSpacing: -0.1 },
  supersetTabPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  exerciseBlock: { alignItems: "center", paddingTop: 30 },
  exerciseName: {
    fontSize: 22,
    letterSpacing: -0.8,
    fontWeight: "800",
    color: "#141510",
  },
  weightMode: { marginTop: 6, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  valueBlock: {
    height: 138,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    gap: 10,
  },
  value: {
    fontSize: 68,
    letterSpacing: -3.5,
    fontWeight: "900",
    color: "#0D0E0B",
    lineHeight: 76,
    fontVariant: ["tabular-nums"],
  },
  valuePressed: { opacity: 0.6 },
  // Absolute so appearing/disappearing doesn't shift the centered value.
  clearValue: { position: "absolute", left: "100%", bottom: 0, marginLeft: 10, minHeight: 44, justifyContent: "flex-end", paddingBottom: 13 },
  clearValueText: { fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  edgeLabel: { marginBottom: 5, fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  recommendationButton: { position: "absolute", top: 0, right: 24, bottom: 0, width: 72, justifyContent: "center", alignItems: "flex-end" },
  recommendationPressed: { opacity: 0.55 },
  recommendationValue: { maxWidth: 72, fontSize: 13, lineHeight: 15, textAlign: "right", fontWeight: "900", letterSpacing: -0.2, textTransform: "uppercase" },
  recommendationSets: { marginTop: 3, fontSize: 8, fontWeight: "800" },
  recentSets: { position: "absolute", top: 0, left: 24, bottom: 0, width: 64, gap: 3, justifyContent: "center", alignItems: "flex-start" },
  recentSet: { paddingVertical: 2, alignItems: "flex-end" },
  recentSetPressed: { opacity: 0.68 },
  recentSetValue: { fontSize: 11, fontWeight: "800", letterSpacing: -0.15, fontVariant: ["tabular-nums"] },
  inputArea: {
    flex: 1,
    width: "100%",
    transform: [{ translateY: -24 }],
    alignItems: "center",
    overflow: "hidden",
  },
  inputPager: { flex: 1, width: "100%" },
  inputPagination: { position: "absolute", bottom: 8, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 5 },
  inputPaginationDot: { width: 6, height: 6, borderRadius: 3 },
  inputPaginationDotSelected: { width: 12 },
  inputPage: { height: "100%", paddingTop: 34 },
  inputPageSingle: { width: "100%" },
  keypad: {
    flex: 1,
    width: "100%",
    paddingTop: 10,
    paddingHorizontal: 45,
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "space-around",
  },
  key: {
    width: "33.333%",
    height: 62,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 34,
  },
  keyPressed: { backgroundColor: "#F0F1ED" },
  keyText: { fontSize: 30, fontWeight: "700", color: "#10110E" },
  plateDial: { flex: 1, width: "100%", paddingTop: 32, alignItems: "center" },
  barbell: { height: 144, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  barEnd: { width: 30, height: 4, borderRadius: 2 },
  plateSide: { height: 76, flexDirection: "row", alignItems: "center" },
  plateSideLeft: { justifyContent: "flex-end" },
  plateSideRight: { justifyContent: "flex-start" },
  barPlate: { minHeight: 24, maxHeight: 58, marginHorizontal: 1, borderRadius: 3 },
  barCollar: { width: 7, height: 27, borderRadius: 2, zIndex: 1 },
  barGrip: { width: 74, height: 7, borderRadius: 2 },
  plateSummary: { maxWidth: "86%", minHeight: 20, marginTop: 4, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8 },
  plateSummaryLabel: { fontSize: 11, fontWeight: "800" },
  plateSummaryValue: { flexShrink: 1, fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  rulerFrame: { width: "100%", height: rulerHeight, marginTop: 56, overflow: "hidden" },
  rulerScroll: { height: rulerHeight, flexGrow: 0 },
  rulerTickSlot: { width: plateTickWidth, height: rulerHeight, alignItems: "center", justifyContent: "center" },
  rulerTick: { width: 3, height: 17, borderRadius: 1.5 },
  rulerTickMajor: { height: 32 },
  rulerIndicator: { position: "absolute", top: 28, left: "50%", width: 4, height: 32, marginLeft: -2, borderRadius: 2 },
  rulerEdgeFade: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  footer: { paddingHorizontal: 24, paddingBottom: 15 },
  saveButton: {
    height: 60,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFCC4A",
  },
  saveDisabled: { backgroundColor: "#C9CCC4" },
  savePressed: { transform: [{ scale: 0.985 }], opacity: 0.9 },
  saveText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#141510",
    letterSpacing: -0.3,
  },
  restModal: { flex: 1 },
  restScreen: { flex: 1, paddingHorizontal: 24, paddingTop: 28, alignItems: "center" },
  restTitle: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  restBody: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  restDial: { width: 300, height: 300, alignItems: "center", justifyContent: "center" },
  restTimeBlock: { position: "absolute", alignItems: "center" },
  restTime: { fontSize: 76, lineHeight: 82, fontWeight: "900", fontVariant: ["tabular-nums"], letterSpacing: -4 },
  restTotal: { marginTop: 2, fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] },
  restAdjustments: { marginTop: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20 },
  restAdjustButton: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  restAdjustText: { fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  skipRestButton: { width: "100%", height: 60, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  skipRestText: { fontSize: 16, fontWeight: "900", letterSpacing: -0.3 },
  restPressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  modal: { flex: 1, justifyContent: "flex-end" },
  backdropLayer: { ...StyleSheet.absoluteFill },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(13,14,11,.3)",
  },
  sheet: {
    height: "88%",
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#FFFFFF",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D9DBD4",
  },
  sheetHeader: {
    marginTop: 18,
    marginBottom: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    flex: 1,
    flexShrink: 1,
    paddingRight: 16,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.9,
    color: "#141510",
  },
  sheetClose: { width: 32, height: 32, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  supersetSheet: { height: "78%", paddingHorizontal: 24, paddingTop: 10, paddingBottom: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  infoSheet: { height: "92%", borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: "hidden" },
  infoMeta: { marginTop: 14, fontSize: 12, lineHeight: 18, fontWeight: "600", textTransform: "capitalize" },
  infoSectionTitle: { marginBottom: 18, fontSize: 20, fontWeight: "900", letterSpacing: -.5 },
  infoStep: { flexDirection: "row", gap: 12, marginBottom: 16 },
  infoStepNumber: { width: 24, height: 24, borderRadius: 12, textAlign: "center", textAlignVertical: "center", lineHeight: 24, fontSize: 12, fontWeight: "900" },
  infoStepText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  pickerTitle: { marginTop: 3, fontSize: 24, fontWeight: "900", letterSpacing: -0.9 },
  supersetSearch: { height: 48, paddingHorizontal: 15, borderRadius: 15, fontSize: 15, fontWeight: "700" },
  pickerList: { paddingTop: 10, paddingBottom: 20 },
  pickerRow: { minHeight: 62, paddingVertical: 8, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  pickerCopy: { flex: 1, minWidth: 0 },
  pickerName: { fontSize: 16, fontWeight: "900", letterSpacing: -0.35 },
  pickerMeta: { marginTop: 3, fontSize: 10, fontWeight: "800", letterSpacing: 0.55 },
  emptyPicker: { paddingVertical: 28, textAlign: "center", fontSize: 13, fontWeight: "700" },
  emptyHistory: { fontSize: 14, color: "#767A71" },
});
