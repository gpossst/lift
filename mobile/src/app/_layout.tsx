import * as SplashScreen from 'expo-splash-screen';
import { router, Tabs, useIsFocused, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, LogBox, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider, useAppearance } from '@/components/appearance-provider';
import { AuthFlow, PasswordResetFlow, VerificationPrompt } from '@/components/auth-flow';
import { BottomNavigation } from '@/components/bottom-navigation';
import { FlexAnimation } from '@/components/flex-animation';
import { dismissFirstWorkoutPreview, FirstWorkoutPreview, hasDismissedFirstWorkoutPreview } from '@/components/first-workout-preview';
import { OnboardingFlow } from '@/components/onboarding';
import { createWorkout, getCustomSplits, getRecommendedWorkoutSplit, getRejectedCloudSyncChanges, getWorkoutSplitDefinition, prepareCloudSyncForUser, saveCustomSplit } from '@/db';
import { setCloudSyncUser, syncWorkoutData } from '@/lib/cloud-sync';
import { clearPendingOnboarding, submitOnboarding, takePendingOnboarding } from '@/lib/onboarding';
import { authClient } from '@/lib/auth-client';
import { getProfile, updateProfile } from '@/lib/profile';
import { splitPresets } from '@/lib/split-routines';
import { syncRestLiveActivity } from '@/lib/rest-live-activity';

SplashScreen.preventAutoHideAsync();
// Rest state lives only in the workout screen, so a cold launch means any rest timer from a killed process is orphaned.
syncRestLiveActivity(null);

// react-native-graph trips Reanimated's inline-style heuristic internally.
LogBox.ignoreLogs(["shared value's .value inside reanimated inline style"]);

export default function RootLayout() {
  const [boundUserId, setBoundUserId] = useState<string | null>(null);
  const hideNativeSplash = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <View style={styles.root} onLayout={hideNativeSplash}>
          <CloudSyncLifecycle onReady={setBoundUserId} />
          <AppNavigator boundUserId={boundUserId} />
        </View>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}

/** Reconcile on authenticated launch and each foreground transition. AppState
 * subscriptions are removed with the signed-in app tree, so a signed-out user
 * never sends an old account's cache. */
function CloudSyncLifecycle({ onReady }: { onReady: (userId: string | null) => void }) {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id;
  const { setUseCustomSplits } = useAppearance();
  const applySplitPlan = useRef(setUseCustomSplits);
  useEffect(() => { applySplitPlan.current = setUseCustomSplits; }, [setUseCustomSplits]);
  useEffect(() => {
    onReady(null);
    setCloudSyncUser(null);
    if (isPending || !userId) {
      return;
    }
    let active = true;
    let subscription: { remove(): void } | undefined;
    let lastNotice = '';
    const synchronize = () => {
      // The split plan is account-wide; null means this account never chose one, so keep the local value.
      void getProfile().then((profile) => {
        const synced = profile.recommendationPreferences?.useCustomSplits;
        if (active && typeof synced === 'boolean') applySplitPlan.current(synced);
      }).catch(() => undefined);
      void syncWorkoutData().then(() => {
        if (!active) return;
        const issues = getRejectedCloudSyncChanges();
        const notice = JSON.stringify(issues.map(({ entity, key, reason }) => [entity, key, reason]));
        if (!issues.length) { lastNotice = ''; return; }
        if (notice === lastNotice) return;
        lastNotice = notice;
        Alert.alert('Some changes need attention', 'Some changes could not sync and are kept on this device. Review them in Settings.', [
          { text: 'Later', style: 'cancel' },
          { text: 'Review', onPress: () => router.navigate('/settings') },
        ]);
      }).catch(() => undefined);
    };
    // The previous account's unsynced cache never uploads as this user unless they explicitly discard it.
    const start = (discardPreviousAccount = false) => {
      if (!active) return;
      if (!prepareCloudSyncForUser(userId, discardPreviousAccount)) {
        const message = 'This device has workout changes from a previous account that have not synced. Sign out to keep them, or discard them permanently and continue with this account.';
        const signOut = () => { if (active) void authClient.signOut(); };
        if (Platform.OS === 'web') {
          if (window.confirm(`${message}\n\nPress OK to discard them permanently, or Cancel to sign out and keep them.`)) start(true); else signOut();
        } else Alert.alert('Unsynced changes from another account', message, [
          { text: 'Sign Out', style: 'cancel', onPress: signOut },
          { text: 'Discard Changes', style: 'destructive', onPress: () => start(true) },
        ], { cancelable: false });
        return;
      }
      setCloudSyncUser(userId);
      onReady(userId);
      synchronize();
      subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') synchronize();
      });
    };
    start();
    return () => {
      active = false;
      subscription?.remove();
      setCloudSyncUser(null);
    };
  }, [isPending, onReady, userId]);
  return null;
}

