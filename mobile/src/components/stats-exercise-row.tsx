import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'react-native-feather';
import { router } from 'expo-router';

import { useAppearance } from '@/components/appearance-provider';
import { getExercises, getExerciseSessionCounts } from '@/db';

export type StatsExercise = { id: string; name: string; sessions: number };

/** The whole catalog with how many workouts each exercise appeared in, most-trained first. */
export function loadStatsExercises(): StatsExercise[] {
  const sessions = getExerciseSessionCounts();
  return getExercises().map((exercise) => ({ id: exercise.id, name: exercise.name, sessions: sessions.get(exercise.id) ?? 0 }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

export const StatsExerciseRow = memo(function StatsExerciseRow({ item, last }: { item: StatsExercise; last: boolean }) {
  const { colors } = useAppearance();
  return <Pressable onPress={() => router.push({ pathname: '/stats/progress', params: { exerciseId: item.id } })} style={({ pressed }) => [pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`View progress for ${item.name}`}>
    <View style={[styles.lookupInner, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.surfaceStrong }]}>
      <View style={styles.lookupCopy}><Text style={[styles.lookupName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text><Text style={[styles.lookupMeta, { color: colors.mutedText }]}>{item.sessions ? `${item.sessions} ${item.sessions === 1 ? 'session' : 'sessions'}` : 'No workouts yet'}</Text></View>
      <ChevronRight width={17} height={17} color={colors.subtleText} strokeWidth={2.4} />
    </View>
  </Pressable>;
});

const styles = StyleSheet.create({
  lookupInner: { minHeight: 62, flexDirection: 'row', alignItems: 'center' },
  lookupCopy: { flex: 1, paddingRight: 12 }, lookupName: { fontSize: 15, fontWeight: '800', letterSpacing: -.3 }, lookupMeta: { marginTop: 3, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: .62 },
});
