import { Image } from 'expo-image';
import { Check } from 'react-native-feather';
import { StyleSheet, View } from 'react-native';

import { useAppearance } from '@/components/appearance-provider';
import type { Exercise } from '@/db';

const exerciseImageBase = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';
const firstImageByDetails = new Map<string, string | undefined>();

function firstExerciseImage(detailsJson?: string | null) {
  if (!detailsJson) return undefined;
  if (firstImageByDetails.has(detailsJson)) return firstImageByDetails.get(detailsJson);
  let image: unknown;
  try { image = JSON.parse(detailsJson).images?.[0]; } catch { /* No photo; the tile stays a neutral swatch. */ }
  const result = typeof image === 'string' ? image : undefined;
  firstImageByDetails.set(detailsJson, result);
  return result;
}

export function ExerciseThumb({ exercise, size, done }: { exercise?: Pick<Exercise, 'id' | 'detailsJson'>; size: number; done?: boolean }) {
  const { colors } = useAppearance();
  const image = firstExerciseImage(exercise?.detailsJson);
  return <View style={{ width: size, height: size }}>
    <View style={[styles.thumb, { backgroundColor: colors.surfaceStrong }]}>{image && <Image source={exerciseImageBase + image} recyclingKey={exercise?.id} contentFit="cover" transition={150} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />}</View>
    {done && <View style={[styles.thumbBadge, { backgroundColor: colors.accent, borderColor: colors.background }]}><Check width={11} height={11} color={colors.accentText} strokeWidth={3.5} /></View>}
  </View>;
}

const styles = StyleSheet.create({
  thumb: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  thumbBadge: { position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
