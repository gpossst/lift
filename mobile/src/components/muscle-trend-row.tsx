import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'react-native-feather';

import { useAppearance } from '@/components/appearance-provider';

export const muscleLabel = (name: string) => ({ abdominals: 'Abs', quadriceps: 'Quads', 'middle back': 'Mid back' })[name as 'abdominals' | 'quadriceps' | 'middle back'] ?? name.replace(/\b\w/g, (letter) => letter.toUpperCase());

/** One muscle: 8 weekly bars (older 4 muted, recent 4 accent, empty weeks a baseline stub), recent % and change vs the prior 4 weeks. */
export function MuscleTrendRow({ muscle, values, recent, prior, onPress, last = false }: { muscle: string; values: readonly number[]; recent: number; prior: number; onPress: () => void; last?: boolean }) {
  const { colors } = useAppearance();
  const delta = Math.round(recent) - Math.round(prior);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${muscleLabel(muscle)}, ${Math.round(recent)} percent, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)} from previous 4 weeks. View coverage over time`}>
    <View style={styles.copy}>
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{muscleLabel(muscle)}</Text>
      <Text style={[styles.delta, { color: delta > 0 ? colors.text : delta < 0 ? '#FF5151' : colors.subtleText }]}>{delta === 0 ? 'No change' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} pts`}</Text>
    </View>
    <View style={styles.bars}>{values.map((value, index) => <View key={index} style={[styles.bar, value ? { height: `${Math.max(20, value)}%`, backgroundColor: index < 4 ? colors.subtleText : colors.accent } : { height: 3, backgroundColor: colors.surfaceStrong }]} />)}</View>
    <Text style={[styles.value, { color: colors.text }]}>{Math.round(recent)}%</Text>
    <ChevronRight width={16} height={16} color={colors.subtleText} strokeWidth={2.4} />
  </Pressable>;
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', letterSpacing: -.3 },
  delta: { marginTop: 3, fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bars: { height: 26, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  // No full-height track: eight tracks read as one segmented meter filling from the right.
  bar: { width: 6, borderRadius: 3 },
  value: { width: 50, textAlign: 'right', fontSize: 16, fontWeight: '900', letterSpacing: -.4, fontVariant: ['tabular-nums'] },
  pressed: { opacity: .6 },
});
