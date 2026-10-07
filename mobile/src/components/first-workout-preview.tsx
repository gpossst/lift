import * as SecureStore from 'expo-secure-store';
import LottieView from 'lottie-react-native';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useAppearance } from '@/components/appearance-provider';
import { tintFlexFills } from '@/components/flex-animation';
import type { Onboarding } from '@/lib/onboarding';

const goalFocus: Record<string, string> = { 'Build muscle': 'building muscle', 'Get stronger': 'getting stronger', 'Lose fat': 'losing fat', 'Feel healthier': 'feeling healthier' };
const joinList = (items: string[]) => items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;

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
  const barbell = useMemo(() => tintFlexFills(require('../../assets/barbell-load.json'), colors.accent), [colors.accent]);
  const reducedMotion = useReducedMotion();
  const goals = onboarding.goals ?? []; // parsed from storage unchecked
  const experience = onboarding.experience === 'new' ? 'Beginner friendly' : onboarding.experience === 'some' ? 'For returning lifters' : 'Built for experienced lifters';
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch { setBusy(false); }
  };

  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
    <View style={styles.content}>
      {/* Plays once; reduced motion shows the loaded bar. */}
      <LottieView autoPlay={!reducedMotion} loop={false} progress={reducedMotion ? 1 : undefined} resizeMode="contain" source={barbell} style={styles.animation} webStyle={styles.animation} />
      <Text style={[styles.title, { color: colors.text }]}>Want to start a workout now?</Text>
      <Text style={[styles.subtitle, { color: colors.mutedText }]}>We’ve lined up a first session for {goals.length ? `your ${goals.length > 1 ? 'goals' : 'goal'} to ${joinList(goals.map(g => g.toLowerCase()))}` : 'your training'}. You can always start it later.</Text>

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.workout, { color: colors.text }]}>{splitName}</Text>
        <View style={styles.details}>
          <Text style={[styles.detail, { color: colors.mutedText }]}>{experience}</Text>
          <Text style={[styles.dot, { color: colors.subtleText }]}>·</Text>
          <Text style={[styles.detail, { color: colors.mutedText }]}>{onboarding.trainingDays} days a week</Text>
        </View>
        {goals.length > 0 && <Text style={[styles.goal, { color: colors.mutedText }]}>Focused on {joinList(goals.map(g => goalFocus[g] ?? g.toLowerCase()))}</Text>}
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(onStart); }} style={({ pressed }) => [styles.start, { backgroundColor: colors.accent }, (pressed || busy) && styles.pressed]}>
          <Text style={[styles.startText, { color: colors.accentText }]}>{busy ? 'Starting…' : 'Start now'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void run(onSkip); }} style={({ pressed }) => [styles.skip, (pressed || busy) && styles.pressed]}>
          <Text style={[styles.skipText, { color: colors.mutedText }]}>Not right now</Text>
        </Pressable>
      </View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  animation: { width: 240, height: 130, alignSelf: 'center', marginBottom: 18 },
  title: { maxWidth: 350, fontSize: 38, lineHeight: 41, fontWeight: '900', letterSpacing: -1.7 },
  subtitle: { maxWidth: 340, marginTop: 12, fontSize: 16, lineHeight: 23 },
  card: { marginTop: 30, padding: 22, borderRadius: 22 },
  workout: { fontSize: 27, fontWeight: '900', letterSpacing: -.8 },
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