function AppNavigator({ boundUserId }: { boundUserId: string | null }) {
  const { mode } = useAppearance();
  const pathname = usePathname();
  const { data: session, isPending, refetch } = authClient.useSession();
  const isLoaded = !isPending;
  const isSignedIn = Boolean(session?.user);
  const [authMode, setAuthMode] = useState<'onboarding' | 'signIn' | 'signUp'>('onboarding');
  const wasSignedIn = useRef(false);

  useEffect(() => {
    if (pathname === '/auth/verified') void refetch().finally(() => router.replace('/'));
  }, [pathname, refetch]);

  // Returning to the signed-out flow (sign out or account deletion) starts at
  // the first onboarding page, not whatever auth screen was last open.
  useEffect(() => {
    if (isSignedIn) { wasSignedIn.current = true; return; }
    if (wasSignedIn.current) { wasSignedIn.current = false; setAuthMode('onboarding'); }
  }, [isSignedIn]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {!isLoaded || (isSignedIn && boundUserId !== session?.user.id) ? <LoadingScreen />
        : pathname === '/reset-password' ? <PasswordResetFlow />
        : pathname === '/auth/verified' ? <VerifiedEmailScreen />
        : isSignedIn ? <SignedInApp key={session!.user.id} userId={session!.user.id} email={session!.user.email} emailVerified={session!.user.emailVerified} />
            : authMode === 'onboarding' ? <OnboardingFlow onSignIn={() => setAuthMode('signIn')} onSignUp={() => setAuthMode('signUp')} />
              : <AuthFlow key={authMode} mode={authMode} onBack={() => setAuthMode('onboarding')} onModeChange={(next) => setAuthMode(next === 'signUp' ? 'onboarding' : 'signIn')} />}
    </GestureHandlerRootView>
  );
}

function AppStack() {
  const { colors } = useAppearance();
  // Keep tab visibility independent of interrupted animations around nested stacks.
  return <Tabs tabBar={(props) => <BottomNavigation {...props} />} screenLayout={({ route, children }) => TAB_ROUTES.has(route.name) ? <TabFadeIn>{children}</TabFadeIn> : children} screenOptions={{
    headerShown: false,
    animation: 'none',
    sceneStyle: { backgroundColor: colors.background },
  }}>
    <Tabs.Screen name="(home)" />
    <Tabs.Screen name="stats" />
    <Tabs.Screen name="start" options={{ href: null }} />
    <Tabs.Screen name="friends" />
    <Tabs.Screen name="settings" />
    <Tabs.Screen name="exercises" options={{ href: null }} />
    <Tabs.Screen name="workout" options={{ href: null }} />
    <Tabs.Screen name="summary" options={{ href: null }} />
    <Tabs.Screen name="explore" options={{ href: null }} />
    <Tabs.Screen name="reset-password" options={{ href: null }} />
    <Tabs.Screen name="auth/verified" options={{ href: null }} />
    <Tabs.Screen name="return-plan" options={{ href: null }} />
  </Tabs>;
}

