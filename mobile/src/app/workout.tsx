import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Delete, Info, Minus, Plus, Trash2, X } from "react-native-feather";
import { useEffect, useMemo, useRef, useState } from "react";
import Animated, { cancelAnimation, Easing, FadeIn, SlideInDown, useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Circle, Polyline } from "react-native-svg";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Swipeable from "react-native-gesture-handler/Swipeable";
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
import { getProgressiveOverloadRecommendation } from "@/lib/exercise-recommendations";
import { normalizeRestTimerSeconds } from "@/lib/appearance";

type Field = "weight" | "reps";
const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"];
const formatHistoryDate = (date: Date) =>
  `${date.getMonth() + 1}/${date.getDate()}`;
const exerciseCatalog = getExercises();
const exerciseImageBase = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";
const restCenter = 72;
const restRadius = 64;
const restPieRadius = restRadius / 2;
const restCircumference = 2 * Math.PI * restPieRadius;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
  const params = useLocalSearchParams<{
    id: string;
    name: string;
    area: string;
    mark: string;
    color: string;
    workoutId: string;
    recommendedSets?: string;
    recommendedRepMin?: string;
    recommendedRepMax?: string;
    recommendedRestSeconds?: string;
    superset?: string | string[];
  }>();
  const exerciseId = params.id ?? "free_exercise_db:Barbell_Squat";
  const name = params.name ?? "Barbell Squat";
  const accentColor = colors.accent;
  const workoutId = params.workoutId ?? "legacy-workout";
  const [routeRecommendation] = useState(() => Number(params.recommendedSets) && Number(params.recommendedRepMin) && Number(params.recommendedRepMax) ? {
    exerciseId,
    sets: params.recommendedSets!,
    repMin: params.recommendedRepMin!,
    repMax: params.recommendedRepMax!,
    restSeconds: params.recommendedRestSeconds ?? "",
  } : null);
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
  const defaultPrescription = useMemo(() => {
    let compound = false;
    try { compound = JSON.parse(exercise.detailsJson ?? "{}").mechanic === "compound"; } catch { /* Use conservative accessory defaults for malformed catalog data. */ }
    return { sets: compound ? 3 : 2, reps: compound ? { min: 6, max: 10 } : { min: 10, max: 15 }, restSeconds: compound ? 120 : 75 };
  }, [exercise.detailsJson]);
  const prescription = useMemo(() => ({
    sets: Number(params.recommendedSets) || defaultPrescription.sets,
    reps: {
      min: Number(params.recommendedRepMin) || defaultPrescription.reps.min,
      max: Number(params.recommendedRepMax) || defaultPrescription.reps.max,
    },
    restSeconds: Number(params.recommendedRestSeconds) || defaultPrescription.restSeconds,
  }), [defaultPrescription, params.recommendedRepMax, params.recommendedRepMin, params.recommendedRestSeconds, params.recommendedSets]);
  const exerciseDetails = useMemo(() => {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(exercise.detailsJson ?? "{}") ?? {}; } catch { /* Catalog rows may lack details; show the empty state. */ }
    const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    const instructions = strings(parsed.instructions);
    const images = strings(parsed.images);
    const muscles = strings(parsed.primaryMuscles);
    const meta = [typeof parsed.level === "string" ? parsed.level : "", exercise.equipment, muscles.join(", ")].filter(Boolean).join(" · ");
    return { instructions, images, meta };
  }, [exercise.detailsJson, exercise.equipment]);
  const [field, setField] = useState<Field>("weight");
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [includesAddedWeight, setIncludesAddedWeight] = useState(false);
  const usesWeight = requiresWeight || includesAddedWeight;
  const [setNumber, setSetNumber] = useState(1);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<WorkoutHistoryPoint[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [supersetPickerOpen, setSupersetPickerOpen] = useState(false);
  const [supersetQuery, setSupersetQuery] = useState("");
  const [restDuration, setRestDuration] = useState(restTimerSeconds);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [restNow, setRestNow] = useState(() => Date.now());
  const restProgress = useSharedValue(1);
  const restScale = useSharedValue(1);
  const restCircleAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: restCircumference * (1 - restProgress.value),
  }));
  const restTimeAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: restScale.value }] }));
  const [selectedSetIndex, setSelectedSetIndex] = useState<number | null>(null);
  const [renderedAt] = useState(() => Date.now());
  const pastSetsScrollRef = useRef<ScrollView>(null);
  const skippingRestRef = useRef(false);
  const supersetIds = useMemo(() => readSupersetIds(params.superset, exerciseId), [exerciseId, params.superset]);
  const supersetExercises = useMemo(() => supersetIds
    .map((id) => exerciseCatalog.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise)), [supersetIds]);
  const supersetCandidates = useMemo(() => {
    const query = supersetQuery.trim().toLowerCase();
    return exerciseCatalog.filter((exercise) => !supersetIds.includes(exercise.id)
      && (!query || exercise.name.toLowerCase().includes(query))).slice(0, 40);
  }, [supersetIds, supersetQuery]);
  useEffect(() => {
    if (restEndsAt === null) return;
    const tick = () => {
      const now = Date.now();
      if (skippingRestRef.current) return;
      setRestNow(now);
      if (now >= restEndsAt) setRestEndsAt(null);
    };
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [restEndsAt]);
  useEffect(() => {
    const timer = setTimeout(() => {
      const nextHistory = getWorkoutHistory(exerciseId);
      const currentSets = nextHistory.filter((set) => set.workoutId === workoutId);
      const firstSet = currentSets.find((set) => set.setNumber === 1);
      const lastSet = currentSets.at(-1);
      const continueAddedWeight = !requiresWeight && Boolean(lastSet?.weight);
      setSetNumber(getNextSetNumberForWorkout(exerciseId, workoutId));
      setHistory(nextHistory);
      setIncludesAddedWeight(continueAddedWeight);
      setWeight(String((requiresWeight ? firstSet : continueAddedWeight ? lastSet : undefined)?.weight ?? ""));
      setReps(firstSet ? String(firstSet.reps) : "");
      setField(requiresWeight || continueAddedWeight ? "weight" : "reps");
      setSelectedSetIndex(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [exerciseId, requiresWeight, workoutId]);
  const value = field === "weight" ? weight : reps;
  function edit(key: string) {
    const next = (v: string) =>
      key === "backspace"
        ? v.slice(0, -1)
        : key === "." && (field === "reps" || v.includes("."))
          ? v
          : v === "0"
            ? key
            : v + key;
    if (field === "weight") setWeight(next);
    else setReps(next);
  }
  async function saveSet() {
    if ((usesWeight && !Number(weight)) || !Number(reps) || saving) return;
    setSaving(true);
    try {
      saveWorkoutSet({
        exerciseId,
        workoutId,
        setNumber,
        weight: usesWeight ? Math.round(Number(weight)) : 0,
        reps: Math.round(Number(reps)),
        completedAt: new Date(),
      });
      setSetNumber((v) => v + 1);
      const nextHistory = getWorkoutHistory(exerciseId);
      const currentSets = nextHistory.filter((set) => set.workoutId === workoutId);
      const firstSet = currentSets.find((set) => set.setNumber === 1);
      const lastSet = currentSets.at(-1);
      setHistory(nextHistory);
      setWeight(String((requiresWeight ? firstSet : lastSet?.weight ? lastSet : undefined)?.weight ?? ""));
      setReps(String(firstSet?.reps ?? ""));
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
    if (set.workoutId === workoutId && history.filter((item) => item.workoutId === workoutId).length === 1) {
      recordRecommendationFeedback(workoutId, exerciseId, "removed");
    }
    deleteWorkoutSet(exerciseId, set);
    setHistory(getWorkoutHistory(exerciseId));
    setSelectedSetIndex(null);
    setSetNumber(getNextSetNumberForWorkout(exerciseId, workoutId));
  }
  function selectHistoryPoint(index: number, scrollToSet = false) {
    setSelectedSetIndex(index);
    if (scrollToSet) {
      const reverseIndex = history.length - 1 - index;
      pastSetsScrollRef.current?.scrollTo({
        y: Math.max(0, reverseIndex * 60 - 8),
        animated: true,
      });
    }
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
    restProgress.value = 1;
    restProgress.value = withTiming(0, { duration: duration * 1_000, easing: Easing.linear });
    setRestDuration(duration);
    setRestNow(now);
    setRestEndsAt(now + duration * 1_000);
  }
  function adjustRest(seconds: number) {
    if (skippingRestRef.current) return;
    const nextDuration = Math.max(15, Math.min(600, restDuration + seconds));
    const delta = nextDuration - restDuration;
    const nextRemaining = Math.max(0, (restEndsAt ?? Date.now()) - Date.now() + delta * 1_000);
    const transitionDuration = Math.min(180, nextRemaining);
    restProgress.value = withSequence(
      withSpring(Math.min(1, nextRemaining / (nextDuration * 1_000)), { duration: transitionDuration, dampingRatio: 0.55 }),
      withTiming(0, { duration: Math.max(0, nextRemaining - transitionDuration), easing: Easing.linear }),
    );
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
    const startedAt = Date.now();
    const endsAt = restEndsAt ?? startedAt;
    const remaining = Math.max(0, endsAt - startedAt);
    setRestNow(endsAt);
    cancelAnimation(restProgress);
    restProgress.value = Math.min(1, remaining / (restDuration * 1_000));
    restProgress.value = withTiming(0, { duration, easing: Easing.linear });
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
    const recommended = routeRecommendation?.exerciseId === exercise.id ? routeRecommendation : null;
    router.setParams({
      ...exercise,
      workoutId,
      superset: JSON.stringify(ids),
      recommendedSets: recommended?.sets ?? "",
      recommendedRepMin: recommended?.repMin ?? "",
      recommendedRepMax: recommended?.repMax ?? "",
      recommendedRestSeconds: recommended?.restSeconds ?? "",
    });
  }
  function addSupersetExercise(exercise: Exercise) {
    const ids = [...supersetIds, exercise.id];
    setSupersetPickerOpen(false);
    setSupersetQuery("");
    switchExercise(exercise, ids);
  }
  const action = field === "weight" ? "Next" : "Log set";
  const restRemaining = restEndsAt === null ? 0 : Math.max(0, Math.ceil((restEndsAt - restNow) / 1_000));
  const formatRest = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const weights = history.map((set) => set.weight);
  const repsValues = history.map((set) => set.reps);
  const rawMinWeight = history.length ? Math.min(...weights) : 0;
  const rawMaxWeight = history.length ? Math.max(...weights) : 1;
  const weightStep = rawMaxWeight - rawMinWeight <= 20 ? 5 : 10;
  const minWeight = Math.max(0, Math.floor((rawMinWeight - weightStep) / weightStep) * weightStep);
  const maxWeight = Math.ceil((rawMaxWeight + weightStep) / weightStep) * weightStep;
  const rawMinReps = history.length ? Math.min(...repsValues) : 0;
  const rawMaxReps = history.length ? Math.max(...repsValues) : 1;
  const minReps = Math.max(0, rawMinReps - 1);
  const maxReps = Math.max(rawMaxReps, minReps + 1) + 1;
  const newestTime = Math.max(...history.map((set) => set.completedAt.getTime()), renderedAt);
  const volumeByWorkout = history.reduce((volumes, set) => {
    volumes.set(set.workoutId, (volumes.get(set.workoutId) ?? 0) + (requiresWeight ? set.weight * set.reps : set.reps));
    return volumes;
  }, new Map<string, number>());
  const volumeHistory = Array.from(volumeByWorkout, ([id, volume]) => ({
    id,
    volume,
    time: Math.min(...history.filter((set) => set.workoutId === id).map((set) => set.completedAt.getTime())),
  })).sort((a, b) => a.time - b.time);
  const minVolume = Math.min(...volumeHistory.map((point) => point.volume));
  const maxVolume = Math.max(...volumeHistory.map((point) => point.volume));
  const volumeRange = maxVolume - minVolume || 1;
  const volumeLinePoints = volumeHistory
    .map((point, index) => {
      const x = 8 + (index / (volumeHistory.length - 1)) * 84;
      const y = 87 - ((point.volume - minVolume) / volumeRange) * 70;
      return `${x},${y}`;
    })
    .join(" ");
  const estimatedStrength = (set: WorkoutHistoryPoint) => requiresWeight ? Math.round(set.weight * (1 + set.reps / 30)) : set.reps;
  const strongestSetIndex = history.reduce(
    (strongest, set, index) => estimatedStrength(set) > estimatedStrength(history[strongest]) ? index : strongest,
    0,
  );
  const activeSetIndex = selectedSetIndex ?? history.length - 1;
  const activeSet = history[activeSetIndex];
  const recentSets = history.slice(-5);
  const recommendation = useMemo(
    () => getProgressiveOverloadRecommendation(history, prescription, {
      currentWorkoutId: workoutId,
      exhaustion: getRecentExerciseExhaustion(exerciseId, workoutId),
    }),
    [exerciseId, history, prescription, workoutId],
  );
  const recommendationValue = `${usesWeight && recommendation.weight !== undefined ? `${recommendation.weight} lb × ` : ""}${recommendation.reps} reps`;
  const recommendationLabel = ({ start: "START", increase: "ADD WEIGHT", retain: "HOLD", reduce: "EASE BACK", deload: "LIGHT DAY" } as const)[recommendation.action];
  function applyRecommendation() {
    if (recommendation.weight !== undefined) setWeight(String(recommendation.weight));
    setReps(String(recommendation.reps));
  }
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
          {supersetExercises.map((exercise) => {
            const active = exercise.id === exerciseId;
            return <Pressable
              key={exercise.id}
              onPress={() => !active && switchExercise(exercise)}
              style={({ pressed }) => [styles.supersetTab, { backgroundColor: active ? colors.accent : colors.surface }, pressed && !active && styles.supersetTabPressed]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Switch to ${exercise.name}`}
            ><Text numberOfLines={1} style={[styles.supersetTabText, { color: active ? colors.accentText : colors.mutedText }]}>{exercise.name}</Text></Pressable>;
          })}
          <Pressable
            onPress={() => setSupersetPickerOpen(true)}
            style={({ pressed }) => [styles.addSupersetButton, { borderColor: colors.surfaceStrong }, pressed && styles.supersetTabPressed]}
            accessibilityRole="button"
            accessibilityLabel="Add an exercise to this superset"
          ><Plus width={15} height={15} color={colors.text} strokeWidth={3} /><Text style={[styles.addSupersetText, { color: colors.text }]}>Superset</Text></Pressable>
        </ScrollView>
      </View>
      <View style={styles.exerciseBlock}>
        <Text style={[styles.exerciseName, { color: colors.text }]}>SET {setNumber}</Text>
        {!requiresWeight && <Pressable onPress={toggleAddedWeight} hitSlop={8} accessibilityRole="button" accessibilityLabel={includesAddedWeight ? "Remove added weight" : "Add weight to this exercise"}><Text style={[styles.weightMode, { color: colors.mutedText }]}>{includesAddedWeight ? "− REMOVE ADDED WEIGHT" : "+ ADD WEIGHT"}</Text></Pressable>}
      </View>
      <View style={styles.valueBlock}>
        <View style={styles.valueRow}>
          <Pressable
            onPress={() => field === "weight" ? setWeight("") : setReps("")}
            style={({ pressed }) => [pressed && styles.valuePressed]}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${field}`}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.value, { color: colors.text }]}>
              {value || "0"}
              {field === "weight" ? " lb" : " reps"}
            </Text>
          </Pressable>
        </View>
        {!!recentSets.length && <Pressable
          onPress={() => setHistoryOpen(true)}
          style={({ pressed }) => [styles.recentSets, pressed && styles.recentSetPressed]}
          accessibilityRole="button"
          accessibilityLabel="View latest set history"
        >
          <Text style={[styles.edgeLabel, { color: colors.subtleText }]}>HISTORY</Text>
          {recentSets.map((set, index) => <View key={`recent-${set.completedAt.getTime()}-${set.setNumber}-${index}`} style={[styles.recentSet, { opacity: 0.6 + (index / Math.max(1, recentSets.length - 1)) * 0.4 }]}>
            <Text numberOfLines={1} style={[styles.recentSetValue, { color: colors.subtleText }]}>{requiresWeight ? `${set.weight}×${set.reps}` : set.weight ? `+${set.weight}×${set.reps}` : `${set.reps} reps`}</Text>
          </View>)}
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
      <View style={styles.keypad}>
        {keys.map((key) => (
          <Pressable
            key={key}
            onPress={() => edit(key)}
            style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.surface }]}
          >
            {key === "backspace" ? (
              <Delete width={25} height={25} color={colors.text} strokeWidth={2.25} />
            ) : (
              <Text style={[styles.keyText, { color: colors.text }]}>{key}</Text>
            )}
          </Pressable>
        ))}
      </View>
      <View style={styles.footer}>
        <Pressable
          onPress={continueFlow}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: accentColor },
            !Number(value) && styles.saveDisabled,
            pressed && styles.savePressed,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.saveText, { color: colors.accentText }]}>{action}</Text>
          )}
        </Pressable>
      </View>
      <Modal visible={restEndsAt !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={skipRest}>
        <SafeAreaView style={[styles.restModal, { backgroundColor: colors.background }]}>
          <View style={styles.restScreen}>
            <Text style={[styles.restTitle, { color: colors.text }]}>Rest Timer</Text>
            <View style={styles.restBody}>
              <View style={styles.restDial}>
                <Svg width="100%" height="100%" viewBox="0 0 144 144" accessibilityElementsHidden>
                  <Circle cx={restCenter} cy={restCenter} r={restRadius} fill={colors.surface} />
                  <AnimatedCircle
                    animatedProps={restCircleAnimatedProps}
                    cx={restCenter}
                    cy={restCenter}
                    r={restPieRadius}
                    fill="none"
                    stroke={colors.accent}
                    strokeWidth={restRadius}
                    strokeLinecap="butt"
                    strokeDasharray={`${restCircumference} ${restCircumference}`}
                    transform={`rotate(-90 ${restCenter} ${restCenter})`}
                  />
                </Svg>
                <Animated.Text accessibilityLiveRegion="polite" style={[styles.restTime, { color: colors.text }, restTimeAnimatedStyle]}>{formatRest(restRemaining)}</Animated.Text>
              </View>
              <View style={styles.restAdjustments}>
                <Pressable hitSlop={10} onPress={() => adjustRest(-15)} style={({ pressed }) => [styles.restAdjustButton, pressed && styles.restPressed]} accessibilityRole="button" accessibilityLabel="Reduce rest by 15 seconds">
                  <Text style={[styles.restAdjustText, { color: colors.text }]}>−15</Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => adjustRest(15)} style={({ pressed }) => [styles.restAdjustButton, pressed && styles.restPressed]} accessibilityRole="button" accessibilityLabel="Add 15 seconds of rest">
                  <Text style={[styles.restAdjustText, { color: colors.text }]}>+15</Text>
                </Pressable>
              </View>
            </View>
            <Pressable onPress={skipRest} style={({ pressed }) => [styles.skipRestButton, { backgroundColor: colors.accent }, pressed && styles.restPressed]} accessibilityRole="button">
              <Text style={[styles.skipRestText, { color: colors.accentText }]}>Skip rest</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
      <Modal
        transparent
        visible={historyOpen}
        animationType="none"
        onRequestClose={() => setHistoryOpen(false)}
      >
        <View style={styles.modal}>
          <Animated.View entering={FadeIn.duration(180)} style={styles.backdropLayer}>
            <Pressable
              onPress={() => setHistoryOpen(false)}
              style={styles.backdrop}
            />
          </Animated.View>
          <Animated.View entering={SlideInDown.duration(280)} style={[styles.sheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
            <View style={styles.sheetHeader}>
              <Text numberOfLines={2} style={[styles.sheetTitle, { color: colors.text }]}>{name}</Text>
              <Pressable onPress={() => setHistoryOpen(false)} hitSlop={12} style={styles.sheetClose}>
                <X width={24} height={24} color={colors.mutedText} strokeWidth={2} />
              </Pressable>
            </View>
            {history.length ? (
              <>
                <View style={styles.scatterChart}>
                  {volumeHistory.length > 1 && (
                    <Svg
                      accessibilityElementsHidden
                      pointerEvents="none"
                      style={styles.volumeChart}
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                    >
                      <Polyline
                        points={volumeLinePoints}
                        fill="none"
                        stroke={colors.subtleText}
                        strokeOpacity={0.72}
                        strokeWidth={0.8}
                        vectorEffect="non-scaling-stroke"
                      />
                    </Svg>
                  )}
                  <View style={styles.repsAxis}>
                    <Plus width={10} height={10} color={colors.subtleText} strokeWidth={2.5} />
                    <Text style={[styles.directionText, { color: colors.subtleText }]}>REPS</Text>
                    <Minus width={10} height={10} color={colors.subtleText} strokeWidth={2.5} />
                  </View>
                  <View style={styles.weightAxis}>
                    {requiresWeight ? <Minus width={10} height={10} color={colors.subtleText} strokeWidth={2.5} /> : <Text style={[styles.directionText, { color: colors.subtleText }]}>OLDER</Text>}
                    {requiresWeight && <Text style={[styles.directionText, { color: colors.subtleText }]}>WEIGHT</Text>}
                    {requiresWeight ? <Plus width={10} height={10} color={colors.subtleText} strokeWidth={2.5} /> : <Text style={[styles.directionText, { color: colors.subtleText }]}>NEWER</Text>}
                  </View>
                  {history.map((set, index) => {
                    const progress = history.length === 1 ? 1 : index / (history.length - 1);
                    const ageInDays = Math.max(0, (newestTime - set.completedAt.getTime()) / 86_400_000);
                    const opacity = Math.max(0.25, (0.46 + progress * 0.54) * Math.max(0.52, 1 - ageInDays / 180));
                    const left = 8 + (requiresWeight ? (set.weight - minWeight) / (maxWeight - minWeight) : index / Math.max(history.length - 1, 1)) * 84;
                    const bottom = 13 + ((set.reps - minReps) / (maxReps - minReps)) * 70;
                    const isActive = activeSetIndex === index;
                    return (
                      <Pressable
                        key={`${set.completedAt.getTime()}-${set.setNumber}-${index}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${formatHistoryDate(set.completedAt)}: ${requiresWeight ? `${set.weight} pounds for ` : set.weight ? `${set.weight} pounds added for ` : ''}${set.reps} reps`}
                        onPress={() => selectHistoryPoint(index, true)}
                        hitSlop={10}
                        style={[
                          styles.scatterDot,
                          {
                            left: `${left}%`,
                            bottom: `${bottom}%`,
                            backgroundColor: colors.accent,
                            opacity,
                          },
                          isActive && styles.activeDot,
                        ]}
                      />
                    );
                  })}
                </View>
                {activeSet && (
                  <>
                    <View style={styles.selectedSet}>
                      <View>
                        <Text style={[styles.selectedMeta, { color: colors.mutedText }]}>
                          {activeSet.workoutId === workoutId ? 'THIS WORKOUT' : 'PAST WORKOUT'} · SET {activeSet.setNumber}
                        </Text>
                        <Text style={[styles.selectedValue, { color: colors.text }]}>{requiresWeight ? `${activeSet.weight} LB × ` : activeSet.weight ? `+${activeSet.weight} LB × ` : ''}{activeSet.reps} REPS</Text>
                      </View>
                      <Text style={[styles.selectedNote, { backgroundColor: colors.accent, color: colors.accentText }]}>
                        {activeSetIndex === strongestSetIndex ? "BEST\nSET" : activeSetIndex === history.length - 1 ? "LATEST\nSET" : "PAST\nSET"}
                      </Text>
                    </View>
                    <View style={styles.pastSets}>
                      <Text style={[styles.pastSetsTitle, { color: colors.mutedText }]}>PAST SETS</Text>
                      <ScrollView
                        ref={pastSetsScrollRef}
                        bounces={false}
                        showsVerticalScrollIndicator={false}
                        style={styles.pastSetsScroll}
                      >
                        {[...history].reverse().map((set, reverseIndex) => {
                          const index = history.length - 1 - reverseIndex;
                          const isActive = index === activeSetIndex;
                          return (
                            <Swipeable
                              key={`past-${set.completedAt.getTime()}-${set.setNumber}-${index}`}
                              friction={2}
                              rightThreshold={44}
                              overshootRight={false}
                              renderRightActions={() => (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Delete workout set ${set.setNumber}`}
                                  onPress={() => deleteSet(set)}
                                  style={({ pressed }) => [styles.deleteAction, pressed && styles.deleteActionPressed]}
                                >
                                  <Trash2 width={19} height={19} color="#FFFFFF" strokeWidth={2.5} />
                                </Pressable>
                              )}
                            >
                              <Pressable
                                onPress={() => selectHistoryPoint(index)}
                                style={({ pressed }) => [styles.pastSetRow, { backgroundColor: isActive ? `${colors.accent}38` : colors.surface }, pressed && styles.pastSetRowPressed]}
                              >
                                <Text style={[styles.pastSetDate, { color: colors.mutedText }]}>
                                  {set.workoutId === workoutId ? 'THIS WORKOUT' : 'PAST WORKOUT'} · SET {set.setNumber}
                                </Text>
                                <Text style={[styles.pastSetValue, { color: colors.text }]}>{requiresWeight ? `${set.weight} LB × ` : set.weight ? `+${set.weight} LB × ` : ''}{set.reps} REPS</Text>
                              </Pressable>
                            </Swipeable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  </>
                )}
              </>
            ) : (
              <Text style={[styles.emptyHistory, { color: colors.mutedText }]}>No sets logged yet.</Text>
            )}
          </Animated.View>
        </View>
      </Modal>
      <Modal transparent visible={supersetPickerOpen} animationType="slide" onRequestClose={() => setSupersetPickerOpen(false)}>
        <View style={styles.modal}>
          <Pressable onPress={() => setSupersetPickerOpen(false)} style={styles.backdrop} />
          <View style={[styles.supersetSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
            <View style={styles.sheetHeader}>
              <View><Text style={[styles.pickerEyebrow, { color: colors.mutedText }]}>SUPERSET</Text><Text style={[styles.pickerTitle, { color: colors.text }]}>Add an exercise</Text></View>
              <Pressable onPress={() => setSupersetPickerOpen(false)} hitSlop={12} style={styles.sheetClose}><X width={24} height={24} color={colors.mutedText} strokeWidth={2} /></Pressable>
            </View>
            <TextInput value={supersetQuery} onChangeText={setSupersetQuery} autoFocus placeholder="Search exercises" placeholderTextColor={colors.subtleText} style={[styles.supersetSearch, { backgroundColor: colors.surface, color: colors.text }]} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.pickerList}>
              {supersetCandidates.map((exercise) => <Pressable key={exercise.id} onPress={() => addSupersetExercise(exercise)} style={({ pressed }) => [styles.pickerRow, { borderColor: colors.surfaceStrong }, pressed && styles.supersetTabPressed]} accessibilityRole="button" accessibilityLabel={`Add ${exercise.name} to superset`}><View style={styles.pickerCopy}><Text numberOfLines={1} style={[styles.pickerName, { color: colors.text }]}>{exercise.name}</Text><Text numberOfLines={1} style={[styles.pickerMeta, { color: colors.mutedText }]}>{exercise.area} · {exercise.equipment}</Text></View><Plus width={19} height={19} color={colors.text} strokeWidth={2.5} /></Pressable>)}
              {!supersetCandidates.length && <Text style={[styles.emptyPicker, { color: colors.mutedText }]}>No available exercises match that search.</Text>}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal transparent visible={infoOpen} animationType="slide" onRequestClose={() => setInfoOpen(false)}>
        <View style={styles.modal}>
          <Pressable onPress={() => setInfoOpen(false)} style={styles.backdrop} />
          <View style={[styles.infoSheet, { backgroundColor: colors.background }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
            <View style={styles.sheetHeader}>
              <View style={styles.infoHeading}>
                <Text style={[styles.pickerEyebrow, { color: colors.mutedText }]}>HOW TO</Text>
                <Text numberOfLines={2} style={[styles.infoTitle, { color: colors.text }]}>{name}</Text>
                {!!exerciseDetails.meta && <Text numberOfLines={2} style={[styles.infoMeta, { color: colors.mutedText }]}>{exerciseDetails.meta}</Text>}
              </View>
              <Pressable onPress={() => setInfoOpen(false)} hitSlop={12} style={styles.sheetClose}><X width={24} height={24} color={colors.mutedText} strokeWidth={2} /></Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.infoContent}>
              {!!exerciseDetails.images.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.infoGallery}>
                {exerciseDetails.images.map((image, index) => <Image key={`${image}-${index}`} source={{ uri: `${exerciseImageBase}${image}` }} style={[styles.infoImage, { backgroundColor: colors.surface }]} resizeMode="cover" accessibilityLabel={`${name} demonstration, image ${index + 1}`} />)}
              </ScrollView>}
              {exerciseDetails.instructions.map((step, index) => <View key={`step-${index}`} style={styles.infoStep}>
                <Text style={[styles.infoStepNumber, { color: colors.accent, backgroundColor: colors.surface }]}>{index + 1}</Text>
                <Text style={[styles.infoStepText, { color: colors.text }]}>{step}</Text>
              </View>)}
              {!exerciseDetails.instructions.length && <Text style={[styles.emptyHistory, { color: colors.mutedText }]}>No instructions available for this exercise yet.</Text>}
            </ScrollView>
          </View>
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
  },
  valuePressed: { opacity: 0.6 },
  edgeLabel: { marginBottom: 5, fontSize: 7, fontWeight: "900", letterSpacing: 0.7 },
  recommendationButton: { position: "absolute", top: 0, right: 16, bottom: 0, width: 72, justifyContent: "center", alignItems: "flex-end" },
  recommendationPressed: { opacity: 0.55 },
  recommendationValue: { maxWidth: 72, fontSize: 13, lineHeight: 15, textAlign: "right", fontWeight: "900", letterSpacing: -0.2, textTransform: "uppercase" },
  recommendationSets: { marginTop: 3, fontSize: 8, fontWeight: "800" },
  recentSets: { position: "absolute", top: 0, left: 16, bottom: 0, width: 64, gap: 5, justifyContent: "center", alignItems: "flex-start" },
  recentSet: { paddingVertical: 2, alignItems: "flex-end" },
  recentSetPressed: { opacity: 0.68 },
  recentSetValue: { fontSize: 9, fontWeight: "800", letterSpacing: -0.15 },
  keypad: {
    flex: 1,
    transform: [{ translateY: -24 }],
    paddingTop: 22,
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
  restScreen: { flex: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 16, alignItems: "center" },
  restTitle: { fontSize: 28, fontWeight: "900", letterSpacing: -1 },
  restBody: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  restDial: { width: 310, height: 310, alignItems: "center", justifyContent: "center" },
  restTime: { position: "absolute", width: 190, textAlign: "center", fontSize: 64, lineHeight: 72, fontWeight: "900", fontVariant: ["tabular-nums"], letterSpacing: -3.5 },
  restAdjustments: { marginTop: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 64 },
  restAdjustButton: { minWidth: 88, height: 56, paddingHorizontal: 16, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  restAdjustText: { fontSize: 26, fontWeight: "900", fontVariant: ["tabular-nums"] },
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
  infoSheet: { height: "88%", paddingHorizontal: 24, paddingTop: 10, paddingBottom: 28, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  infoHeading: { flex: 1, flexShrink: 1, paddingRight: 16 },
  infoTitle: { marginTop: 3, fontSize: 24, fontWeight: "900", letterSpacing: -0.9 },
  infoMeta: { marginTop: 8, fontSize: 10, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
  infoContent: { paddingBottom: 24 },
  infoGallery: { gap: 10, paddingBottom: 18 },
  infoImage: { width: 260, height: 195, borderRadius: 16 },
  infoStep: { flexDirection: "row", gap: 12, marginBottom: 16 },
  infoStepNumber: { width: 24, height: 24, borderRadius: 12, textAlign: "center", textAlignVertical: "center", lineHeight: 24, fontSize: 12, fontWeight: "900" },
  infoStepText: { flex: 1, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  pickerEyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  pickerTitle: { marginTop: 3, fontSize: 24, fontWeight: "900", letterSpacing: -0.9 },
  supersetSearch: { height: 48, paddingHorizontal: 15, borderRadius: 15, fontSize: 15, fontWeight: "700" },
  pickerList: { paddingTop: 10, paddingBottom: 20 },
  pickerRow: { minHeight: 62, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  pickerCopy: { flex: 1, minWidth: 0 },
  pickerName: { fontSize: 16, fontWeight: "900", letterSpacing: -0.35 },
  pickerMeta: { marginTop: 3, fontSize: 10, fontWeight: "800", letterSpacing: 0.55 },
  emptyPicker: { paddingVertical: 28, textAlign: "center", fontSize: 13, fontWeight: "700" },
  scatterChart: {
    height: 224,
    position: "relative",
    overflow: "visible",
  },
  volumeChart: { ...StyleSheet.absoluteFill, opacity: 0.9 },
  directionText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.8, color: "#A3A79F" },
  repsAxis: { position: "absolute", left: 0, top: 6, bottom: 15, alignItems: "center", justifyContent: "space-between" },
  weightAxis: { position: "absolute", left: "8%", right: "8%", bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scatterDot: { position: "absolute", width: 16, height: 16, marginLeft: -8, marginBottom: -8, borderRadius: 8 },
  activeDot: { width: 22, height: 22, marginLeft: -11, marginBottom: -11, borderRadius: 11, zIndex: 2, opacity: 1, transform: [{ scale: 1.08 }] },
  selectedSet: { marginTop: 4, paddingTop: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectedMeta: { fontSize: 9, fontWeight: "900", letterSpacing: 1.1, color: "#858A80" },
  selectedValue: { marginTop: 3, fontSize: 20, lineHeight: 23, fontWeight: "900", letterSpacing: -0.5, color: "#171813" },
  selectedNote: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: "#FFCC4A", fontSize: 9, lineHeight: 11, textAlign: "center", fontWeight: "900", letterSpacing: 0.7, color: "#171813" },
  pastSets: { flex: 1, minHeight: 0, marginTop: 26 },
  pastSetsTitle: { marginBottom: 8, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, color: "#858A80" },
  pastSetsScroll: { flex: 1 },
  pastSetRow: { minHeight: 52, marginBottom: 8, paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#F5F6F2", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pastSetRowActive: { backgroundColor: "#FFF1C8" },
  pastSetRowPressed: { opacity: 0.68 },
  deleteAction: { width: 62, minHeight: 52, marginBottom: 8, marginLeft: 8, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#D84C41" },
  deleteActionPressed: { opacity: 0.72 },
  pastSetDate: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8, color: "#7F847B" },
  pastSetValue: { fontSize: 15, fontWeight: "900", letterSpacing: -0.2, color: "#1B1C17" },
  emptyHistory: { fontSize: 14, color: "#767A71" },
});
