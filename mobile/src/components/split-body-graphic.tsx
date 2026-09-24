import Body, { type ExtendedBodyPart } from 'react-native-body-highlighter';
import { StyleSheet, View } from 'react-native';

import { useAppearance } from '@/components/appearance-provider';

export type SplitId = 'push' | 'pull' | 'chest' | 'back' | 'legs';

type SplitGraphic = {
  primary: {
    front: readonly ExtendedBodyPart[];
    back: readonly ExtendedBodyPart[];
  };
  secondary: {
    front: readonly ExtendedBodyPart[];
    back: readonly ExtendedBodyPart[];
  };
};

const graphics: Record<SplitId, SplitGraphic> = {
  push: {
    primary: {
      front: [{ slug: 'chest' }, { slug: 'deltoids' }, { slug: 'triceps' }],
      back: [{ slug: 'triceps' }],
    },
    secondary: {
      front: [{ slug: 'abs' }, { slug: 'obliques' }],
      back: [],
    },
  },
  pull: {
    primary: {
      front: [{ slug: 'biceps' }],
      back: [{ slug: 'upper-back' }, { slug: 'trapezius' }],
    },
    secondary: {
      front: [{ slug: 'forearm' }],
      back: [{ slug: 'lower-back' }],
    },
  },
  chest: {
    primary: { front: [{ slug: 'chest' }], back: [] },
    secondary: { front: [{ slug: 'deltoids' }, { slug: 'triceps' }], back: [{ slug: 'triceps' }] },
  },
  back: {
    primary: { front: [], back: [{ slug: 'upper-back' }, { slug: 'lower-back' }, { slug: 'trapezius' }] },
    secondary: { front: [{ slug: 'biceps' }, { slug: 'forearm' }], back: [] },
  },
  legs: {
    primary: {
      front: [{ slug: 'quadriceps' }],
      back: [{ slug: 'gluteal' }, { slug: 'hamstring' }],
    },
    secondary: {
      front: [{ slug: 'adductors' }, { slug: 'tibialis' }],
      back: [{ slug: 'calves' }],
    },
  },
};

export function SplitBodyGraphic({ split, muscles, large = false }: { split: string; muscles?: readonly string[]; large?: boolean }) {
	const { colors } = useAppearance();
  const { primary, secondary } = graphics[split as SplitId] ?? {
    primary: { front: muscles?.flatMap((muscle) => muscleParts[muscle]?.front ?? []) ?? [], back: muscles?.flatMap((muscle) => muscleParts[muscle]?.back ?? []) ?? [] },
    secondary: { front: [], back: [] },
  };
  const highlight = (primaryParts: readonly ExtendedBodyPart[], secondaryParts: readonly ExtendedBodyPart[]) => {
    const primarySlugs = new Set(primaryParts.map(({ slug }) => slug));
    return [
      ...secondaryParts.filter(({ slug }) => !primarySlugs.has(slug)).map((part) => ({ ...part, color: `${colors.accent}99` })),
      ...primaryParts.map((part) => ({ ...part, color: colors.accent })),
    ];
  };
  const sharedProps = {
    gender: 'male' as const,
    scale: large ? 0.65 : 0.2,
    border: 'none' as const,
    defaultFill: colors.surfaceStrong,
    defaultStroke: 'none',
  };

  return (
    <View pointerEvents="none" style={[styles.bodyPair, large && styles.largeBodyPair]} accessibilityLabel={`${split} muscle groups`}>
      <Body {...sharedProps} data={highlight(primary.front, secondary.front)} side="front" />
      <Body {...sharedProps} data={highlight(primary.back, secondary.back)} side="back" />
    </View>
  );
}

/**
 * A workout-specific coverage map. Muscles trained as a movement's main target
 * use the full accent; assisting muscles retain the same hue at lower opacity.
 * Everything else stays neutral, making gaps in the session easy to spot.
 */
