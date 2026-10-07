import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { usePathname } from 'expo-router';
import { BarChart2, Home, Plus, Settings, Users } from 'react-native-feather';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useAppearance } from '@/components/appearance-provider';

type Tab = {
  label: string;
  route: '(home)' | 'stats' | 'friends' | 'settings';
  Icon: typeof Home;
};

const tabs: Tab[] = [
  { label: 'Home', route: '(home)', Icon: Home },
  { label: 'Stats', route: 'stats', Icon: BarChart2 },
  { label: 'Friends', route: 'friends', Icon: Users },
  { label: 'Settings', route: 'settings', Icon: Settings },
];

export function BottomNavigation({ state, navigation }: BottomTabBarProps) {
  const { colors } = useAppearance();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const activeRoute = state.routes[state.index]?.name;

  const hidden = activeRoute !== 'start' && (!tabs.some((tab) => tab.route === activeRoute) || pathname.startsWith('/history') || pathname.startsWith('/settings/') || pathname.startsWith('/stats/'));
  // Reappearing mid-pop shrinks the scene and squashes the closing page, so wait out the transition.
  const [revealed, setRevealed] = useState(!hidden);
  useEffect(() => {
    if (hidden) { setRevealed(false); return; }
    const timer = setTimeout(() => setRevealed(true), 350);
    return () => clearTimeout(timer);
  }, [hidden]);

  if (hidden || !revealed) return null;

  const selectTab = (route: Tab['route']) => {
    const event = navigation.emit({ type: 'tabPress', target: route, canPreventDefault: true });
    if (!event.defaultPrevented) {
      if (route === 'settings') navigation.navigate('settings', { screen: 'index' });
      else navigation.navigate(route);
    }
  };

  return (
    <View style={[styles.shell, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 10) }]}>
      {activeRoute !== 'start' && <Svg width="100%" height={24} style={styles.gradient} pointerEvents="none">
        <Defs>
          <LinearGradient id="navbar-top-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.background} stopOpacity="0" />
            <Stop offset="1" stopColor={colors.background} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#navbar-top-fade)" />
      </Svg>}
      <View style={styles.tabRow} accessibilityRole="tablist">
        {tabs.slice(0, 2).map((tab) => <TabButton key={tab.route} tab={tab} active={activeRoute === tab.route} onPress={() => selectTab(tab.route)} />)}
        <StartButton active={activeRoute === 'start'} onPress={() => navigation.navigate('start')} />
        {tabs.slice(2).map((tab) => <TabButton key={tab.route} tab={tab} active={activeRoute === tab.route} onPress={() => selectTab(tab.route)} />)}
      </View>
    </View>
  );
}

function StartButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const { colors } = useAppearance();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={active}
      onPressIn={() => { scale.set(withSpring(0.9, { duration: 140, dampingRatio: 0.7 })); }}
      onPressOut={() => { scale.set(withSpring(1, { duration: 320, dampingRatio: 0.45 })); }}
      style={styles.startPressable}
      accessibilityRole="button"
      accessibilityLabel="Start workout"
      accessibilityState={{ disabled: active }}>
      {/* Greyed while on the start screen; it would only reopen this page. */}
      <Animated.View style={[styles.startButton, { backgroundColor: active ? colors.surfaceStrong : colors.accent }, animatedStyle]}>
        <Plus width={28} height={28} color={active ? colors.subtleText : colors.accentText} strokeWidth={3} />
      </Animated.View>
    </Pressable>
  );
}

function TabButton({ tab, active, onPress }: { tab: Tab; active: boolean; onPress: () => void }) {
  const { colors } = useAppearance();
  const { Icon } = tab;
  const scale = useSharedValue(1);
  const mounted = useRef(false);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    // Pop only on tab changes, not when the nav (re)mounts.
    if (mounted.current && active) {
      scale.set(withSequence(
        withSpring(1.18, { duration: 160, dampingRatio: 0.5 }),
        withSpring(1, { duration: 280, dampingRatio: 0.6 }),
      ));
    }
    mounted.current = true;
  }, [active, scale]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}>
      <Animated.View style={iconStyle}>
        <Icon width={21} height={21} color={active ? colors.text : colors.subtleText} strokeWidth={active ? 2.7 : 2.2} />
      </Animated.View>
      <Text style={[styles.tabLabel, { color: active ? colors.text : colors.subtleText }]}>{tab.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { position: 'relative' },
  gradient: { position: 'absolute', top: -24, left: 0 },
  tabRow: { height: 62, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 3, position: 'relative' },
  tabLabel: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  startPressable: { marginHorizontal: 5 },
  startButton: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 0 },
  pressed: { opacity: .62 },
});
