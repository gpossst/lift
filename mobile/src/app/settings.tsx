import { router } from 'expo-router';
import { Activity, ChevronRight, Info, Sliders, User } from 'react-native-feather';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
const groups = [
  { title: 'Profile', description: 'Manage your account.', path: '/settings/profile', Icon: User },
  { title: 'Appearance', description: 'Set your background and primary color.', path: '/settings/appearance', Icon: Sliders },
  { title: 'Workouts', description: 'Build splits and adjust workout suggestions.', path: '/settings/workouts', Icon: Activity },
  { title: 'Legal & Support', description: 'Privacy, terms, support, and data deletion.', path: '/settings/legal', Icon: Info },
] as const;

export default function SettingsScreen() {
  const { colors } = useAppearance();

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
    </View>
    <View style={styles.content}>
      <View style={styles.list}>
        {groups.map(({ title, description, path, Icon }) => <Pressable key={title} onPress={() => router.push(path)} style={({ pressed }) => [styles.row, { borderBottomColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Open ${title} settings`}>
          <View style={styles.icon}><Icon width={22} height={22} color={colors.text} strokeWidth={2.4} /></View>
          <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.rowDescription, { color: colors.mutedText }]}>{description}</Text></View>
          <ChevronRight width={19} height={19} color={colors.subtleText} strokeWidth={2.4} />
        </Pressable>)}
      </View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, header: { height: 72, paddingHorizontal: 24, justifyContent: 'center' }, title: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2 }, content: { paddingHorizontal: 24 }, list: {}, row: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 13 }, icon: { width: 28, alignItems: 'center' }, rowCopy: { flex: 1 }, rowTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -.35 }, rowDescription: { marginTop: 3, fontSize: 12, lineHeight: 16, fontWeight: '700' }, pressed: { opacity: .58 },
});
