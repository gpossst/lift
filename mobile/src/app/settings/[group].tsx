import { ui } from '@/styles/primitives';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Check, Minus, Moon, Plus, Sun } from 'react-native-feather';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { clearLocalAccountData, deleteCustomSplit, getActiveWorkout, getCustomSplits, saveCustomSplit, type CustomSplit } from '@/db';
import { exerciseCatalog } from '@/db/exercise-catalog';
import { accountPageUrl, exportAccountData } from '@/lib/account';
import { accentOptions, type AppearanceMode } from '@/lib/appearance';
import { setCloudSyncUser, syncWorkoutData } from '@/lib/cloud-sync';
import { clearPendingOnboarding } from '@/lib/onboarding';
import { clearReturnPlan } from '@/lib/return-plan';
import { getProfile, updateProfile } from '@/lib/profile';
import { authClient } from '@/lib/auth-client';
import { MfaSetupFlow } from '@/components/auth-flow';

type Group = 'profile' | 'appearance' | 'workouts' | 'legal';

const groupCopy: Record<Group, { title: string; description: string }> = {
  profile: { title: 'Profile', description: 'Manage your account and session.' },
  appearance: { title: 'Appearance', description: 'Choose the background and color that keeps you focused.' },
  workouts: { title: 'Workouts', description: 'Build your split and choose how suggestions work.' },
  legal: { title: 'Legal & Support', description: 'Policies, support, and account-deletion resources.' },
};

export default function SettingsGroupScreen() {
  const { group } = useLocalSearchParams<{ group: Group }>();
  const selectedGroup: Group = group in groupCopy ? group : 'profile';
  const { colors } = useAppearance();
  const { title, description } = groupCopy[selectedGroup];

  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
      <Pressable onPress={() => router.replace('/settings')} style={({ pressed }) => [styles.backButton, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel="Back to settings"><ArrowLeft width={20} height={20} color={colors.text} strokeWidth={2.5} /></Pressable>
      <Text style={[ui.title, { color: colors.text }]}>{title}</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.copy, { color: colors.mutedText }]}>{description}</Text>
      {selectedGroup === 'profile' && <ProfileSettings />}
      {selectedGroup === 'appearance' && <AppearanceSettings />}
      {selectedGroup === 'workouts' && <WorkoutSettings />}
      {selectedGroup === 'legal' && <LegalSettings />}
    </ScrollView>
  </SafeAreaView>;
}

