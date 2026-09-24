import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/components/appearance-provider';
import type { Onboarding } from '@/lib/onboarding';

const dismissedKey = (userId: string) => `lift-first-workout-dismissed:${userId}`;
export async function hasDismissedFirstWorkoutPreview(userId: string) {
  const key = dismissedKey(userId);
  return Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) === 'true' : await SecureStore.getItemAsync(key) === 'true';
}
export async function dismissFirstWorkoutPreview(userId: string) {
  const key = dismissedKey(userId);
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, 'true');
  else await SecureStore.setItemAsync(key, 'true');
}

export function FirstWorkoutPreview({ onboarding, splitName, onStart, onSkip }: {
  onboarding: Onboarding;
  splitName: string;
  onStart: () => Promise<void>;
  onSkip: () => Promise<void>;
}) {
  const { colors } = useAppearance();
  const [busy, setBusy] = useState(false);
  const goal = onboarding.goals[0];
  const experience = onboarding.experience === 'new' ? 'Beginner friendly' : onboarding.experience === 'some' ? 'For returning lifters' : 'Built for experienced lifters';
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch { setBusy(false); }
  };

  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
    <View style={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.mutedText }]}>YOUR PLAN IS READY</Text>
      <Text style={[styles.title, { color: colors.text }]}>Start with a workout made for you.</Text>
      <Text style={[styles.subtitle, { color: colors.mutedText }]}>Your first session is a simple way to put your {goal ? goal.toLowerCase() : 'training'} goal into motion.</Text>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceStrong }]}>
        <Text style={[styles.cardLabel, { color: colors.mutedText }]}>FIRST WORKOUT</Text>
        <Text style={[styles.workout, { color: colors.text }]}>{splitName}</Text>
        <View style={styles.details}>
          <Text style={[styles.detail, { color: colors.mutedText }]}>{experience}</Text>
          <Text style={[styles.dot, { color: colors.subtleText }]}>·</Text>
          <Text style={[styles.detail, { color: colors.mutedText }]}>{onboarding.trainingDays} days a week</Text>
        </View>
        {goal && <Text style={[styles.goal, { color: colors.mutedText }]}>Focused on {goal.toLowerCase()}</Text>}
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(onStart); }} style={({ pressed }) => [styles.start, { backgroundColor: colors.accent }, (pressed || busy) && styles.pressed]}>
          <Text style={[styles.startText, { color: colors.accentText }]}>{busy ? 'Starting…' : 'Start workout'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(onSkip); }} style={({ pressed }) => [styles.skip, (pressed || busy) && styles.pressed]}>
          <Text style={[styles.skipText, { color: colors.mutedText }]}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { maxWidth: 350, marginTop: 15, fontSize: 38, lineHeight: 41, fontWeight: '900', letterSpacing: -1.7 },
  subtitle: { maxWidth: 340, marginTop: 12, fontSize: 16, lineHeight: 23 },
  card: { marginTop: 30, padding: 22, borderWidth: 1, borderRadius: 22 },
  cardLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  workout: { marginTop: 8, fontSize: 27, fontWeight: '900', letterSpacing: -.8 },
  details: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  detail: { fontSize: 13, fontWeight: '700' },
  dot: { fontSize: 16 },
  goal: { marginTop: 13, fontSize: 13, fontWeight: '700' },
  actions: { marginTop: 25, gap: 4 },
  start: { minHeight: 60, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  startText: { fontSize: 16, fontWeight: '900' },
  skip: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: .72, transform: [{ scale: .985 }] },
});
