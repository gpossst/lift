import { useEffect, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeInDown, FadeInUp, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAppearance } from '@/components/appearance-provider';
import { SwipeWatermark } from '@/components/swipe-watermark';
import type { AppearanceColors } from '@/lib/appearance';

type Styles = ReturnType<typeof createStyles>;
type Props = { value: number; min: number; max: number; onChange: (value: number) => void; unit: string; accessibilityLabel: string; accessibilityText: string };
const rulerTrackHeight = 66;

// Ruler-tick slider (stoic's big readout, pushr's tick hump around the active value).
// Ticks are uniform-width columns, so the touched x maps straight to a value.
export function RulerSlider({ value, min, max, onChange, unit, accessibilityLabel, accessibilityText }: Props) {
  const { colors } = useAppearance();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [width, setWidth] = useState(0);
  const [increasing, setIncreasing] = useState(true);
  const [hintDismissed, setHintDismissed] = useState(false);
  const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const step = width / values.length;
  const commit = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped === value) return;
    setIncreasing(clamped > value);
    void Haptics.selectionAsync().catch(() => {});
    onChange(clamped);
  };
  const select = (x: number) => { if (step) commit(Math.floor(x / step) + min); };
  const dismissHint = () => setHintDismissed(true);
  const pan = Gesture.Pan().runOnJS(true).activeOffsetX([-4, 4]).failOffsetY([-12, 12]).onBegin(dismissHint).onStart((event) => select(event.x)).onUpdate((event) => select(event.x));
  const tap = Gesture.Tap().runOnJS(true).onBegin(dismissHint).onEnd((event) => select(event.x));
  return <View style={styles.slider}>
    <View style={styles.readout}>
      <Animated.Text key={value} entering={(increasing ? FadeInUp : FadeInDown).duration(220).easing(Easing.out(Easing.cubic))} style={styles.number}>{value}</Animated.Text>
      <Text style={styles.unit}>{unit}</Text>
    </View>
    <View style={styles.ruler}>
      {!hintDismissed && <SwipeWatermark colors={colors} height={rulerTrackHeight} fontSize={58} />}
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.rulerTrack} accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min, max, now: value, text: accessibilityText }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(event) => commit(value + (event.nativeEvent.actionName === 'increment' ? 1 : -1))}>
          {values.map((item) => {
            const active = item === value;
            return <View key={item} style={styles.tickColumn}>
              <Tick active={active} target={active ? 40 : 14 + (3 - Math.min(Math.abs(item - value), 3)) * 5} styles={styles} colors={colors} />
              <Text style={[styles.tickLabel, active && styles.tickLabelActive]}>{item}</Text>
            </View>;
          })}
        </View>
      </GestureDetector>
    </View>
  </View>;
}

function Tick({ active, target, styles, colors }: { active: boolean; target: number; styles: Styles; colors: AppearanceColors }) {
  const height = useSharedValue(target);
  const activeProgress = useSharedValue(active ? 1 : 0);
  useEffect(() => { height.value = withTiming(target, { duration: 280, easing: Easing.out(Easing.cubic) }); }, [height, target]);
  useEffect(() => { activeProgress.value = withTiming(active ? 1 : 0, { duration: 200 }); }, [active, activeProgress]);
  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
    backgroundColor: interpolateColor(activeProgress.value, [0, 1], [colors.surfaceStrong, colors.accent]),
  }), [colors.surfaceStrong, colors.accent]);
  return <Animated.View style={[styles.tick, barStyle]} />;
}

function createStyles(colors: AppearanceColors) {
  return StyleSheet.create({
    slider: { flex: 1 },
    readout: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    number: { color: colors.text, fontSize: 120, fontWeight: '900', letterSpacing: -5, lineHeight: 124 },
    unit: { color: colors.mutedText, fontSize: 12, fontWeight: '900', letterSpacing: 1, marginTop: 2, textTransform: 'uppercase' },
    ruler: { alignSelf: 'stretch', marginTop: 26, paddingHorizontal: 20 },
    rulerTrack: { flexDirection: 'row', alignItems: 'flex-end', height: rulerTrackHeight },
    tickColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
    tick: { width: 6, borderRadius: 3, backgroundColor: colors.surfaceStrong },
    tickLabel: { color: colors.subtleText, fontSize: 12, fontWeight: '800' },
    tickLabelActive: { color: colors.text },
  });
}
