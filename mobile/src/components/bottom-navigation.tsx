import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Clock, Home, Plus, Settings, Users } from 'react-native-feather';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';

type Tab = {
  label: string;
  route: 'index' | 'history' | 'friends' | 'settings';
  Icon: typeof Home;
};

const tabs: Tab[] = [
  { label: 'Home', route: 'index', Icon: Home },
  { label: 'History', route: 'history', Icon: Clock },
  { label: 'Friends', route: 'friends', Icon: Users },
  { label: 'Profile', route: 'settings', Icon: Settings },
];

export function BottomNavigation({ state, navigation }: BottomTabBarProps) {
  const { colors } = useAppearance();
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index]?.name;

  if (!tabs.some((tab) => tab.route === activeRoute)) return null;

  const selectTab = (route: Tab['route']) => {
    const event = navigation.emit({ type: 'tabPress', target: route, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(route);
  };

  return (
    <View style={[styles.shell, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.tabRow} accessibilityRole="tablist">
        {tabs.slice(0, 2).map((tab) => <TabButton key={tab.route} tab={tab} active={activeRoute === tab.route} onPress={() => selectTab(tab.route)} />)}
        <Pressable
          onPress={() => navigation.navigate('start')}
          style={({ pressed }) => [styles.startButton, { backgroundColor: colors.accent }, pressed && styles.startPressed]}
          accessibilityRole="button"
          accessibilityLabel="Start workout">
          <Plus width={28} height={28} color={colors.accentText} strokeWidth={3} />
        </Pressable>
        {tabs.slice(2).map((tab) => <TabButton key={tab.route} tab={tab} active={activeRoute === tab.route} onPress={() => selectTab(tab.route)} />)}
      </View>
    </View>
  );
}

function TabButton({ tab, active, onPress }: { tab: Tab; active: boolean; onPress: () => void }) {
  const { colors } = useAppearance();
  const { Icon } = tab;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}>
      <Icon width={21} height={21} color={active ? colors.text : colors.subtleText} strokeWidth={active ? 2.7 : 2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { paddingHorizontal: 14 },
  tabRow: { height: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabButton: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  startButton: { width: 58, height: 58, marginHorizontal: 5, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 0 },
  pressed: { opacity: .62 },
  startPressed: { opacity: .82, transform: [{ scale: .94 }] },
});
