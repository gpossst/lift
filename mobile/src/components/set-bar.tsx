import { StyleSheet, Text, View } from 'react-native';
import { useAppearance } from '@/components/appearance-provider';

type Set = { weight: number; reps: number };

/** What a set's bar length measures: weight when the exercise needs it, otherwise reps. */
export const setBarSize = (set: Set, requiresWeight: boolean) => requiresWeight ? set.weight : set.reps;

/** Bar length scales against `max`; one segment per rep, so a session's shape reads at a glance. */
export function SetBar({ number, set, requiresWeight, max, highlight }: { number: number; set: Set; requiresWeight: boolean; max: number; highlight?: boolean }) {
  const { colors } = useAppearance();
  const weighted = requiresWeight || set.weight > 0;
  return <View style={styles.row} accessible accessibilityLabel={`Set ${number}, ${weighted ? `${requiresWeight ? '' : 'plus '}${set.weight} pounds, ` : ''}${set.reps} reps${highlight ? ', top set' : ''}`}>
    <Text style={[styles.number, { color: colors.subtleText }]}>{number}</Text>
    <View style={styles.track}><View style={[styles.bar, { width: `${Math.max(14, setBarSize(set, requiresWeight) / Math.max(1, max) * 100)}%` }]}>
      {/* ponytail: segments cap at 30 reps; past that they'd be slivers anyway. */}
      {Array.from({ length: Math.min(set.reps, 30) || 1 }, (_, rep) => <View key={rep} style={[styles.rep, { backgroundColor: highlight ? colors.accent : colors.surfaceStrong }]} />)}
    </View></View>
    <Text style={[styles.value, { color: colors.text }]}>{weighted ? `${requiresWeight ? '' : '+'}${set.weight}` : set.reps}<Text style={[styles.unit, { color: colors.mutedText }]}>{weighted ? ` lb × ${set.reps}` : ' reps'}</Text></Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 10 },
  number: { width: 14, fontSize: 12, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  track: { flex: 1 },
  bar: { height: 22, flexDirection: 'row', gap: 2 },
  rep: { flex: 1, borderRadius: 3 },
  value: { width: 108, fontSize: 15, fontWeight: '900', letterSpacing: -.3, textAlign: 'right', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 12, fontWeight: '700', letterSpacing: 0 },
});
