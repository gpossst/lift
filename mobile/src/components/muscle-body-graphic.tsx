import Body, { type ExtendedBodyPart } from 'react-native-body-highlighter';
import { StyleSheet, View } from 'react-native';

import { useAppearance } from '@/components/appearance-provider';
import { coverageColor } from '@/lib/training-overview';

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

export const bodyMuscleIds = Object.keys(partsByMuscle);

export function TrainingExposureBodyGraphic({ coverage, hasData = true }: { coverage: Readonly<Record<string, number>>; hasData?: boolean }) {
  const { colors } = useAppearance();
  const data = (side: 'front' | 'back') => {
    const parts = new Map<ExtendedBodyPart['slug'], { total: number; count: number }>();
    for (const [muscle, sides] of Object.entries(partsByMuscle)) {
      for (const part of sides[side]) {
        const value = parts.get(part.slug) ?? { total: 0, count: 0 };
        value.total += coverage[muscle] ?? 0;
        value.count += 1;
        parts.set(part.slug, value);
      }
    }
    return [...parts].map(([slug, value]) => ({ slug, color: coverageColor(hasData ? value.total / value.count : 0, colors.surfaceStrong, colors.accent) }));
  };
  const props = { gender: 'male' as const, scale: 0.54, border: 'none' as const, defaultFill: colors.surfaceStrong, defaultStroke: 'none' };
  const description = hasData ? bodyMuscleIds.map((muscle) => `${muscle}: ${Math.round(coverage[muscle] ?? 0)}%`).join(', ') : 'No workouts in the displayed weeks';
  return <View style={[styles.bodyPair, styles.nonInteractive]} accessible accessibilityRole="image" accessibilityLabel={`Front and back body diagram showing estimated progress toward muscle coverage targets. ${description}`}><Body {...props} data={data('front')} side="front" /><Body {...props} data={data('back')} side="back" /></View>;
}

const styles = StyleSheet.create({ bodyPair: { height: 238, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }, nonInteractive: { pointerEvents: 'none' } });
