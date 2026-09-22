import { useAuth, useReverification, useUser } from '@clerk/expo';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Minus, Moon, Plus, Sun } from 'react-native-feather';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { clearLocalAccountData } from '@/db';
import { accountPageUrl, deleteAccountData, exportAccountData } from '@/lib/account';
import { accentOptions, type AppearanceMode } from '@/lib/appearance';
import { setCloudSyncUser } from '@/lib/cloud-sync';
import { clearPendingOnboarding } from '@/lib/onboarding';
import { getProfile, updateProfile } from '@/lib/profile';

type Group = 'profile' | 'appearance' | 'workouts';

const groupCopy: Record<Group, { title: string; description: string }> = {
  profile: { title: 'Profile', description: 'Manage your account and session.' },
  appearance: { title: 'Appearance', description: 'Choose the background and color that keeps you focused.' },
  workouts: { title: 'Workouts', description: 'Control timers and suggestions while you train.' },
};

export default function SettingsGroupScreen() {
  const { group } = useLocalSearchParams<{ group: Group }>();
  const selectedGroup: Group = group in groupCopy ? group : 'profile';
  const { colors } = useAppearance();
  const { title, description } = groupCopy[selectedGroup];

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
      <Pressable onPress={() => router.replace('/settings')} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Back to settings"><ArrowLeft width={20} height={20} color={colors.text} strokeWidth={2.5} /></Pressable>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.copy, { color: colors.mutedText }]}>{description}</Text>
      {selectedGroup === 'profile' && <ProfileSettings />}
      {selectedGroup === 'appearance' && <AppearanceSettings />}
      {selectedGroup === 'workouts' && <WorkoutSettings />}
    </ScrollView>
  </SafeAreaView>;
}

