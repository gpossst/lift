import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppearance } from '@/components/appearance-provider';
import { ui } from '@/styles/primitives';

type Option<T extends string> = { value: T; label: string; accessibilityLabel: string };

export function SegmentedPicker<T extends string>({ options, selected, onSelect, compact = false }: { options: readonly Option<T>[]; selected: T; onSelect: (value: T) => void; compact?: boolean }) {
  const { colors } = useAppearance();
  const [width, setWidth] = useState(0);
  // RN Animated (not Reanimated): the shared-value + useAnimatedStyle equivalent
  // intermittently fails to attach its mapper on RN 0.86 Fabric, freezing the tile.
  const [tilePosition] = useState(() => new Animated.Value(0));
  const tileWidth = Math.max((width - 8 - 4 * (options.length - 1)) / options.length, 0);
  const selectedIndex = options.findIndex((option) => option.value === selected);

  useEffect(() => {
    if (tileWidth <= 0 || selectedIndex < 0) return;
    Animated.timing(tilePosition, { toValue: Math.max(0, selectedIndex) * (tileWidth + 4), duration: 240, useNativeDriver: true }).start();
  }, [selectedIndex, tileWidth, tilePosition]);

  return <View style={[styles.picker, compact && styles.compact, { backgroundColor: colors.surface }]} onLayout={({ nativeEvent }) => {
    const nextWidth = nativeEvent.layout.width;
    if (nextWidth === width) return;
    tilePosition.setValue(Math.max(0, selectedIndex) * ((nextWidth - 8 - 4 * (options.length - 1)) / options.length + 4));
    setWidth(nextWidth);
  }} accessibilityRole="tablist">
    {tileWidth > 0 && selectedIndex >= 0 && <Animated.View pointerEvents="none" style={[styles.activeTile, { width: tileWidth, backgroundColor: colors.inverse, transform: [{ translateX: tilePosition }] }]} />}
    {options.map(({ value, label, accessibilityLabel }) => <Pressable key={value} onPress={() => onSelect(value)} style={({ pressed }) => [styles.button, pressed && ui.pressed]} accessibilityRole="tab" accessibilityState={{ selected: value === selected }} accessibilityLabel={accessibilityLabel}><Text style={[styles.buttonText, { color: value === selected ? colors.inverseText : colors.subtleText }]}>{label}</Text></Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  picker: { height: 52, padding: 4, borderRadius: 17, flexDirection: 'row', gap: 4, position: 'relative' },
  compact: { height: 46 },
  activeTile: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 13 },
  button: { flex: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  buttonText: { fontSize: 14, fontWeight: '900', letterSpacing: -.2 },
});
