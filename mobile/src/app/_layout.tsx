import * as SplashScreen from 'expo-splash-screen';
import { router, Tabs, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import LottieView from 'lottie-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, LogBox, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppearanceProvider, useAppearance } from '@/components/appearance-provider';
import { AuthFlow, PasswordResetFlow } from '@/components/auth-flow';
import { BottomNavigation } from '@/components/bottom-navigation';
import { OnboardingFlow } from '@/components/onboarding';
import { prepareCloudSyncForUser } from '@/db';
import { setCloudSyncUser, syncWorkoutData } from '@/lib/cloud-sync';
import { clearPendingOnboarding, submitOnboarding, takePendingOnboarding } from '@/lib/onboarding';
import { authClient } from '@/lib/auth-client';

SplashScreen.preventAutoHideAsync();

// Third-party noise: react-native-graph still calls the deprecated SkPath
// API and trips Reanimated's inline-style heuristic internally.
LogBox.ignoreLogs(['[react-native-skia]', "shared value's .value inside reanimated inline style"]);

export default function RootLayout() {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const hideNativeSplash = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <View style={styles.root} onLayout={hideNativeSplash}>
          <CloudSyncLifecycle />
          <AppNavigator />
          {isSplashVisible && <AnimatedSplash onFinish={() => setIsSplashVisible(false)} />}
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
    setCloudSyncUser(userId);
    prepareCloudSyncForUser(userId);
    const synchronize = () => { void syncWorkoutData().catch(() => undefined); };
    synchronize();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') synchronize();
    });
    return () => {
      subscription.remove();
      setCloudSyncUser(null);
    };
  }, [isPending, userId]);
  return null;
}

function AppNavigator() {
  const { mode } = useAppearance();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const isLoaded = !isPending;
  const isSignedIn = Boolean(session?.user);
  const [authMode, setAuthMode] = useState<'onboarding' | 'signIn' | 'signUp'>('onboarding');

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {!isLoaded ? <LoadingScreen />
        : pathname === '/reset-password' ? <PasswordResetFlow />
        : pathname === '/auth/verified' ? <VerifiedEmailScreen />
        : isSignedIn ? <><OnboardingSync /><AppStack /></>
            : authMode === 'onboarding' ? <OnboardingFlow onSignIn={() => setAuthMode('signIn')} onSignUp={() => setAuthMode('signUp')} />
              : <AuthFlow key={authMode} mode={authMode} onBack={() => setAuthMode('onboarding')} onModeChange={setAuthMode} />}
    </GestureHandlerRootView>
  );
}

function AppStack() {
  return <Tabs tabBar={(props) => <BottomNavigation {...props} />} screenOptions={{ headerShown: false, animation: 'none' }}>
    <Tabs.Screen name="index" />
    <Tabs.Screen name="history" />
    <Tabs.Screen name="friends" />
    <Tabs.Screen name="settings" />
    <Tabs.Screen name="settings/[group]" options={{ href: null }} />
    <Tabs.Screen name="start" options={{ href: null }} />
    <Tabs.Screen name="exercises" options={{ href: null }} />
    <Tabs.Screen name="workout" options={{ href: null }} />
    <Tabs.Screen name="summary" options={{ href: null }} />
    <Tabs.Screen name="history-detail" options={{ href: null }} />
    <Tabs.Screen name="stats" options={{ href: null }} />
    <Tabs.Screen name="explore" options={{ href: null }} />
    <Tabs.Screen name="reset-password" options={{ href: null }} />
    <Tabs.Screen name="auth/verified" options={{ href: null }} />
  </Tabs>;
}

function VerifiedEmailScreen() {
  useEffect(() => { router.replace('/'); }, []);
  return <LoadingScreen />;
}

function LoadingScreen() {
  return <View style={styles.loading}><ActivityIndicator size="large" color="#17180F" /></View>;
}

function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  return (
    <View style={styles.splash} accessibilityLabel="Loading Lift" accessibilityRole="progressbar">
      <LottieView
        autoPlay
        loop={false}
        resizeMode="contain"
        source={require('../../assets/flex.json')}
        style={styles.splashAnimation}
        onAnimationFinish={onFinish}
      />
    </View>
  );
}

function OnboardingSync() {
  useEffect(() => { void takePendingOnboarding().then(async (onboarding) => { if (onboarding) { await submitOnboarding(onboarding); await clearPendingOnboarding(); } }).catch(() => undefined); }, []);
  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9F9F7' },
  splash: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: '#208AEF', zIndex: 10 },
  splashAnimation: { width: '100%', aspectRatio: 16 / 9 },
});
