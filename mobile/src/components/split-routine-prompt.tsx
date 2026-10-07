import { searchExercises } from '@/lib/exercise-search';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ui } from '@/styles/primitives';
import { FlatList, Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, Search, X } from 'react-native-feather';
import { getActiveWorkout, getCustomSplits, getExercises, getWorkoutVisits } from '@/db';
import { useAppearance } from '@/components/appearance-provider';
import { EmptyArt } from '@/components/empty-art';
import { useSheetPresence } from '@/hooks/use-sheet-presence';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { defaultWorkoutSplits, type WorkoutSplitDefinition } from '@/lib/exercise-recommendations';
import { getProfile, updateProfile } from '@/lib/profile';
import { routinePromptIsSnoozed, splitsWithoutBaseline } from '@/lib/split-routines';

const exercises = getExercises();
const nowStamp = () => String(Date.now());
const rowStep = 64; // 58pt row + 6pt gap; sortable rows are fixed-height so slots stay exact.

// Rows are absolutely positioned from a shared order, so committing the new order after a drop never moves anything on screen.
function SortableList({ ids, disabled, color, onReorder, renderRow }: { ids: string[]; disabled: boolean; color: string; onReorder: (ids: string[]) => void; renderRow: (id: string, index: number) => React.ReactNode }) {
  const order = useSharedValue(ids);
  const active = useSharedValue('');
  const lifted = useSharedValue('');
  const y = useSharedValue(0);
  useEffect(() => { if (!active.get()) order.set(ids); }, [ids, active, order]);
  return <View style={{ height: ids.length * rowStep }}>
    {ids.map((id, index) => <SortableRow key={id} id={id} index={index} order={order} active={active} lifted={lifted} y={y} disabled={disabled} color={color} onReorder={onReorder} ids={ids}>{renderRow(id, index)}</SortableRow>)}
  </View>;
}

function SortableRow({ id, index, ids, order, active, lifted, y, disabled, color, onReorder, children }: { id: string; index: number; ids: string[]; order: SharedValue<string[]>; active: SharedValue<string>; lifted: SharedValue<string>; y: SharedValue<number>; disabled: boolean; color: string; onReorder: (ids: string[]) => void; children: React.ReactNode }) {
  const start = useSharedValue(0);
  const animated = useAnimatedStyle(() => {
    const slot = order.get().indexOf(id);
    const top = (slot < 0 ? index : slot) * rowStep;
    if (active.get() === id) return { zIndex: 1, transform: [{ translateY: start.get() + y.get() }, { scale: withTiming(1.02, { duration: 120 }) }] };
    return { zIndex: lifted.get() === id ? 1 : 0, transform: [{ translateY: withTiming(top, { duration: 180 }) }, { scale: withTiming(1, { duration: 120 }) }] };
  });
  const pan = Gesture.Pan().enabled(!disabled)
    .onStart(() => { start.set(order.get().indexOf(id) * rowStep); y.set(0); active.set(id); lifted.set(id); })
    .onUpdate((event) => {
      y.set(event.translationY);
      const current = order.get();
      const to = Math.min(current.length - 1, Math.max(0, Math.round((start.get() + event.translationY) / rowStep)));
      if (to === current.indexOf(id)) return;
      const next = current.filter((value) => value !== id);
      next.splice(to, 0, id);
      order.set(next);
    })
    .onFinalize(() => {
      if (active.get() !== id) return;
      active.set('');
      if (order.get().join() !== ids.join()) scheduleOnRN(onReorder, order.get());
    });
  const moveTo = (to: number) => { if (disabled || to < 0 || to >= ids.length) return; const next = ids.filter((value) => value !== id); next.splice(to, 0, id); onReorder(next); };
  return <Animated.View style={[styles.sortableRow, animated]}>
    {children}
    <GestureDetector gesture={pan}>
      <View style={[styles.dragHandle, disabled && styles.disabled]} accessible accessibilityRole="adjustable" accessibilityLabel="Reorder" accessibilityActions={[{ name: 'increment', label: 'Move up' }, { name: 'decrement', label: 'Move down' }]} onAccessibilityAction={(event) => moveTo(index + (event.nativeEvent.actionName === 'increment' ? -1 : 1))}>
        <Menu width={18} height={18} color={color} />
      </View>
    </GestureDetector>
  </Animated.View>;
}

