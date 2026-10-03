import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ArrowLeft } from 'react-native-feather';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/components/appearance-provider';
import { getExercises, getRejectedCloudSyncChanges, getWorkoutHistory, updateWorkoutSet, type WorkoutHistoryPoint } from '@/db';
import { exerciseRequiresWeight } from '@/db/exercise-catalog';
import { isValidWorkoutSetValues } from '@/lib/workout-set-validation';
import { ui } from '@/styles/primitives';

type EditableSet = { original: WorkoutHistoryPoint; weight: string; reps: string };

export default function HistoryEditScreen() {
  const { colors } = useAppearance();
  const { workoutId, exerciseId } = useLocalSearchParams<{ workoutId?: string; exerciseId?: string }>();
  const exercise = getExercises().find((item) => item.id === exerciseId);
  const requiresWeight = exercise ? exerciseRequiresWeight(exercise) : true;
  const [sets, setSets] = useState<EditableSet[]>(() => exerciseId && workoutId
    ? getWorkoutHistory(exerciseId).filter((set) => set.workoutId === workoutId).map((set) => ({ original: set, weight: String(set.weight), reps: String(set.reps) }))
    : []);
  const syncIssues = getRejectedCloudSyncChanges().filter((item) => item.entity === 'set' && item.key.startsWith(`${workoutId}\u001f${exerciseId}\u001f`));
  const valid = sets.length > 0 && sets.every((set) => {
    const weight = Number(set.weight);
    const reps = Number(set.reps);
    return set.weight.trim() !== '' && set.reps.trim() !== '' && isValidWorkoutSetValues({ weight, reps }) && (!requiresWeight || weight > 0);
  });

  function change(index: number, field: 'weight' | 'reps', value: string) {
    setSets((current) => current.map((set, setIndex) => setIndex === index ? { ...set, [field]: value } : set));
  }

  function save() {
    if (!valid || !exerciseId) return;
    for (const set of sets) {
      const weight = Number(set.weight);
      const reps = Number(set.reps);
      if (weight !== set.original.weight || reps !== set.original.reps || syncIssues.some((item) => item.key.endsWith(`\u001f${set.original.setNumber}`))) updateWorkoutSet(exerciseId, set.original, { weight, reps });
    }
    router.back();
  }

  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back to workout"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable></View>
    <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={[styles.kicker, { color: colors.mutedText }]}>EDIT WORKOUT SETS</Text>
        <Text style={[styles.title, { color: colors.text }]}>{exercise?.name ?? 'Exercise unavailable'}</Text>
        {syncIssues.map((issue) => <Text key={issue.key} style={[styles.error, { color: colors.mutedText }]}>{issue.reason}{issue.record ? ` Attempted set: ${issue.record.weight} lb × ${issue.record.reps} reps.` : ''} Save these sets to resolve the issue.</Text>)}
        {sets.map((set, index) => <View key={set.original.setNumber} style={[styles.row, { borderColor: colors.surfaceStrong }]}>
          <Text style={[styles.setNumber, { color: colors.text }]}>Set {set.original.setNumber}</Text>
          <View style={styles.inputs}>
            <View style={styles.inputGroup}><Text style={[styles.label, { color: colors.mutedText }]}>{requiresWeight ? 'WEIGHT (LB)' : 'ADDED WEIGHT (LB)'}</Text><TextInput value={set.weight} onChangeText={(value) => change(index, 'weight', value)} keyboardType="decimal-pad" selectTextOnFocus accessibilityLabel={`Set ${set.original.setNumber} weight in pounds`} style={[styles.input, { color: colors.text, backgroundColor: colors.surface }]} /></View>
            <View style={styles.inputGroup}><Text style={[styles.label, { color: colors.mutedText }]}>REPS</Text><TextInput value={set.reps} onChangeText={(value) => change(index, 'reps', value)} keyboardType="number-pad" selectTextOnFocus accessibilityLabel={`Set ${set.original.setNumber} reps`} style={[styles.input, { color: colors.text, backgroundColor: colors.surface }]} /></View>
          </View>
        </View>)}
        {!sets.length && <Text style={[styles.empty, { color: colors.mutedText }]}>No sets found for this exercise in this workout.</Text>}
        {sets.length > 0 && !valid && <Text style={[styles.error, { color: colors.mutedText }]}>Use up to 10,000 lb with at most two decimal places and 1–10,000 whole reps for each set.</Text>}
      </ScrollView>
      <View style={styles.footer}><Pressable onPress={save} disabled={!valid} style={({ pressed }) => [styles.saveButton, { backgroundColor: valid ? colors.accent : colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Save edited sets" accessibilityState={{ disabled: !valid }}><Text style={[styles.saveText, { color: valid ? colors.accentText : colors.subtleText }]}>Save sets</Text></Pressable></View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header: { height: 52, paddingHorizontal: 24, justifyContent: 'center' },
  body: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 30 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  title: { marginTop: 6, marginBottom: 22, fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  row: { borderTopWidth: 1, paddingVertical: 16 },
  setNumber: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  inputs: { flexDirection: 'row', gap: 12 },
  inputGroup: { flex: 1 },
  label: { fontSize: 10, fontWeight: '800', marginBottom: 6 },
  input: { height: 48, borderRadius: 10, paddingHorizontal: 14, fontSize: 18, fontWeight: '800' },
  empty: { fontSize: 14, lineHeight: 20 },
  error: { marginTop: 16, fontSize: 12, fontWeight: '700' },
  footer: { paddingHorizontal: 24, paddingVertical: 15 },
  saveButton: { height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 16, fontWeight: '900' },
  pressed: { opacity: .75 },
});