const TAB_ROUTES = new Set(['(home)', 'stats', 'friends', 'settings']);

/** Animates content, not the scene, so an interrupted transition still settles fully visible. */
function TabFadeIn({ children }: { children: React.ReactNode }) {
  const focused = useIsFocused();
  const progress = useSharedValue(1);
  useEffect(() => {
    if (!focused) return;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [focused, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: 0.25 + progress.value * 0.75,
    transform: [{ translateY: (1 - progress.value) * 16 }],
  }));
  return <Animated.View style={[styles.root, style]}>{children}</Animated.View>;
}

function VerifiedEmailScreen() {
  return <LoadingScreen />;
}

function LoadingScreen() {
  const { colors } = useAppearance();
  return <View style={[styles.loading, { backgroundColor: colors.background }]}><FlexAnimation style={styles.loadingAnimation} /></View>;
}

function SignedInApp({ userId, email, emailVerified }: { userId: string; email: string; emailVerified: boolean }) {
  const { colors, useCustomSplits, setUseCustomSplits } = useAppearance();
  const applySplitPlan = useRef(setUseCustomSplits);
  useEffect(() => { applySplitPlan.current = setUseCustomSplits; }, [setUseCustomSplits]);
  const [verificationDismissed, setVerificationDismissed] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [pendingOnboarding, setPendingOnboarding] = useState<Awaited<ReturnType<typeof takePendingOnboarding>>>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([takePendingOnboarding(userId), hasDismissedFirstWorkoutPreview(userId)]).then(([onboarding, dismissed]) => {
      if (!active) return;
      // The rotation picked in onboarding becomes this account's custom splits, once, before the first-workout preview.
      const preset = onboarding && !dismissed && !getCustomSplits().length ? splitPresets.find(({ id }) => id === onboarding.splitPreset) : undefined;
      if (preset?.splits.length) {
        for (const split of preset.splits) saveCustomSplit({ name: split.name, muscles: [...split.muscles] });
        applySplitPlan.current(true);
        void updateProfile({ recommendationPreferences: { useCustomSplits: true } }).catch(() => undefined);
        void syncWorkoutData().catch(() => undefined);
      }
      setPendingOnboarding(onboarding && !dismissed ? onboarding : null);
      setCheckingOnboarding(false);
      if (onboarding) void submitOnboarding(onboarding).then(() => clearPendingOnboarding(userId)).catch(() => undefined);
    }).catch(() => { if (active) setCheckingOnboarding(false); });
    return () => { active = false; };
  }, [userId]);

  const continueToWorkout = async () => {
    await dismissFirstWorkoutPreview(userId);
    setPendingOnboarding(null);
    const split = getRecommendedWorkoutSplit(new Date(), useCustomSplits);
    const workout = createWorkout(split);
    router.replace({ pathname: '/exercises', params: { split, workoutId: workout.id } });
  };
  const skipWorkout = async () => {
    await dismissFirstWorkoutPreview(userId);
    setPendingOnboarding(null);
    router.replace('/return-plan?reason=skipped');
  };

  if (!emailVerified && !verificationDismissed) return <VerificationPrompt email={email} onContinue={() => setVerificationDismissed(true)} />;
  if (checkingOnboarding) return <LoadingScreen />;
  const firstSplit = pendingOnboarding ? getRecommendedWorkoutSplit(new Date(), useCustomSplits) : null;
  const firstSplitName = firstSplit ? getWorkoutSplitDefinition(firstSplit)?.name ?? 'First workout' : '';
  return <View style={[styles.navigator, { backgroundColor: colors.background }]}>
    <AppStack />
    {pendingOnboarding && firstSplit && <View style={StyleSheet.absoluteFill}>
      <FirstWorkoutPreview onboarding={pendingOnboarding} splitName={firstSplitName} onStart={continueToWorkout} onSkip={skipWorkout} />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navigator: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingAnimation: { width: '100%', aspectRatio: 16 / 9 },
});