export function SplitRoutinePrompt({ userId = '', editingSplit, onClose }: { userId?: string; editingSplit?: WorkoutSplitDefinition; onClose?: () => void }) {
  const { colors, useCustomSplits, showWorkoutRecommendations } = useAppearance();
  const insets = useSafeAreaInsets();
  const [splits, setSplits] = useState<WorkoutSplitDefinition[]>([]);
  const [step, setStep] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  // Picks survive moving between steps; an empty edit clears the routine.
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const shown = useRef(false);
  const focused = useRef(false);
  const savingRef = useRef(false);
  const storageKey = `lift-routine-dismissed.${userId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  useFocusEffect(useCallback(() => {
    focused.current = true;
    let active = true;
    if (editingSplit) {
      setSplits([editingSplit]); setStep(0); setLoading(true); setLoadFailed(false); setError('');
      void getProfile().then((profile) => {
        if (active) setPicks({ [editingSplit.id]: [...profile.recommendationPreferences?.routineExerciseIdsBySplit?.[editingSplit.id] ?? []] });
      }).catch(() => { if (active) { setLoadFailed(true); setError('Could not load your routine. Close and try again.'); } })
        .finally(() => { if (active) setLoading(false); });
    } else if (!shown.current && showWorkoutRecommendations && !getActiveWorkout()) {
      void (async () => {
        const dismissed = Platform.OS === 'web' ? globalThis.localStorage?.getItem(storageKey) ?? null : await SecureStore.getItemAsync(storageKey);
        if (routinePromptIsSnoozed(dismissed)) return;
        const profile = await getProfile();
        const customSplits = useCustomSplits ? getCustomSplits() : [];
        const candidates = splitsWithoutBaseline(customSplits.length ? customSplits : defaultWorkoutSplits, getWorkoutVisits(), profile.recommendationPreferences?.routineExerciseIdsBySplit ?? {});
        if (!active || shown.current || getActiveWorkout() || !candidates.length) return;
        shown.current = true;
        setSplits(candidates); setStep(0);
      })().catch(() => { /* An optional prompt never blocks Home offline. */ });
    }
    return () => { active = false; focused.current = false; setStep(null); };
  }, [editingSplit, showWorkoutRecommendations, storageKey, useCustomSplits]));

  function close() {
    if (savingRef.current) return;
    setStep(null);
    if (editingSplit) { onClose?.(); return; }
    try {
      const stamp = nowStamp();
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(storageKey, stamp);
      else void SecureStore.setItemAsync(storageKey, stamp).catch(() => undefined);
    } catch { /* Dismissal still works without persistent storage. */ }
  }

  async function finish() {
    const routines = Object.fromEntries(Object.entries(picks).filter(([, ids]) => editingSplit || ids.length));
    if (!Object.keys(routines).length) return close();
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const latest = await getProfile();
      const savedRoutines = { ...latest.recommendationPreferences?.routineExerciseIdsBySplit, ...routines };
      // The profile stores only nonempty routines; removing the entry clears it.
      for (const [id, ids] of Object.entries(savedRoutines)) if (!ids.length) delete savedRoutines[id];
      await updateProfile({ recommendationPreferences: { routineExerciseIdsBySplit: savedRoutines } });
      savingRef.current = false; close();
    } catch {
      if (focused.current) setError('Could not save your routines. Please try again.');
    } finally { savingRef.current = false; setSaving(false); }
  }

  function goTo(next: number) {
    setQuery(''); setError('');
    if (next < splits.length) setStep(next);
    else void finish();
  }

  const open = step !== null && !!splits[step];
  const visible = useSheetPresence(open);
  if (!visible) return null;
  // Same Modal/overlay tree minus the sheet, so its `exiting` animations play.
  if (step === null || !splits[step]) return <Modal visible transparent animationType="none"><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay} /></Modal>;
  const split = splits[step];
  const selected = picks[split.id] ?? [];
  const isLast = step === splits.length - 1;
  const toggle = (id: string) => setPicks((current) => {
    const ids = current[split.id] ?? [];
    return { ...current, [split.id]: ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id] };
  });
  // Ids missing from the catalog keep their place at the end.
  const reorder = (ids: string[]) => setPicks((current) => ({ ...current, [split.id]: [...ids, ...(current[split.id] ?? []).filter((id) => !ids.includes(id))] }));
  const searching = Boolean(query.trim());
  // Search the full catalog so a user's real routine can include any movement.
  const choices = searchExercises(exercises.filter((exercise) => {
    if (selected.includes(exercise.id)) return true;
    if (searching) return true;
    try {
      return (JSON.parse(exercise.detailsJson ?? '{}').primaryMuscles ?? []).some((muscle: string) => split.muscles.includes(muscle));
    } catch { return false; }
  }), query, (a, b) => {
    return (selected.includes(a.id) ? selected.indexOf(a.id) : Infinity) - (selected.includes(b.id) ? selected.indexOf(b.id) : Infinity) || b.isFeatured - a.isFeatured || a.name.localeCompare(b.name);
  });
  // Selected rows sit above the list so they can be dragged; search results are ranked by match instead.
  const pinned = searching ? [] : choices.filter((exercise) => selected.includes(exercise.id));
  const renderChoice = (item: typeof exercises[number], sortable = false) => {
    const checked = selected.includes(item.id);
    const disabled = loading || saving || loadFailed || (!checked && selected.length >= 20);
    const order = selected.indexOf(item.id);
    const rowStyle = [styles.choiceRow, { backgroundColor: checked ? colors.surface : 'transparent' }];
    const choice = <Pressable disabled={disabled} onPress={() => toggle(item.id)} style={[styles.choice, disabled && styles.disabled]} accessibilityRole="checkbox" accessibilityLabel={item.name} accessibilityState={{ checked, disabled }}>
      <View style={[styles.check, { borderColor: checked ? colors.accent : colors.surfaceStrong, backgroundColor: checked ? colors.accent : 'transparent' }]}>{checked && <Text style={[styles.checkText, { color: colors.accentText }]}>{order + 1}</Text>}</View>
      <ExerciseThumb exercise={item} size={40} />
      <View style={styles.choiceCopy}><Text numberOfLines={sortable ? 1 : undefined} style={[styles.exerciseName, { color: colors.text }]}>{item.name}</Text><Text style={[styles.exerciseDetail, { color: colors.mutedText }]}>{item.area} · {item.equipment}</Text></View>
    </Pressable>;
    return <View style={[rowStyle, sortable && styles.sortableContent]}>{choice}</View>;
  };
  const anyPicked = Object.values(picks).some((ids) => ids.length) || selected.length > 0;
  const primaryLabel = saving ? 'Saving…' : editingSplit ? 'Save routine' : !isLast ? `Next: ${splits[step + 1].name}` : anyPicked ? 'Save my routine' : 'Done';

  return <Modal visible transparent animationType="none" onRequestClose={close}><GestureHandlerRootView style={styles.root}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(200)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Dismiss routine prompt" />
      </Animated.View>
      <Animated.View entering={SlideInDown.duration(280)} exiting={SlideOutDown.duration(200)} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(20, insets.bottom + 8) }]}>
        <View style={[styles.handle, { backgroundColor: colors.surfaceStrong }]} />
        <View style={styles.heading}>
          <View style={styles.headingCopy}>
            {splits.length > 1 && <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of ${splits.length}`}>
              {splits.map((item, index) => <Pressable key={item.id} disabled={saving} onPress={() => goTo(index)} hitSlop={6} style={[styles.dot, { backgroundColor: index === step ? colors.accent : picks[item.id]?.length ? colors.text : colors.surfaceStrong }, index === step && styles.dotActive]} accessibilityRole="button" accessibilityLabel={`Go to ${item.name}`} />)}
              <Text style={[ui.eyebrow, styles.eyebrow, { color: colors.mutedText }]}>{split.name} · {step + 1} of {splits.length}</Text>
            </View>}
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{editingSplit ? `${split.name} usual exercises` : `What’s your normal ${split.name.toLowerCase()} day look like?`}</Text>
          </View>
          <Pressable onPress={close} disabled={saving} hitSlop={10} style={[styles.close, { backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Close routine prompt"><X width={18} height={18} color={colors.text} strokeWidth={2.5} /></Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedText }]}>Pick your usual exercises, then drag to set their order. Your plan follows this order when these exercises fit your split and recovery.</Text>
        <View style={[styles.search, { backgroundColor: colors.surface }]}><Search width={18} height={18} color={colors.mutedText} /><TextInput value={query} onChangeText={setQuery} placeholder="Search all exercises" placeholderTextColor={colors.subtleText} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.text }]} accessibilityLabel="Search routine exercises" />{query ? <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search"><X width={16} height={16} color={colors.mutedText} /></Pressable> : null}</View>
        <FlatList data={pinned.length ? choices.filter((exercise) => !selected.includes(exercise.id)) : choices} keyExtractor={(exercise) => exercise.id} style={styles.choices} keyboardShouldPersistTaps="handled" ListHeaderComponent={pinned.length ? <SortableList ids={pinned.map((item) => item.id)} disabled={loading || saving || loadFailed} color={colors.mutedText} onReorder={reorder} renderRow={(id) => renderChoice(pinned.find((item) => item.id === id)!, true)} /> : null} renderItem={({ item }) => renderChoice(item)} ListEmptyComponent={pinned.length ? null : <View style={{ paddingTop: 16 }}><EmptyArt name="search" width={132} /><Text style={[styles.empty, { paddingTop: 0, color: colors.mutedText }]}>No exercises found. Try another search.</Text></View>} />
        {loading && <Text style={[styles.subtitle, { color: colors.mutedText }]}>Loading routine…</Text>}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.footer}>
          <Pressable disabled={saving} onPress={() => { if (editingSplit) return close(); setPicks((current) => ({ ...current, [split.id]: [] })); goTo(step + 1); }} style={styles.skip} accessibilityRole="button"><Text style={[styles.skipText, { color: colors.mutedText }]}>{editingSplit ? 'Cancel' : splits.length > 1 ? `Skip ${split.name}` : 'Not now'}</Text></Pressable>
          <Pressable disabled={loading || saving || loadFailed || (!editingSplit && !selected.length)} onPress={() => goTo(step + 1)} style={[styles.save, { backgroundColor: colors.accent }, (loading || saving || loadFailed || (!editingSplit && !selected.length)) && styles.disabled]} accessibilityRole="button">
            <Text style={[styles.saveText, { color: colors.accentText }]}>{primaryLabel}</Text>
            {selected.length > 0 && !saving && <Text style={[styles.saveCount, { color: colors.accentText }]}>{selected.length}/20</Text>}
          </Pressable>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  </GestureHandlerRootView></Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.38)' },
  sheet: { width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '92%', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: 20 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, headingCopy: { flex: 1 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 }, dotActive: { width: 22 },
  eyebrow: { marginLeft: 6 },
  title: { fontSize: 25, lineHeight: 30, fontWeight: '900', letterSpacing: -.6 },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  subtitle: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  search: { minHeight: 46, marginTop: 16, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }, input: { flex: 1, height: 46, fontSize: 14 },
  choices: { marginTop: 10, flexGrow: 0, flexShrink: 1, minHeight: 200 },
  choiceRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, marginBottom: 6 },
  root: { flex: 1 },
  sortableRow: { position: 'absolute', left: 0, right: 0, top: 0, height: 58, flexDirection: 'row', alignItems: 'center' },
  sortableContent: { flex: 1, height: 58, marginBottom: 0, paddingRight: 44 },
  dragHandle: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  choice: { flex: 1, minHeight: 58, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 26, height: 26, borderWidth: 1.5, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, checkText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  choiceCopy: { flex: 1 }, exerciseName: { fontSize: 14, fontWeight: '800' }, exerciseDetail: { marginTop: 3, fontSize: 11, textTransform: 'capitalize' },
  disabled: { opacity: .45 }, empty: { paddingVertical: 24, fontSize: 14, textAlign: 'center' }, error: { marginTop: 10, fontSize: 12, color: '#C43F36' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  skip: { minHeight: 52, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, skipText: { fontSize: 14, fontWeight: '700' },
  save: { flex: 1, minHeight: 52, borderRadius: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { fontSize: 15, fontWeight: '900' }, saveCount: { fontSize: 12, fontWeight: '800', opacity: .7 },
});