export function MuscleCoverageGraphic({ primaryMuscles, secondaryMuscles, split, targetMuscles }: { primaryMuscles: readonly string[]; secondaryMuscles: readonly string[]; split: string; targetMuscles?: readonly string[] }) {
	const { colors, mode } = useAppearance();
	const missedColor = mode === 'dark' ? '#B34842' : 'rgba(255, 117, 101, 0.58)';
  // react-native-body-highlighter snapshots highlight data on mount, so use the
  // logged-muscle signature as a key to redraw when a newly saved set lands.
  const coverageKey = `${split}:${[...primaryMuscles].sort().join(',')}|${[...secondaryMuscles].sort().join(',')}`;
  const musclesToParts = (muscles: readonly string[], side: 'front' | 'back') => muscles.flatMap((muscle) => {
    const splitParts = muscleParts[muscle];
    return splitParts?.[side] ?? [];
  });
  const primary = { front: musclesToParts(primaryMuscles, 'front'), back: musclesToParts(primaryMuscles, 'back') };
  const secondary = { front: musclesToParts(secondaryMuscles, 'front'), back: musclesToParts(secondaryMuscles, 'back') };
  const targets = { front: musclesToParts(targetMuscles ?? splitTargets[split as SplitId] ?? [], 'front'), back: musclesToParts(targetMuscles ?? splitTargets[split as SplitId] ?? [], 'back') };
  const coverage = (primaryParts: readonly ExtendedBodyPart[], secondaryParts: readonly ExtendedBodyPart[], targetParts: readonly ExtendedBodyPart[]) => {
    const primarySlugs = new Set(primaryParts.map(({ slug }) => slug));
    const secondarySlugs = new Set(secondaryParts.map(({ slug }) => slug));
    return [
      ...targetParts.filter(({ slug }) => !primarySlugs.has(slug) && !secondarySlugs.has(slug)).map((part) => ({ ...part, color: missedColor })),
      ...secondaryParts.filter(({ slug }) => !primarySlugs.has(slug)).map((part) => ({ ...part, color: `${colors.accent}6B` })),
      ...primaryParts.map((part) => ({ ...part, color: colors.accent })),
    ];
  };
  const sharedProps = { gender: 'male' as const, scale: 0.62, border: 'none' as const, defaultFill: '#3A3D35', defaultStroke: 'none' };

  return <View pointerEvents="none" style={styles.coveragePair} accessibilityLabel="Workout muscle coverage. Bright yellow indicates primary muscles trained; muted yellow indicates secondary muscles trained; red indicates a target muscle not yet trained.">
    <Body key={`front-${coverageKey}`} {...sharedProps} data={coverage(primary.front, secondary.front, targets.front)} side="front" />
    <Body key={`back-${coverageKey}`} {...sharedProps} data={coverage(primary.back, secondary.back, targets.back)} side="back" />
  </View>;
}

const splitTargets: Record<SplitId, readonly string[]> = {
  push: ['chest', 'shoulders', 'triceps', 'abdominals', 'obliques'],
  pull: ['biceps', 'lats', 'middle back', 'traps', 'forearms', 'lower back'],
  chest: ['chest', 'shoulders', 'triceps'],
  back: ['lats', 'middle back', 'traps', 'lower back', 'biceps', 'forearms'],
  legs: ['quadriceps', 'glutes', 'hamstrings', 'adductors', 'abductors', 'calves'],
};

const muscleParts: Record<string, { front: readonly ExtendedBodyPart[]; back: readonly ExtendedBodyPart[] }> = {
  abdominals: { front: [{ slug: 'abs' }], back: [] },
  abductors: { front: [], back: [{ slug: 'gluteal' }] },
  adductors: { front: [{ slug: 'adductors' }], back: [] },
  biceps: { front: [{ slug: 'biceps' }], back: [] },
  calves: { front: [], back: [{ slug: 'calves' }] },
  chest: { front: [{ slug: 'chest' }], back: [] },
  forearms: { front: [{ slug: 'forearm' }], back: [{ slug: 'forearm' }] },
  glutes: { front: [], back: [{ slug: 'gluteal' }] },
  hamstrings: { front: [], back: [{ slug: 'hamstring' }] },
  lats: { front: [], back: [{ slug: 'upper-back' }] },
  'lower back': { front: [], back: [{ slug: 'lower-back' }] },
  'middle back': { front: [], back: [{ slug: 'upper-back' }] },
  neck: { front: [{ slug: 'neck' }], back: [{ slug: 'neck' }] },
  obliques: { front: [{ slug: 'obliques' }], back: [] },
  quadriceps: { front: [{ slug: 'quadriceps' }], back: [] },
  shoulders: { front: [{ slug: 'deltoids' }], back: [{ slug: 'deltoids' }] },
  traps: { front: [], back: [{ slug: 'trapezius' }] },
  triceps: { front: [{ slug: 'triceps' }], back: [{ slug: 'triceps' }] },
};

const styles = StyleSheet.create({
  bodyPair: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  largeBodyPair: { marginLeft: 0 },
  coveragePair: { height: 250, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
});
