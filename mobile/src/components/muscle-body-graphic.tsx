import Body, { type ExtendedBodyPart } from 'react-native-body-highlighter';
import { StyleSheet, View } from 'react-native';

import { useAppearance } from '@/components/appearance-provider';

const partsByMuscle: Record<string, { front: readonly ExtendedBodyPart[]; back: readonly ExtendedBodyPart[] }> = {
  abdominals: { front: [{ slug: 'abs' }], back: [] }, abductors: { front: [], back: [{ slug: 'gluteal' }] }, adductors: { front: [{ slug: 'adductors' }], back: [] }, biceps: { front: [{ slug: 'biceps' }], back: [] }, calves: { front: [], back: [{ slug: 'calves' }] }, chest: { front: [{ slug: 'chest' }], back: [] }, forearms: { front: [{ slug: 'forearm' }], back: [] }, glutes: { front: [], back: [{ slug: 'gluteal' }] }, hamstrings: { front: [], back: [{ slug: 'hamstring' }] }, lats: { front: [], back: [{ slug: 'upper-back' }] }, 'lower back': { front: [], back: [{ slug: 'lower-back' }] }, 'middle back': { front: [], back: [{ slug: 'upper-back' }] }, neck: { front: [{ slug: 'neck' }], back: [{ slug: 'neck' }] }, quadriceps: { front: [{ slug: 'quadriceps' }], back: [] }, shoulders: { front: [{ slug: 'deltoids' }], back: [{ slug: 'deltoids' }] }, traps: { front: [], back: [{ slug: 'trapezius' }] }, triceps: { front: [{ slug: 'triceps' }], back: [{ slug: 'triceps' }] },
};

export function MuscleBodyGraphic({ muscle, color }: { muscle: string; color?: string }) {
	const { colors } = useAppearance();
  const parts = partsByMuscle[muscle] ?? { front: [], back: [] };
  const props = { gender: 'male' as const, scale: 0.54, border: 'none' as const, defaultFill: '#E9EBE6', defaultStroke: 'none' };
  const highlight = color ?? colors.accent;
  return <View style={[styles.bodyPair, styles.nonInteractive]} accessibilityLabel={`${muscle} highlighted on body diagram`}><Body {...props} data={parts.front.map((part) => ({ ...part, color: highlight }))} side="front" /><Body {...props} data={parts.back.map((part) => ({ ...part, color: highlight }))} side="back" /></View>;
}

const styles = StyleSheet.create({ bodyPair: { height: 238, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }, nonInteractive: { pointerEvents: 'none' } });
