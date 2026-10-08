import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'react-native-feather';

import { useAppearance } from '@/components/appearance-provider';
import { coverageStatusColor, coverageStatusLabel, formatSets, type MuscleCoverage, type MuscleTarget } from '@/lib/training-overview';

export const muscleLabel = (name: string) => ({ abdominals: 'Abs', quadriceps: 'Quads', 'middle back': 'Mid back' })[name as 'abdominals' | 'quadriceps' | 'middle back'] ?? name.replace(/\b\w/g, (letter) => letter.toUpperCase());

/** One muscle: sets per week, and where that sits against its goal range. */
export function MuscleTrendRow({ coverage, onPress, last = false }: { coverage: MuscleCoverage; onPress: () => void; last?: boolean }) {
  const { colors } = useAppearance();
  const { muscle, status, target, setsPerWeek } = coverage;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${muscleLabel(muscle)}, ${coverageStatusLabel[status]}, ${formatSets(setsPerWeek)} sets per week${target ? `, goal ${target.min} to ${target.max}` : ''}. View sets over time`}>
    <View style={styles.copy}>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{muscleLabel(muscle)}</Text>
      <Text style={[styles.goal, { color: colors.mutedText }]}>{target ? `Goal ${target.min}–${target.max} sets` : coverageStatusLabel[status]}</Text>
    </View>
    {target && <RangeGauge value={setsPerWeek} target={target} color={coverageStatusColor[status] ?? colors.subtleText} />}
    <Text style={[styles.value, { color: colors.text }]}>{formatSets(setsPerWeek)}<Text style={[styles.unit, { color: colors.mutedText }]}>/wk</Text></Text>
    <ChevronRight width={16} height={16} color={colors.subtleText} strokeWidth={2.4} />
  </Pressable>;
}

/** Shaded goal band on a track scaled to 1.5× the goal maximum; the dot pins to the end when beyond it. */
function RangeGauge({ value, target, color }: { value: number; target: MuscleTarget; color: string }) {
  const { colors } = useAppearance();
  const scale = target.max * 1.5;
  const at = (sets: number) => `${Math.min(100, sets / scale * 100)}%` as const;
  return <View style={[styles.track, { backgroundColor: colors.surfaceStrong }]}>
    <View style={[styles.band, { left: at(target.min), width: `${(target.max - target.min) / scale * 100}%`, backgroundColor: coverageStatusColor.onTrack!, opacity: .35 }]} />
    <View style={[styles.marker, { left: at(value), backgroundColor: color, borderColor: colors.background }]} />
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', letterSpacing: -.3 },
  goal: { marginTop: 3, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  track: { width: 64, height: 6, borderRadius: 3 },
  band: { position: 'absolute', top: 0, bottom: 0 },
  marker: { position: 'absolute', top: -4, width: 14, height: 14, marginLeft: -7, borderRadius: 7, borderWidth: 2 },
  value: { width: 58, textAlign: 'right', fontSize: 16, fontWeight: '900', letterSpacing: -.4, fontVariant: ['tabular-nums'] },
  unit: { fontSize: 10, fontWeight: '800', letterSpacing: 0 },
  pressed: { opacity: .6 },
});