function ProfileSettings() {
  const { colors } = useAppearance();
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const [displayName, setDisplayName] = useState('');
  const [cohortOptIn, setCohortOptIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deletionCommitted, setDeletionCommitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void getProfile(getToken).then((profile) => { setDisplayName(profile.displayName); setCohortOptIn(profile.recommendationPreferences?.optInSimilarUsers === true); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load profile.')).finally(() => setLoading(false));
  }, [getToken]);

  const save = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try { setDisplayName((await updateProfile(getToken, displayName)).displayName); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save profile.'); }
    finally { setSaving(false); }
  };

  const setCohort = async (value: boolean) => {
    if (saving) return;
    const previous = cohortOptIn;
    setCohortOptIn(value); setSaving(true); setError(null);
    try { setCohortOptIn((await updateProfile(getToken, { recommendationPreferences: { optInSimilarUsers: value } })).recommendationPreferences?.optInSimilarUsers === true); }
    catch (reason) { setCohortOptIn(previous); setError(reason instanceof Error ? reason.message : 'Could not save privacy preference.'); }
    finally { setSaving(false); }
  };

  const exportData = async () => {
    if (exporting) return;
    setExporting(true); setError(null);
    try { await exportAccountData(getToken, { email: user?.primaryEmailAddress?.emailAddress ?? null, name: user?.fullName ?? null }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not export data.'); }
    finally { setExporting(false); }
  };

  const deleteIdentity = useReverification(async () => {
    if (!user) throw new Error('Your account is not available. Sign in again.');
    setCloudSyncUser(null);
    await deleteAccountData(getToken);
    setDeletionCommitted(true);
    clearLocalAccountData();
    await clearPendingOnboarding();
    await user.delete();
  });

  const deleteAccount = async () => {
    if (deleting || (!deletionCommitted && deletePhrase !== 'DELETE')) return;
    setDeleting(true); setError(null);
    try { await deleteIdentity(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Account deletion did not finish. Retry to continue safely.'); }
    finally { setDeleting(false); }
  };

  const openPage = async (name: 'privacy' | 'terms' | 'support' | 'delete-account') => {
    const url = accountPageUrl(name);
    if (!url) { setError('Cloud sync is not configured.'); return; }
    await Linking.openURL(url).catch(() => setError('Could not open that link.'));
  };

  return <>
    {loading ? <ActivityIndicator color={colors.accent} /> : <><Text style={[styles.sectionLabel, { color: colors.mutedText }]}>DISPLAY NAME</Text><View style={[styles.nameRow, { borderBottomColor: colors.surfaceStrong }]}><TextInput value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="Display name" placeholderTextColor={colors.subtleText} style={[styles.nameInput, { color: colors.text }]} accessibilityLabel="Display name" />
      <Pressable onPress={() => void save()} disabled={saving || !displayName.trim()} style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, (saving || !displayName.trim()) && styles.disabled]} accessibilityRole="button" accessibilityLabel="Save display name"><Text style={[styles.saveText, { color: colors.accent }]}>{saving ? 'Saving…' : 'Save'}</Text></Pressable></View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</>}
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>PRIVACY</Text>
    <View style={[styles.preferenceRow, { borderBottomColor: colors.surfaceStrong }]}><View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: colors.text }]}>Anonymous cohort comparisons</Text><Text style={[styles.preferenceDescription, { color: colors.mutedText }]}>Use your height, weight, goals, schedule, and workout totals only in groups of at least five. Friends never see these details.</Text></View><Switch value={cohortOptIn} disabled={saving || loading} onValueChange={(value) => void setCohort(value)} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} thumbColor={colors.background} accessibilityLabel="Use my data in anonymous cohort comparisons" /></View>
    <Pressable onPress={() => void exportData()} disabled={exporting} style={({ pressed }) => [styles.accountRow, { borderBottomColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button"><Text style={[styles.accountRowText, { color: colors.text }]}>{exporting ? 'Preparing export…' : 'Export my data'}</Text></Pressable>
    <Text style={[styles.dataNote, { color: colors.mutedText }]}>Lift stores profile measurements, workout history, friend connections, and cohort preferences while your account is active. See the privacy policy for retention details.</Text>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>LEGAL & SUPPORT</Text>
    {([['Privacy policy', 'privacy'], ['Terms of use', 'terms'], ['Support contact', 'support'], ['Web data-deletion request', 'delete-account']] as const).map(([label, page]) => <Pressable key={page} onPress={() => void openPage(page)} style={({ pressed }) => [styles.accountRow, { borderBottomColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="link"><Text style={[styles.accountRowText, { color: colors.text }]}>{label}</Text></Pressable>)}
    <Text style={[styles.disclaimer, { color: colors.mutedText }]}>Lift provides general fitness information—not medical advice, diagnosis, or treatment. Consult a qualified professional and stop if you experience pain or concerning symptoms.</Text>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>ACCOUNT</Text><Pressable onPress={() => void signOut()} style={({ pressed }) => [styles.accountRow, { borderBottomColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Sign out"><Text style={styles.destructiveText}>Sign out</Text></Pressable>
    <Pressable onPress={() => { setError(null); setDeleteOpen(true); }} style={({ pressed }) => [styles.accountRow, { borderBottomColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Delete account"><Text style={styles.destructiveText}>Delete account</Text></Pressable>
    <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => { if (!deleting && !deletionCommitted) setDeleteOpen(false); }}>
      <View style={styles.modalOverlay}><View style={[styles.modalCard, { backgroundColor: colors.background }]}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>{deletionCommitted ? 'Finish account deletion' : 'Delete your account?'}</Text>
        <Text style={[styles.modalCopy, { color: colors.mutedText }]}>{deletionCommitted ? 'Your Lift app data and local cache are already deleted. Retry to finish deleting your Clerk identity.' : 'This permanently deletes your identity, measurements, workouts, friend connections, cohort preferences, and local account cache. This cannot be undone.'}</Text>
        {!deletionCommitted && <><Text style={[styles.fieldPrompt, { color: colors.mutedText }]}>Type DELETE to confirm</Text><TextInput value={deletePhrase} onChangeText={setDeletePhrase} autoCapitalize="characters" autoCorrect={false} editable={!deleting} style={[styles.deleteInput, { color: colors.text, borderColor: colors.surfaceStrong }]} accessibilityLabel="Type DELETE to confirm account deletion" /></>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable onPress={() => void deleteAccount()} disabled={deleting || (!deletionCommitted && deletePhrase !== 'DELETE')} style={({ pressed }) => [styles.deleteButton, (deleting || (!deletionCommitted && deletePhrase !== 'DELETE')) && styles.disabled, pressed && styles.pressed]} accessibilityRole="button"><Text style={styles.deleteButtonText}>{deleting ? 'Deleting…' : deletionCommitted ? 'Retry deletion' : 'Permanently delete account'}</Text></Pressable>
        {!deletionCommitted && <Pressable onPress={() => setDeleteOpen(false)} disabled={deleting} style={styles.cancelButton} accessibilityRole="button"><Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text></Pressable>}
      </View></View>
    </Modal>
  </>;
}

function AppearanceSettings() {
  const { mode, accent, colors, setMode, setAccent } = useAppearance();
  return <>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>BACKGROUND</Text>
    <View style={styles.modeRow}>{([{ id: 'light', label: 'Light', Icon: Sun }, { id: 'dark', label: 'Dark', Icon: Moon }] as const).map(({ id, label, Icon }) => <ModeOption key={id} mode={id} label={label} Icon={Icon} selected={mode === id} onPress={setMode} />)}</View>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>PRIMARY COLOR</Text>
    <View style={styles.swatches}>{accentOptions.map((option) => <Pressable key={option.id} onPress={() => setAccent(option.id)} style={({ pressed }) => [styles.swatchButton, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected: accent === option.id }} accessibilityLabel={`Use ${option.name} primary color`}><View style={[styles.swatch, { backgroundColor: option.value }, accent === option.id && { borderColor: colors.text }]}>{accent === option.id && <Check width={20} height={20} color="#17180F" strokeWidth={3.2} />}</View><Text style={[styles.swatchLabel, { color: colors.mutedText }]}>{option.name}</Text></Pressable>)}</View>
  </>;
}

function WorkoutSettings() {
  const { colors, showWorkoutRecommendations, restTimerEnabled, useRecommendedRestTimer, restTimerSeconds, setShowWorkoutRecommendations, setRestTimerEnabled, setUseRecommendedRestTimer, setRestTimerSeconds } = useAppearance();
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>TIMER</Text>
    <View style={[styles.preferenceRow, { borderBottomColor: colors.surfaceStrong }]}><View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: colors.text }]}>Rest countdown</Text><Text style={[styles.preferenceDescription, { color: colors.mutedText }]}>Start a countdown after each logged set.</Text></View><Switch style={styles.preferenceSwitch} value={restTimerEnabled} onValueChange={setRestTimerEnabled} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} thumbColor={colors.background} accessibilityLabel="Use rest countdown timer" /></View>
    <View style={[styles.preferenceRow, { borderBottomColor: colors.surfaceStrong, opacity: restTimerEnabled ? 1 : .45 }]}><View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: colors.text }]}>Use recommended length</Text><Text style={[styles.preferenceDescription, { color: colors.mutedText }]}>Match the recommended rest time for each exercise.</Text></View><Switch style={styles.preferenceSwitch} disabled={!restTimerEnabled} value={useRecommendedRestTimer} onValueChange={setUseRecommendedRestTimer} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} thumbColor={colors.background} accessibilityLabel="Use recommended rest timer length" /></View>
    <View style={[styles.durationRow, { borderBottomColor: colors.surfaceStrong, opacity: restTimerEnabled && !useRecommendedRestTimer ? 1 : .45 }]}>
      <View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: colors.text }]}>Default countdown</Text><Text style={[styles.preferenceDescription, { color: colors.mutedText }]}>Adjust in 15-second steps.</Text></View>
      <View style={styles.durationControl}>
        <Pressable disabled={!restTimerEnabled || useRecommendedRestTimer || restTimerSeconds <= 15} onPress={() => setRestTimerSeconds(restTimerSeconds - 15)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reduce default countdown by 15 seconds"><Minus width={18} height={18} color={colors.text} strokeWidth={2.5} /></Pressable>
        <Text style={[styles.durationText, { color: colors.text }]}>{formatTime(restTimerSeconds)}</Text>
        <Pressable disabled={!restTimerEnabled || useRecommendedRestTimer || restTimerSeconds >= 600} onPress={() => setRestTimerSeconds(restTimerSeconds + 15)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Increase default countdown by 15 seconds"><Plus width={18} height={18} color={colors.text} strokeWidth={2.5} /></Pressable>
      </View>
    </View>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>RANKING</Text><View style={[styles.preferenceRow, { borderBottomColor: colors.surfaceStrong }]}><View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: colors.text }]}>Personalized exercise ranking</Text><Text style={[styles.preferenceDescription, { color: colors.mutedText }]}>Rank matching movements while building a workout.</Text></View><Switch style={styles.preferenceSwitch} value={showWorkoutRecommendations} onValueChange={setShowWorkoutRecommendations} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} thumbColor={colors.background} accessibilityLabel="Use personalized exercise ranking" accessibilityHint="Ranks matching exercises in the workout library" /></View>
  </>;
}

