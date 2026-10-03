import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ChevronRight } from 'react-native-feather';

import { useAppearance } from '@/components/appearance-provider';

/** Card section title shared by the Home and Stats overviews. */
export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  const { colors } = useAppearance();
  return <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
    {action && <Pressable onPress={action.onPress} hitSlop={10} style={styles.sectionAction} accessibilityRole="button"><Text style={[styles.sectionActionText, { color: colors.mutedText }]}>{action.label}</Text><ChevronRight width={15} height={15} color={colors.mutedText} strokeWidth={2.4} /></Pressable>}
  </View>;
}

export function ProgressRing({ value, color, track, children, size = 64, stroke = 6 }: { value: number; color: string; track: string; children: ReactNode; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2; const circumference = 2 * Math.PI * radius;
  return <View style={[styles.ring, { width: size, height: size }]}>
    <Svg width={size} height={size} style={styles.ringSvg}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
      {value > 0 && <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${circumference * Math.min(100, value) / 100} ${circumference}`} />}
    </Svg>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  sectionHeader: { marginTop: 30, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -.6 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 }, sectionActionText: { fontSize: 13, fontWeight: '800' },
  ring: { alignItems: 'center', justifyContent: 'center' }, ringSvg: { position: 'absolute', transform: [{ rotate: '-90deg' }] },
});
