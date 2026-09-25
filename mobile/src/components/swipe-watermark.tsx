import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeOut, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Mask, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { AppearanceColors } from '@/lib/appearance';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const watermarkExit = FadeOut.duration(180);

// Animated "Swipe" sheen drawn behind a ruler. Render conditionally; it fades out
// on unmount once the user interacts. Text scales from `height`.
export function SwipeWatermark({ colors, height, fontSize = Math.round(height * 0.545) }: { colors: AppearanceColors; height: number; fontSize?: number }) {
  const reduceMotion = useReducedMotion();
  const sheenPosition = useSharedValue(-80);
  useEffect(() => {
    if (reduceMotion) {
      sheenPosition.value = -80;
      return;
    }
    sheenPosition.value = -80;
    sheenPosition.value = withRepeat(withSequence(
      withTiming(300, { duration: 2_200, easing: Easing.inOut(Easing.quad) }),
      withDelay(1_800, withTiming(-80, { duration: 0 })),
    ), -1);
    return () => cancelAnimation(sheenPosition);
  }, [reduceMotion, sheenPosition]);
  const sheenAnimatedProps = useAnimatedProps(() => ({ x: sheenPosition.value }));
  const y = Math.round(height / 2 + fontSize * 0.35);
  return <Animated.View pointerEvents="none" accessibilityElementsHidden exiting={watermarkExit} style={StyleSheet.absoluteFill}>
    <Svg width="100%" height={height} viewBox={`0 0 300 ${height}`}>
      <Defs>
        <LinearGradient id="watermarkSheen" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0" stopColor={colors.text} stopOpacity={0} />
          <Stop offset="0.5" stopColor={colors.text} stopOpacity={0.55} />
          <Stop offset="1" stopColor={colors.text} stopOpacity={0} />
        </LinearGradient>
        <Mask id="watermarkText" maskUnits="userSpaceOnUse" x={0} y={0} width={300} height={height}>
          <SvgText x={150} y={y} textAnchor="middle" fill="#FFFFFF" fontSize={fontSize} fontWeight="900" fontStyle="italic" letterSpacing={-3}>Swipe</SvgText>
        </Mask>
      </Defs>
      <SvgText x={150} y={y} textAnchor="middle" fill={colors.text} opacity={0.08} fontSize={fontSize} fontWeight="900" fontStyle="italic" letterSpacing={-3}>Swipe</SvgText>
      <AnimatedRect animatedProps={sheenAnimatedProps} y={0} width={80} height={height} fill="url(#watermarkSheen)" mask="url(#watermarkText)" />
    </Svg>
  </Animated.View>;
}
