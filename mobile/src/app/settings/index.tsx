import { ui } from '@/styles/primitives';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Activity, ChevronRight, Info, Sliders } from 'react-native-feather';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { authClient } from '@/lib/auth-client';
import { getProfile } from '@/lib/profile';
import { getExercises, getRejectedCloudSyncChanges, type CloudSyncRejectedChange } from '@/db';

const groups = [
  { title: 'Appearance', description: 'Set your background and primary color.', path: '/settings/appearance', Icon: Sliders },
  { title: 'Workouts', description: 'Build splits and adjust workout suggestions.', path: '/settings/workouts', Icon: Activity },
  { title: 'Legal & Support', description: 'Privacy, terms, support, and data deletion.', path: '/settings/legal', Icon: Info },
] as const;

export default function SettingsScreen() {
  const { colors } = useAppearance();
  const { data: session } = authClient.useSession();
  const [displayName, setDisplayName] = useState('');
  const [syncIssues, setSyncIssues] = useState<CloudSyncRejectedChange[]>([]);
  useFocusEffect(useCallback(() => {
    let active = true;
    setSyncIssues(getRejectedCloudSyncChanges());
    void getProfile().then((profile) => { if (active) setDisplayName(profile.displayName); }).catch(() => undefined);
    return () => { active = false; };
  }, []));
  const name = displayName.trim() || session?.user.name?.trim() || session?.user.email?.split('@')[0] || 'Your profile';
  const email = session?.user.email;
  const exerciseNames = new Map(syncIssues.length ? getExercises().map((exercise) => [exercise.id, exercise.name]) : []);

  function reviewSyncIssue(issue: CloudSyncRejectedChange) {
    const [workoutId, exerciseId] = issue.key.split('\u001f');
    if (issue.entity === 'split') router.push('/settings/workouts');
    else if (issue.entity === 'set') router.push({ pathname: '/history-edit', params: { workoutId, exerciseId } });
    else router.push({ pathname: '/history-detail', params: { workoutId } });
  }

  return <SafeAreaView edges={['top', 'right', 'left']} style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
      <Text style={[ui.title, { color: colors.text }]}>Settings</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.push('/settings/profile')} style={({ pressed }) => [styles.profile, { backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Open profile settings for ${name}`}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}><Text style={[styles.initial, { color: colors.accentText }]}>{name.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.profileCopy}><Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>{name}</Text>{email && <Text style={[styles.profileEmail, { color: colors.mutedText }]} numberOfLines={1}>{email}</Text>}</View>
        <ChevronRight width={19} height={19} color={colors.mutedText} strokeWidth={2.4} />
      </Pressable>
      <View style={styles.list}>
        {groups.map(({ title, description, path, Icon }) => <Pressable key={title} onPress={() => router.push(path)} style={({ pressed }) => [styles.row, { borderBottomColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Open ${title} settings`}>
          <View style={styles.icon}><Icon width={22} height={22} color={colors.text} strokeWidth={2.4} /></View>
          <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.rowDescription, { color: colors.mutedText }]}>{description}</Text></View>
          <ChevronRight width={19} height={19} color={colors.subtleText} strokeWidth={2.4} />
        </Pressable>)}
      </View>
      {syncIssues.length > 0 && <View style={styles.syncIssues}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>Changes need attention</Text>
        <Text style={[styles.rowDescription, { color: colors.mutedText }]}>These changes are kept on this device. Review them before switching accounts.</Text>
        {syncIssues.map((issue) => {
          const [, exerciseId, setNumber] = issue.key.split('\u001f');
          const title = issue.entity === 'set' ? `${exerciseNames.get(exerciseId) ?? 'Exercise'} · set ${setNumber}` : issue.entity === 'split' ? 'Workout split' : 'Workout changes';
          return <Pressable key={JSON.stringify([issue.entity, issue.key])} onPress={() => reviewSyncIssue(issue)} style={({ pressed }) => [styles.row, { borderBottomColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Review ${title}: ${issue.reason}`}>
            <View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.rowDescription, { color: colors.mutedText }]}>{issue.reason}</Text></View>
            <ChevronRight width={19} height={19} color={colors.subtleText} strokeWidth={2.4} />
          </Pressable>;
        })}
      </View>}
      <Text style={[styles.version, { color: colors.mutedText }]}>Lift version {Constants.expoConfig?.version}</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header: { width: '100%', maxWidth: 688, alignSelf: 'center', height: 72, paddingHorizontal: 24, justifyContent: 'center' },
  content: { width: '100%', maxWidth: 688, alignSelf: 'center', flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 },
  profile: { minHeight: 92, marginTop: 8, paddingHorizontal: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 23, fontWeight: '900' },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 18, fontWeight: '900', letterSpacing: -.5 },
  profileEmail: { marginTop: 4, fontSize: 12, fontWeight: '700' },
  list: { marginTop: 20 },
  syncIssues: { marginTop: 28 },
  row: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 13 },
  icon: { width: 28, alignItems: 'center' },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -.35 },
  rowDescription: { marginTop: 3, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  version: { marginTop: 'auto', paddingTop: 36, textAlign: 'center', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: .58 },
});
