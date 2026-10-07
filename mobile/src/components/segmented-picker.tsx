import { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppearance } from '@/components/appearance-provider';
import { ui } from '@/styles/primitives';

type Option<T extends string> = { value: T; label: string; accessibilityLabel: string };

export function SegmentedPicker<T extends string>({ options, selected, onSelect, compact = false, marked }: { options: readonly Option<T>[]; selected: T; onSelect: (value: T) => void; compact?: boolean; marked?: T }) {
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

  // Too many options to share one row legibly (e.g. large custom plans): scroll instead.
  if (options.length > 4) return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.picker, compact && styles.compact, { backgroundColor: colors.surface, flexGrow: 0, padding: 0 }]} contentContainerStyle={styles.scrollContent} accessibilityRole="tablist">
    {options.map(({ value, label, accessibilityLabel }) => <Pressable key={value} onPress={() => onSelect(value)} style={({ pressed }) => [styles.button, styles.scrollButton, value === selected && { backgroundColor: colors.inverse }, pressed && ui.pressed]} accessibilityRole="tab" accessibilityState={{ selected: value === selected }} accessibilityLabel={accessibilityLabel}><Text style={[styles.buttonText, { color: value === selected ? colors.inverseText : colors.subtleText }]} numberOfLines={1}>{label}</Text>{value === marked && <View style={[styles.mark, { backgroundColor: colors.accent }]} />}</Pressable>)}
  </ScrollView>;

  return <View style={[styles.picker, compact && styles.compact, { backgroundColor: colors.surface }]} onLayout={({ nativeEvent }) => {
    const nextWidth = nativeEvent.layout.width;
    if (nextWidth === width) return;
    tilePosition.setValue(Math.max(0, selectedIndex) * ((nextWidth - 8 - 4 * (options.length - 1)) / options.length + 4));
    setWidth(nextWidth);
  }} accessibilityRole="tablist">
    {tileWidth > 0 && selectedIndex >= 0 && <Animated.View pointerEvents="none" style={[styles.activeTile, { width: tileWidth, backgroundColor: colors.inverse, transform: [{ translateX: tilePosition }] }]} />}
    {options.map(({ value, label, accessibilityLabel }) => <Pressable key={value} onPress={() => onSelect(value)} style={({ pressed }) => [styles.button, pressed && ui.pressed]} accessibilityRole="tab" accessibilityState={{ selected: value === selected }} accessibilityLabel={accessibilityLabel}><Text style={[styles.buttonText, { color: value === selected ? colors.inverseText : colors.subtleText }]}>{label}</Text>{value === marked && <View style={[styles.mark, { backgroundColor: colors.accent }]} />}</Pressable>)}
  </View>;
}

const styles = StyleSheet.create({
  picker: { height: 52, padding: 4, borderRadius: 17, flexDirection: 'row', gap: 4, position: 'relative' },
  compact: { height: 46 },
  activeTile: { position: 'absolute', left: 4, top: 4, bottom: 4, borderRadius: 13 },
  button: { flex: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  scrollContent: { padding: 4, gap: 4 }, scrollButton: { flex: 0, paddingHorizontal: 16 },
  buttonText: { fontSize: 14, fontWeight: '900', letterSpacing: -.2 },
  mark: { position: 'absolute', bottom: 6, width: 5, height: 5, borderRadius: 2.5 },
});