function ModeOption({ mode, label, Icon, selected, onPress }: { mode: AppearanceMode; label: string; Icon: typeof Sun; selected: boolean; onPress: (mode: AppearanceMode) => void }) {
  const { colors } = useAppearance();
  return <Pressable onPress={() => onPress(mode)} style={({ pressed }) => [styles.modeOption, { borderBottomColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`Use ${label.toLowerCase()} background`}><Icon width={21} height={21} color={colors.text} strokeWidth={2.3} /><Text style={[styles.modeText, { color: colors.text }]}>{label}</Text>{selected && <Check width={20} height={20} color={colors.accent} strokeWidth={3} />}</Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, header: { height: 72, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 13 }, backButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2 }, content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 }, copy: { maxWidth: 280, fontSize: 14, lineHeight: 20, fontWeight: '700' }, sectionLabel: { marginTop: 38, marginBottom: 2, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, nameInput: { flex: 1, height: 64, paddingHorizontal: 0, fontSize: 16, fontWeight: '800' }, nameRow: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 }, saveButton: { height: 54, paddingLeft: 18, alignItems: 'center', justifyContent: 'center' }, saveText: { fontSize: 15, fontWeight: '900' }, error: { marginTop: 8, color: '#FF5151', fontSize: 12, fontWeight: '700' }, disabled: { opacity: .5 }, modeRow: {}, modeOption: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 13 }, modeText: { flex: 1, fontSize: 16, fontWeight: '900', letterSpacing: -.35 }, swatches: { marginTop: 10, flexDirection: 'row', gap: 18 }, swatchButton: { alignItems: 'center', gap: 8 }, swatch: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, alignItems: 'center', justifyContent: 'center' }, swatchLabel: { fontSize: 11, fontWeight: '900' }, preferenceRow: { minHeight: 96, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, preferenceCopy: { flex: 1 }, preferenceSwitch: { transform: [{ translateY: 10 }] }, preferenceTitle: { fontSize: 15, fontWeight: '900', letterSpacing: -.35 }, preferenceDescription: { marginTop: 4, maxWidth: 240, fontSize: 12, lineHeight: 16, fontWeight: '700' }, durationRow: { minHeight: 82, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, durationControl: { height: 44, minWidth: 128, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, durationText: { minWidth: 48, textAlign: 'center', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] }, accountRow: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center' }, accountRowText: { fontSize: 15, fontWeight: '900' }, destructiveText: { color: '#E23D3D', fontSize: 15, fontWeight: '900' }, dataNote: { marginTop: 14, fontSize: 12, lineHeight: 18, fontWeight: '700' }, disclaimer: { marginTop: 18, fontSize: 12, lineHeight: 18, fontWeight: '700' }, modalOverlay: { flex: 1, padding: 24, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' }, modalCard: { width: '100%', maxWidth: 440, borderRadius: 24, padding: 24 }, modalTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -.8 }, modalCopy: { marginTop: 10, fontSize: 14, lineHeight: 21, fontWeight: '700' }, fieldPrompt: { marginTop: 22, marginBottom: 7, fontSize: 12, fontWeight: '900' }, deleteInput: { minHeight: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 15, fontSize: 17, fontWeight: '900', letterSpacing: 1 }, deleteButton: { minHeight: 54, marginTop: 20, borderRadius: 15, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center' }, deleteButtonText: { color: '#FFF', fontSize: 15, fontWeight: '900' }, cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, cancelText: { fontSize: 15, fontWeight: '900' }, pressed: { opacity: .78, transform: [{ scale: .985 }] },
});