function ProfileSettings() {
  const { colors } = useAppearance();
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [displayName, setDisplayName] = useState('');
  const [weightLb, setWeightLb] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [savingMeasurements, setSavingMeasurements] = useState(false);
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const [favoriteExerciseIds, setFavoriteExerciseIds] = useState<string[]>([]);
  const [favoriteQuery, setFavoriteQuery] = useState('');
  const [cohortOptIn, setCohortOptIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deletionPassword, setDeletionPassword] = useState('');
  const [mfaOpen, setMfaOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void getProfile().then((profile) => {
      const preferences = profile.recommendationPreferences;
      setDisplayName(profile.displayName);
      setWeightLb(preferences?.weightLb == null ? '' : String(preferences.weightLb));
      setHeightFeet(preferences?.heightInches == null ? '' : String(Math.floor(preferences.heightInches / 12)));
      setHeightInches(preferences?.heightInches == null ? '' : String(preferences.heightInches % 12));
      setFavoriteExerciseIds(preferences?.favoriteExerciseIds ?? []);
      setCohortOptIn(preferences?.optInSimilarUsers === true);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load profile.')).finally(() => setLoading(false));
  }, []);

  const saveMeasurements = async () => {
    if (savingMeasurements) return;
    const weight = weightLb.trim() ? Number(weightLb) : null;
    const heightEntered = Boolean(heightFeet.trim() || heightInches.trim());
    const feet = heightFeet.trim() ? Number(heightFeet) : 0;
    const inches = heightInches.trim() ? Number(heightInches) : 0;
    const height = heightEntered ? feet * 12 + inches : null;
    setMeasurementError(null);
    if (weight !== null && (!Number.isFinite(weight) || weight < 50 || weight > 1_000)) return setMeasurementError('Weight must be between 50 and 1,000 lb.');
    if (heightEntered && (!heightFeet.trim() || !heightInches.trim() || !Number.isInteger(feet) || !Number.isInteger(inches) || inches < 0 || inches >= 12 || height === null || height < 36 || height > 108)) return setMeasurementError('Enter a height between 3 ft and 9 ft, with 0–11 inches.');
    setSavingMeasurements(true);
    try {
      const preferences = (await updateProfile({ recommendationPreferences: { weightLb: weight, heightInches: height } })).recommendationPreferences;
      setWeightLb(preferences?.weightLb == null ? '' : String(preferences.weightLb));
      setHeightFeet(preferences?.heightInches == null ? '' : String(Math.floor(preferences.heightInches / 12)));
      setHeightInches(preferences?.heightInches == null ? '' : String(preferences.heightInches % 12));
    } catch (reason) { setMeasurementError(reason instanceof Error ? reason.message : 'Could not save measurements.'); }
    finally { setSavingMeasurements(false); }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try { setDisplayName((await updateProfile(displayName)).displayName); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save profile.'); }
    finally { setSaving(false); }
  };

  const setCohort = async (value: boolean) => {
    if (saving) return;
    const previous = cohortOptIn;
    setCohortOptIn(value); setSaving(true); setError(null);
    try { setCohortOptIn((await updateProfile({ recommendationPreferences: { optInSimilarUsers: value } })).recommendationPreferences?.optInSimilarUsers === true); }
    catch (reason) { setCohortOptIn(previous); setError(reason instanceof Error ? reason.message : 'Could not save privacy preference.'); }
    finally { setSaving(false); }
  };

  const saveFavorites = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try { setFavoriteExerciseIds((await updateProfile({ recommendationPreferences: { favoriteExerciseIds } })).recommendationPreferences?.favoriteExerciseIds ?? []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save favorite exercises.'); }
    finally { setSaving(false); }
  };

  const exportData = async () => {
    if (exporting) return;
    setExporting(true); setError(null);
    try { await exportAccountData({ email: user?.email ?? null, name: user?.name ?? null }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not export data.'); }
    finally { setExporting(false); }
  };

  const deleteAccount = async () => {
    if (deleting || deletePhrase !== 'DELETE' || !deletionPassword) return;
    setDeleting(true); setError(null);
    setCloudSyncUser(null);
    try {
      const result = await authClient.deleteUser({ password: deletionPassword });
      if (result.error) throw result.error;
      clearLocalAccountData();
      if (user?.id) clearReturnPlan(user.id);
      await clearPendingOnboarding();
    }
    catch (reason) {
      setCloudSyncUser(user?.id ?? null);
      setError(reason instanceof Error ? reason.message : 'Account deletion did not finish. Retry to continue safely.');
    }
    finally { setDeletionPassword(''); setDeleting(false); }
  };

  return <>
    {loading ? <ActivityIndicator color={colors.accent} /> : <><Text style={[styles.sectionLabel, { color: colors.mutedText }]}>DISPLAY NAME</Text><View style={[styles.nameRow, { borderBottomColor: colors.surfaceStrong }]}><TextInput value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="Display name" placeholderTextColor={colors.subtleText} style={[styles.nameInput, { color: colors.text }]} accessibilityLabel="Display name" />
      <Pressable onPress={() => void save()} disabled={saving || !displayName.trim()} style={({ pressed }) => [styles.saveButton, pressed && ui.pressed, (saving || !displayName.trim()) && styles.disabled]} accessibilityRole="button" accessibilityLabel="Save display name"><Text style={[styles.saveText, { color: colors.accent }]}>{saving ? 'Saving…' : 'Save'}</Text></Pressable></View>
      <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>FAVORITE EXERCISES</Text>
      <TextInput value={favoriteQuery} onChangeText={setFavoriteQuery} autoCapitalize="none" autoCorrect={false} placeholder="Search exercises" placeholderTextColor={colors.subtleText} style={[styles.favoriteSearch, { color: colors.text, borderColor: colors.surfaceStrong }]} accessibilityLabel="Search favorite exercises" />
      <Text style={[styles.favoriteCount, { color: colors.mutedText }]}>{favoriteExerciseIds.length} of 20 selected</Text>
      <View>{favoriteChoices(favoriteQuery, favoriteExerciseIds).map((exercise) => {
        const selected = favoriteExerciseIds.includes(exercise.id);
        return <Pressable key={exercise.id} disabled={!selected && favoriteExerciseIds.length >= 20} onPress={() => setFavoriteExerciseIds((current) => selected ? current.filter((id) => id !== exercise.id) : [...current, exercise.id])} style={({ pressed }) => [styles.favoriteChoice, { borderBottomColor: colors.surfaceStrong }, !selected && favoriteExerciseIds.length >= 20 && styles.disabled, pressed && ui.pressed]} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
          <View style={styles.favoriteChoiceText}><Text style={[styles.favoriteChoiceName, { color: colors.text }]}>{exercise.name}</Text><Text style={[styles.favoriteChoiceDetail, { color: colors.mutedText }]}>{exercise.area} · {exercise.equipment}</Text></View>
          <Text style={[styles.favoriteMark, { color: selected ? colors.accent : colors.subtleText }]}>{selected ? '✓' : '+'}</Text>
        </Pressable>;
      })}</View>
      <Pressable onPress={() => void saveFavorites()} disabled={saving} style={({ pressed }) => [styles.favoritesSave, { borderBottomColor: colors.surfaceStrong }, pressed && ui.pressed, saving && styles.disabled]} accessibilityRole="button" accessibilityLabel="Save favorite exercises"><Text style={[styles.saveText, { color: colors.accent }]}>{saving ? 'Saving…' : 'Save favorites'}</Text></Pressable>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</>}
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>BODY MEASUREMENTS</Text>
    <Text style={[styles.preferenceDescription, { color: colors.mutedText, maxWidth: 320 }]}>Optional. Add these later to see your lifts in context of your bodyweight.</Text>
    <View style={styles.measurementInputs}>
      <View style={[styles.measurementInputWrap, { borderColor: colors.surfaceStrong }]}><TextInput value={weightLb} onChangeText={setWeightLb} keyboardType="decimal-pad" maxLength={6} placeholder="Weight" placeholderTextColor={colors.subtleText} style={[styles.measurementInput, { color: colors.text }]} accessibilityLabel="Weight in pounds" /><Text style={[styles.measurementUnit, { color: colors.mutedText }]}>lb</Text></View>
      <View style={[styles.measurementInputWrap, { borderColor: colors.surfaceStrong }]}><TextInput value={heightFeet} onChangeText={(value) => setHeightFeet(value.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={1} placeholder="ft" placeholderTextColor={colors.subtleText} style={[styles.measurementInput, { color: colors.text }]} accessibilityLabel="Height in feet" /><Text style={[styles.measurementUnit, { color: colors.mutedText }]}>ft</Text></View>
      <View style={[styles.measurementInputWrap, { borderColor: colors.surfaceStrong }]}><TextInput value={heightInches} onChangeText={(value) => setHeightInches(value.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={2} placeholder="in" placeholderTextColor={colors.subtleText} style={[styles.measurementInput, { color: colors.text }]} accessibilityLabel="Additional height in inches" /><Text style={[styles.measurementUnit, { color: colors.mutedText }]}>in</Text></View>
    </View>
    <Pressable onPress={() => void saveMeasurements()} disabled={savingMeasurements} style={({ pressed }) => [styles.favoritesSave, { borderBottomColor: colors.surfaceStrong }, pressed && ui.pressed, savingMeasurements && styles.disabled]} accessibilityRole="button" accessibilityLabel="Save body measurements"><Text style={[styles.saveText, { color: colors.accent }]}>{savingMeasurements ? 'Saving…' : 'Save measurements'}</Text></Pressable>
    {measurementError && <Text accessibilityRole="alert" style={styles.error}>{measurementError}</Text>}
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>PRIVACY</Text>
    <View style={[styles.preferenceRow, { borderBottomColor: colors.surfaceStrong }]}><View style={styles.preferenceCopy}><Text style={[styles.preferenceTitle, { color: colors.text }]}>Anonymous cohort comparisons</Text><Text style={[styles.preferenceDescription, { color: colors.mutedText }]}>Use your height, weight, goals, schedule, and workout totals only in groups of at least five. Friends never see these details.</Text></View><Switch value={cohortOptIn} disabled={saving || loading} onValueChange={(value) => void setCohort(value)} trackColor={{ false: colors.surfaceStrong, true: colors.accent }} thumbColor={colors.background} accessibilityLabel="Use my data in anonymous cohort comparisons" /></View>
    <Pressable onPress={() => void exportData()} disabled={exporting} style={({ pressed }) => [styles.accountRow, { borderBottomColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="button"><Text style={[styles.accountRowText, { color: colors.text }]}>{exporting ? 'Preparing export…' : 'Export my data'}</Text></Pressable>
    <Text style={[styles.dataNote, { color: colors.mutedText }]}>Lift stores profile measurements, workout history, friend connections, and cohort preferences while your account is active. See the privacy policy for retention details.</Text>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>ACCOUNT</Text>
    <Pressable onPress={() => setMfaOpen(true)} disabled={user?.twoFactorEnabled} style={({ pressed }) => [styles.accountRow, { borderBottomColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="button"><Text style={[styles.accountRowText, { color: colors.text }]}>{user?.twoFactorEnabled ? 'MFA is enabled' : 'Set up MFA'}</Text></Pressable>
    <Pressable onPress={() => void authClient.signOut()} style={({ pressed }) => [styles.accountRow, { borderBottomColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel="Sign out"><Text style={styles.destructiveText}>Sign out</Text></Pressable>
    <Pressable onPress={() => { setError(null); setDeleteOpen(true); }} style={({ pressed }) => [styles.accountRow, { borderBottomColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel="Delete account"><Text style={styles.destructiveText}>Delete account</Text></Pressable>
    <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => { if (!deleting) setDeleteOpen(false); }}>
      <View style={styles.modalOverlay}><View style={[styles.modalCard, { backgroundColor: colors.background }]}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Delete your account?</Text>
        <Text style={[styles.modalCopy, { color: colors.mutedText }]}>This permanently deletes your identity, measurements, workouts, friend connections, cohort preferences, and local account cache. This cannot be undone.</Text>
        <><Text style={[styles.fieldPrompt, { color: colors.mutedText }]}>Type DELETE to confirm</Text><TextInput value={deletePhrase} onChangeText={setDeletePhrase} autoCapitalize="characters" autoCorrect={false} editable={!deleting} style={[styles.deleteInput, { color: colors.text, borderColor: colors.surfaceStrong }]} accessibilityLabel="Type DELETE to confirm account deletion" /></>
        <TextInput value={deletionPassword} onChangeText={setDeletionPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Password" placeholderTextColor={colors.subtleText} editable={!deleting} style={[styles.deleteInput, { color: colors.text, borderColor: colors.surfaceStrong }]} accessibilityLabel="Confirm password to delete account" />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable onPress={() => void deleteAccount()} disabled={deleting || deletePhrase !== 'DELETE' || !deletionPassword} style={({ pressed }) => [styles.deleteButton, (deleting || deletePhrase !== 'DELETE' || !deletionPassword) && styles.disabled, pressed && ui.pressed]} accessibilityRole="button"><Text style={styles.deleteButtonText}>{deleting ? 'Deleting…' : 'Permanently delete account'}</Text></Pressable>
        <Pressable onPress={() => setDeleteOpen(false)} disabled={deleting} style={styles.cancelButton} accessibilityRole="button"><Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text></Pressable>
      </View></View>
    </Modal>
    <Modal visible={mfaOpen} animationType="slide" onRequestClose={() => setMfaOpen(false)}><MfaSetupFlow onDone={() => setMfaOpen(false)} /></Modal>
  </>;
}

function favoriteChoices(query: string, selectedIds: readonly string[]) {
  const selected = new Set(selectedIds);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return exerciseCatalog.filter((exercise) => selected.has(exercise.id) || (!terms.length ? exercise.isFeatured : terms.every((term) => `${exercise.name} ${exercise.area} ${exercise.equipment}`.toLowerCase().includes(term))))
    .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || b.isFeatured - a.isFeatured || a.name.localeCompare(b.name)).slice(0, 12);
}

function LegalSettings() {
  const { colors } = useAppearance();
  const [error, setError] = useState<string | null>(null);
  const openPage = async (name: 'privacy' | 'terms' | 'support' | 'delete-account') => {
    const url = accountPageUrl(name);
    if (!url) { setError('Cloud sync is not configured.'); return; }
    await Linking.openURL(url).catch(() => setError('Could not open that link.'));
  };
  return <>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>RESOURCES</Text>
    {([['Privacy policy', 'privacy'], ['Terms of use', 'terms'], ['Support contact', 'support'], ['Web data-deletion request', 'delete-account']] as const).map(([label, page]) => <Pressable key={page} onPress={() => void openPage(page)} style={({ pressed }) => [styles.accountRow, { borderBottomColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="link"><Text style={[styles.accountRowText, { color: colors.text }]}>{label}</Text></Pressable>)}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Text style={[styles.disclaimer, { color: colors.mutedText }]}>Lift provides general fitness information—not medical advice, diagnosis, or treatment. Consult a qualified professional and stop if you experience pain or concerning symptoms.</Text>
  </>;
}

function AppearanceSettings() {
  const { mode, accent, colors, setMode, setAccent } = useAppearance();
  return <>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>BACKGROUND</Text>
    <View style={styles.modeRow}>{([{ id: 'light', label: 'Light', Icon: Sun }, { id: 'dark', label: 'Dark', Icon: Moon }] as const).map(({ id, label, Icon }) => <ModeOption key={id} mode={id} label={label} Icon={Icon} selected={mode === id} onPress={setMode} />)}</View>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>PRIMARY COLOR</Text>
    <View style={styles.swatches}>{accentOptions.map((option) => <Pressable key={option.id} onPress={() => setAccent(option.id)} style={({ pressed }) => [styles.swatchButton, pressed && ui.pressed]} accessibilityRole="radio" accessibilityState={{ selected: accent === option.id }} accessibilityLabel={`Use ${option.name} primary color`}><View style={[styles.swatch, { backgroundColor: option.value }, accent === option.id && { borderColor: colors.text }]}>{accent === option.id && <Check width={20} height={20} color="#17180F" strokeWidth={3.2} />}</View><Text style={[styles.swatchLabel, { color: colors.mutedText }]}>{option.name}</Text></Pressable>)}</View>
  </>;
}

function WorkoutSettings() {
  const { colors, showWorkoutRecommendations, restTimerEnabled, useRecommendedRestTimer, restTimerSeconds, setShowWorkoutRecommendations, setRestTimerEnabled, setUseRecommendedRestTimer, setRestTimerSeconds } = useAppearance();
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <>
    <CustomSplitSettings />
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

const muscleChoices = [
  'chest', 'shoulders', 'triceps', 'lats', 'middle back', 'lower back', 'traps', 'biceps', 'forearms',
  'quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors', 'abdominals', 'neck',
];

function CustomSplitSettings() {
  const { colors } = useAppearance();
  const [splits, setSplits] = useState(getCustomSplits);
  const [editing, setEditing] = useState<CustomSplit | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [muscles, setMuscles] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState<CustomSplit | null>(null);
  const open = (split?: CustomSplit) => {
    setEditing(split ?? null);
    setName(split?.name ?? '');
    setMuscles(split?.muscles ?? []);
    setError('');
    setFormOpen(true);
  };
  const save = () => {
    if (!name.trim()) return setError('Enter a name for this split.');
    if (!muscles.length) return setError('Choose at least one muscle group.');
    try {
      saveCustomSplit({ id: editing?.id, name: name.trim(), muscles });
      setSplits(getCustomSplits());
      setFormOpen(false);
      void syncWorkoutData().catch(() => undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this split.'); }
  };
  return <>
    <Text style={[styles.sectionLabel, { color: colors.mutedText }]}>YOUR SPLITS</Text>
    <Text style={[styles.preferenceDescription, { color: colors.mutedText, maxWidth: 320 }]}>Build days around the muscles you want to train. After you complete one, Lift rotates through your custom days. Start Push, Pull, or Legs to return to the default rotation.</Text>
    {splits.map((split) => <View key={split.id} style={[styles.customSplitRow, { borderBottomColor: colors.surfaceStrong }]}><Pressable onPress={() => open(split)} style={styles.customSplitCopy} accessibilityRole="button" accessibilityLabel={`Edit ${split.name} split`}><Text style={[styles.preferenceTitle, { color: colors.text }]}>{split.name}</Text><Text numberOfLines={1} style={[styles.preferenceDescription, { color: colors.mutedText }]}>{split.muscles.join(' · ')}</Text></Pressable><Pressable onPress={() => setDeleteCandidate(split)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Delete ${split.name} split`}><Text style={styles.destructiveText}>Delete</Text></Pressable></View>)}
    <Pressable onPress={() => open()} style={[styles.addSplitButton, { backgroundColor: colors.surface }]} accessibilityRole="button" accessibilityLabel="Create custom split"><Plus width={19} height={19} color={colors.text} strokeWidth={2.5} /><Text style={[styles.preferenceTitle, { color: colors.text }]}>Create custom split</Text></Pressable>
    <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}><View style={styles.modalOverlay}><View style={[styles.modalCard, styles.customSplitModal, { backgroundColor: colors.background }]}><Text style={[styles.modalTitle, { color: colors.text }]}>{editing ? 'Edit split' : 'Create split'}</Text><Text style={[styles.fieldPrompt, { color: colors.mutedText }]}>Name</Text><TextInput value={name} onChangeText={setName} maxLength={40} placeholder="Upper body" placeholderTextColor={colors.subtleText} style={[styles.customSplitInput, { color: colors.text, borderColor: colors.surfaceStrong }]} accessibilityLabel="Split name" /><Text style={[styles.fieldPrompt, { color: colors.mutedText }]}>Muscles to train</Text><ScrollView style={styles.muscleScroll} contentContainerStyle={styles.muscleChoices}>{muscleChoices.map((muscle) => { const selected = muscles.includes(muscle); return <Pressable key={muscle} onPress={() => { if (!selected && muscles.length >= 12) return setError('Choose up to 12 muscle groups.'); setError(''); setMuscles(selected ? muscles.filter((item) => item !== muscle) : [...muscles, muscle]); }} style={[styles.muscleChoice, { backgroundColor: selected ? colors.accent : colors.surface }]} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={muscle}><Text style={[styles.muscleChoiceText, { color: selected ? colors.accentText : colors.text }]}>{muscle}</Text></Pressable>; })}</ScrollView>{!!error && <Text style={styles.error}>{error}</Text>}<Pressable onPress={save} style={[styles.customSplitSave, { backgroundColor: colors.accent }]} accessibilityRole="button" accessibilityLabel="Save split"><Text style={[styles.preferenceTitle, { color: colors.accentText }]}>Save split</Text></Pressable><Pressable onPress={() => setFormOpen(false)} style={styles.cancelButton} accessibilityRole="button" accessibilityLabel="Cancel"><Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text></Pressable></View></View></Modal>
    <Modal visible={!!deleteCandidate} transparent animationType="fade" onRequestClose={() => setDeleteCandidate(null)}><View style={styles.modalOverlay}><View style={[styles.modalCard, { backgroundColor: colors.background }]}><Text style={[styles.modalTitle, { color: colors.text }]}>Delete {deleteCandidate?.name}?</Text><Text style={[styles.modalCopy, { color: colors.mutedText }]}>{getActiveWorkout()?.split === deleteCandidate?.id ? 'Finish your active workout before deleting this split.' : 'Past workouts will stay in your history.'}</Text><Pressable disabled={getActiveWorkout()?.split === deleteCandidate?.id} onPress={() => { if (!deleteCandidate) return; deleteCustomSplit(deleteCandidate.id); setSplits(getCustomSplits()); setDeleteCandidate(null); void syncWorkoutData().catch(() => undefined); }} style={[styles.deleteButton, getActiveWorkout()?.split === deleteCandidate?.id && styles.disabled]} accessibilityRole="button" accessibilityLabel="Delete split"><Text style={styles.deleteButtonText}>Delete split</Text></Pressable><Pressable onPress={() => setDeleteCandidate(null)} style={styles.cancelButton} accessibilityRole="button" accessibilityLabel="Cancel"><Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text></Pressable></View></View></Modal>
  </>;
}

function ModeOption({ mode, label, Icon, selected, onPress }: { mode: AppearanceMode; label: string; Icon: typeof Sun; selected: boolean; onPress: (mode: AppearanceMode) => void }) {
  const { colors } = useAppearance();
  return <Pressable onPress={() => onPress(mode)} style={({ pressed }) => [styles.modeOption, { borderBottomColor: colors.surfaceStrong }, pressed && ui.pressed]} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`Use ${label.toLowerCase()} background`}><Icon width={21} height={21} color={colors.text} strokeWidth={2.3} /><Text style={[styles.modeText, { color: colors.text }]}>{label}</Text>{selected && <Check width={20} height={20} color={colors.accent} strokeWidth={3} />}</Pressable>;
}

const styles = StyleSheet.create({
  header: { height: 72, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 13 }, backButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40 }, copy: { maxWidth: 280, fontSize: 14, lineHeight: 20, fontWeight: '700' }, sectionLabel: { marginTop: 38, marginBottom: 2, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, nameInput: { flex: 1, height: 64, paddingHorizontal: 0, fontSize: 16, fontWeight: '800' }, nameRow: { borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10 }, saveButton: { height: 54, paddingLeft: 18, alignItems: 'center', justifyContent: 'center' }, saveText: { fontSize: 15, fontWeight: '900' }, favoriteSearch: { height: 52, marginTop: 12, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 16, fontWeight: '800' }, favoriteCount: { marginTop: 10, fontSize: 12, fontWeight: '800' }, favoriteChoice: { minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, favoriteChoiceText: { flex: 1 }, favoriteChoiceName: { fontSize: 15, fontWeight: '900' }, favoriteChoiceDetail: { marginTop: 3, fontSize: 12, fontWeight: '700' }, favoriteMark: { minWidth: 22, textAlign: 'center', fontSize: 20, fontWeight: '900' }, favoritesSave: { minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end', justifyContent: 'center' }, measurementInputs: { marginTop: 14, flexDirection: 'row', gap: 8 }, measurementInputWrap: { height: 52, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, flex: 1, flexDirection: 'row', alignItems: 'center' }, measurementInput: { minWidth: 0, flex: 1, padding: 0, fontSize: 16, fontWeight: '800' }, measurementUnit: { fontSize: 12, fontWeight: '800' }, error: { marginTop: 8, color: '#FF5151', fontSize: 12, fontWeight: '700' }, disabled: { opacity: .5 }, modeRow: {}, modeOption: { minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 13 }, modeText: { flex: 1, fontSize: 16, fontWeight: '900', letterSpacing: -.35 }, swatches: { marginTop: 10, flexDirection: 'row', gap: 18 }, swatchButton: { alignItems: 'center', gap: 8 }, swatch: { width: 58, height: 58, borderRadius: 29, borderWidth: 3, alignItems: 'center', justifyContent: 'center' }, swatchLabel: { fontSize: 11, fontWeight: '900' }, preferenceRow: { minHeight: 96, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, preferenceCopy: { flex: 1 }, preferenceSwitch: { transform: [{ translateY: 10 }] }, preferenceTitle: { fontSize: 15, fontWeight: '900', letterSpacing: -.35 }, preferenceDescription: { marginTop: 4, maxWidth: 240, fontSize: 12, lineHeight: 16, fontWeight: '700' }, durationRow: { minHeight: 82, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, durationControl: { height: 44, minWidth: 128, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, durationText: { minWidth: 48, textAlign: 'center', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] }, accountRow: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center' }, accountRowText: { fontSize: 15, fontWeight: '900' }, destructiveText: { color: '#E23D3D', fontSize: 15, fontWeight: '900' }, dataNote: { marginTop: 14, fontSize: 12, lineHeight: 18, fontWeight: '700' }, disclaimer: { marginTop: 18, fontSize: 12, lineHeight: 18, fontWeight: '700' }, modalOverlay: { flex: 1, padding: 24, backgroundColor: 'rgba(0,0,0,.45)', alignItems: 'center', justifyContent: 'center' }, modalCard: { width: '100%', maxWidth: 440, borderRadius: 24, padding: 24 }, modalTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -.8 }, modalCopy: { marginTop: 10, fontSize: 14, lineHeight: 21, fontWeight: '700' }, fieldPrompt: { marginTop: 22, marginBottom: 7, fontSize: 12, fontWeight: '900' }, deleteInput: { minHeight: 52, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 15, fontSize: 17, fontWeight: '900', letterSpacing: 1 }, deleteButton: { minHeight: 54, marginTop: 20, borderRadius: 15, backgroundColor: '#D92D20', alignItems: 'center', justifyContent: 'center' }, deleteButtonText: { color: '#FFF', fontSize: 15, fontWeight: '900' }, cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' }, cancelText: { fontSize: 15, fontWeight: '900' },
  customSplitRow: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  customSplitCopy: { flex: 1, paddingVertical: 10 },
  addSplitButton: { minHeight: 56, marginTop: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  customSplitModal: { maxHeight: '90%' },
  customSplitInput: { height: 52, paddingHorizontal: 14, borderWidth: 1, borderRadius: 13, fontSize: 16, fontWeight: '800' },
  muscleScroll: { flexGrow: 0, maxHeight: 280 },
  muscleChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  muscleChoice: { minHeight: 40, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  muscleChoiceText: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  customSplitSave: { height: 54, marginTop: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
