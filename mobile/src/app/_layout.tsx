import * as SplashScreen from 'expo-splash-screen';
import { router, Tabs, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, LogBox, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider, useAppearance } from '@/components/appearance-provider';
import { AuthFlow, PasswordResetFlow, VerificationPrompt } from '@/components/auth-flow';
import { BottomNavigation } from '@/components/bottom-navigation';
import { FlexAnimation } from '@/components/flex-animation';
import { dismissFirstWorkoutPreview, FirstWorkoutPreview, hasDismissedFirstWorkoutPreview } from '@/components/first-workout-preview';
import { OnboardingFlow } from '@/components/onboarding';
import { createWorkout, getRecommendedWorkoutSplit, getRejectedCloudSyncChanges, getWorkoutSplitDefinition, prepareCloudSyncForUser } from '@/db';
import { setCloudSyncUser, syncWorkoutData } from '@/lib/cloud-sync';
import { clearPendingOnboarding, submitOnboarding, takePendingOnboarding } from '@/lib/onboarding';
import { authClient } from '@/lib/auth-client';

SplashScreen.preventAutoHideAsync();

// react-native-graph trips Reanimated's inline-style heuristic internally.
LogBox.ignoreLogs(["shared value's .value inside reanimated inline style"]);

export default function RootLayout() {
  const hideNativeSplash = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <View style={styles.root} onLayout={hideNativeSplash}>
          <CloudSyncLifecycle />
          <AppNavigator />
        </View>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}

/** Reconcile on authenticated launch and each foreground transition. AppState
 * subscriptions are removed with the signed-in app tree, so a signed-out user
 * never sends an old account's cache. */
function CloudSyncLifecycle() {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id;
  useEffect(() => {
    if (isPending || !userId) {
      setCloudSyncUser(null);
      return;
    }
    if (!prepareCloudSyncForUser(userId)) {
      setCloudSyncUser(null);
      void authClient.signOut().finally(() => Alert.alert('Finish syncing first', 'This device has workout changes that have not synced yet. Reconnect and sign in to the previous account before switching accounts.'));
      return;
    }
    setCloudSyncUser(userId);
    let active = true;
    let lastNotice = '';
    const synchronize = () => {
      void syncWorkoutData().then(() => {
        if (!active) return;
        const issues = getRejectedCloudSyncChanges();
        const notice = JSON.stringify(issues.map(({ entity, key, reason }) => [entity, key, reason]));
        if (!issues.length) { lastNotice = ''; return; }
        if (notice === lastNotice) return;
        lastNotice = notice;
        Alert.alert('Some changes need attention', 'Some changes could not sync and are kept on this device. Review them in Settings.', [
          { text: 'Later', style: 'cancel' },
          { text: 'Review', onPress: () => router.push('/settings') },
        ]);
      }).catch(() => undefined);
    };
    synchronize();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') synchronize();
    });
    return () => {
      active = false;
      subscription.remove();
      setCloudSyncUser(null);
    };
  }, [isPending, userId]);
  return null;
}

function AppNavigator() {
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
      {!isLoaded ? <LoadingScreen />
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
  return <Tabs tabBar={(props) => <BottomNavigation {...props} />} screenOptions={{
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

function VerifiedEmailScreen() {
  return <LoadingScreen />;
}

function LoadingScreen() {
  const { colors } = useAppearance();
  return <View style={[styles.loading, { backgroundColor: colors.background }]}><FlexAnimation style={styles.loadingAnimation} /></View>;
}

function SignedInApp({ userId, email, emailVerified }: { userId: string; email: string; emailVerified: boolean }) {
  const { colors, useCustomSplits } = useAppearance();
  const [verificationDismissed, setVerificationDismissed] = useState(false);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [pendingOnboarding, setPendingOnboarding] = useState<Awaited<ReturnType<typeof takePendingOnboarding>>>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([takePendingOnboarding(), hasDismissedFirstWorkoutPreview(userId)]).then(([onboarding, dismissed]) => {
      if (!active) return;
      setPendingOnboarding(onboarding && !dismissed ? onboarding : null);
      setCheckingOnboarding(false);
      if (onboarding) void submitOnboarding(onboarding).then(clearPendingOnboarding).catch(() => undefined);
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
