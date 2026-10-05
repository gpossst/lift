import { searchExercises } from '@/lib/exercise-search';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ui } from '@/styles/primitives';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X } from 'react-native-feather';
import { getActiveWorkout, getCustomSplits, getExercises, getWorkoutVisits } from '@/db';
import { useAppearance } from '@/components/appearance-provider';
import { useSheetPresence } from '@/hooks/use-sheet-presence';
import { ExerciseThumb } from '@/components/exercise-thumb';
import { defaultWorkoutSplits, type WorkoutSplitDefinition } from '@/lib/exercise-recommendations';
import { getProfile, updateProfile } from '@/lib/profile';
import { routinePromptIsSnoozed, splitsWithoutBaseline } from '@/lib/split-routines';

const exercises = getExercises();
const nowStamp = () => String(Date.now());

export function SplitRoutinePrompt({ userId }: { userId: string }) {
  const { colors, useCustomSplits, showWorkoutRecommendations } = useAppearance();
  const insets = useSafeAreaInsets();
  const [splits, setSplits] = useState<WorkoutSplitDefinition[]>([]);
  const [step, setStep] = useState<number | null>(null);
  // Picks per split survive moving between steps; empty = skipped.
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
    if (!shown.current && showWorkoutRecommendations && !getActiveWorkout()) {
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
  }, [showWorkoutRecommendations, storageKey, useCustomSplits]));

  function close() {
    if (savingRef.current) return;
    setStep(null);
    try {
      const stamp = nowStamp();
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(storageKey, stamp);
      else void SecureStore.setItemAsync(storageKey, stamp).catch(() => undefined);
    } catch { /* Dismissal still works without persistent storage. */ }
  }

  async function finish() {
    const routines = Object.fromEntries(Object.entries(picks).filter(([, ids]) => ids.length));
    if (!Object.keys(routines).length) return close();
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError('');
    try {
      const latest = await getProfile();
      await updateProfile({ recommendationPreferences: { routineExerciseIdsBySplit: {
        ...latest.recommendationPreferences?.routineExerciseIdsBySplit, ...routines,
      } } });
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
  const searching = Boolean(query.trim());
  // Search the full catalog so a user's real routine can include any movement.
  const choices = searchExercises(exercises.filter((exercise) => {
    if (selected.includes(exercise.id)) return true;
    if (searching) return true;
    try {
      return (JSON.parse(exercise.detailsJson ?? '{}').primaryMuscles ?? []).some((muscle: string) => split.muscles.includes(muscle));
    } catch { return false; }
  }), query, (a, b) => {
    const order = (id: string) => { const index = selected.indexOf(id); return index < 0 ? Infinity : index; };
    return order(a.id) - order(b.id) || b.isFeatured - a.isFeatured || a.name.localeCompare(b.name);
  });
  const anyPicked = Object.values(picks).some((ids) => ids.length) || selected.length > 0;
  const primaryLabel = saving ? 'Saving…' : !isLast ? `Next: ${splits[step + 1].name}` : anyPicked ? 'Save my routine' : 'Done';

  return <Modal visible transparent animationType="none" onRequestClose={close}>
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
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>What’s your normal {split.name.toLowerCase()} day look like?</Text>
          </View>
          <Pressable onPress={close} disabled={saving} hitSlop={10} style={[styles.close, { backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Close routine prompt"><X width={18} height={18} color={colors.text} strokeWidth={2.5} /></Pressable>
        </View>
        <Text style={[styles.subtitle, { color: colors.mutedText }]}>Tap exercises in the order you usually do them. We’ll start there and learn as you log.</Text>
        <View style={[styles.search, { backgroundColor: colors.surface }]}><Search width={18} height={18} color={colors.mutedText} /><TextInput value={query} onChangeText={setQuery} placeholder="Search all exercises" placeholderTextColor={colors.subtleText} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: colors.text }]} accessibilityLabel="Search routine exercises" />{query ? <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search"><X width={16} height={16} color={colors.mutedText} /></Pressable> : null}</View>
        <FlatList data={choices} keyExtractor={(exercise) => exercise.id} style={styles.choices} keyboardShouldPersistTaps="handled" renderItem={({ item }) => {
          const position = selected.indexOf(item.id);
          const checked = position >= 0;
          const disabled = saving || (!checked && selected.length >= 20);
          return <Pressable disabled={disabled} onPress={() => toggle(item.id)} style={[styles.choice, { backgroundColor: checked ? colors.surface : 'transparent' }, disabled && styles.disabled]} accessibilityRole="checkbox" accessibilityLabel={checked ? `${item.name}, number ${position + 1}` : item.name} accessibilityState={{ checked, disabled }}>
            <View style={[styles.check, { borderColor: checked ? colors.accent : colors.surfaceStrong, backgroundColor: checked ? colors.accent : 'transparent' }]}>{checked && <Text style={[styles.checkText, { color: colors.accentText }]}>{position + 1}</Text>}</View>
            <ExerciseThumb exercise={item} size={40} />
            <View style={styles.choiceCopy}><Text style={[styles.exerciseName, { color: colors.text }]}>{item.name}</Text><Text style={[styles.exerciseDetail, { color: colors.mutedText }]}>{item.area} · {item.equipment}</Text></View>
          </Pressable>;
        }} ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedText }]}>No exercises found. Try another search.</Text>} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <View style={styles.footer}>
          <Pressable disabled={saving} onPress={() => { setPicks((current) => ({ ...current, [split.id]: [] })); goTo(step + 1); }} style={styles.skip} accessibilityRole="button"><Text style={[styles.skipText, { color: colors.mutedText }]}>{splits.length > 1 ? `Skip ${split.name}` : 'Not now'}</Text></Pressable>
          <Pressable disabled={saving || !selected.length} onPress={() => goTo(step + 1)} style={[styles.save, { backgroundColor: colors.accent }, (saving || !selected.length) && styles.disabled]} accessibilityRole="button">
            <Text style={[styles.saveText, { color: colors.accentText }]}>{primaryLabel}</Text>
            {selected.length > 0 && !saving && <Text style={[styles.saveCount, { color: colors.accentText }]}>{selected.length}/20</Text>}
          </Pressable>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  </Modal>;
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
  choice: { minHeight: 58, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 26, height: 26, borderWidth: 1.5, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, checkText: { fontSize: 12, fontWeight: '900' },
  choiceCopy: { flex: 1 }, exerciseName: { fontSize: 14, fontWeight: '800' }, exerciseDetail: { marginTop: 3, fontSize: 11, textTransform: 'capitalize' },
  disabled: { opacity: .45 }, empty: { paddingVertical: 24, fontSize: 14, textAlign: 'center' }, error: { marginTop: 10, fontSize: 12, color: '#C43F36' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  skip: { minHeight: 52, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, skipText: { fontSize: 14, fontWeight: '700' },
  save: { flex: 1, minHeight: 52, borderRadius: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { fontSize: 15, fontWeight: '900' }, saveCount: { fontSize: 12, fontWeight: '800', opacity: .7 },
});
