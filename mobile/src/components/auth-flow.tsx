import { useMemo, useState, type ReactNode } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { Wordmark } from '@/components/wordmark';
import { authClient } from '@/lib/auth-client';
import type { AppearanceColors } from '@/lib/appearance';

type AuthMode = 'signIn' | 'signUp';
type AuthStep = 'credentials' | 'verifyEmail' | 'recoveryEmail' | 'mfa';
type MfaMethod = 'totp' | 'otp' | 'backup';
type Styles = ReturnType<typeof createStyles>;

export function AuthFlow({ mode, onBack, onModeChange }: { mode: AuthMode; onBack: () => void; onModeChange: (mode: AuthMode) => void }) {
  const { colors } = useAppearance();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep] = useState<AuthStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [methods, setMethods] = useState<string[]>([]);
  const [method, setMethod] = useState<MfaMethod>('totp');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); } catch (reason) { setError(messageFrom(reason)); }
    finally { setBusy(false); }
  };

  const submitCredentials = () => run(async () => {
    if (!email.trim() || !password) throw new Error('Enter your email and password.');
    if (password.length < 12) throw new Error('Use at least 12 characters for your password.');
    if (mode === 'signUp') {
      const result = await authClient.signUp.email({ email: email.trim(), password, name: email.trim().split('@')[0] ?? 'Lift user', callbackURL: ExpoLinking.createURL('/auth/verified') });
      if (result.error) throw result.error;
      setStep('verifyEmail');
      return;
    }
    const result = await authClient.signIn.email({ email: email.trim(), password });
    if (result.error) throw result.error;
    const data = result.data as (Record<string, unknown> & { twoFactorRedirect?: boolean; twoFactorMethods?: string[] }) | null;
    if (data?.twoFactorRedirect) {
      const available = data.twoFactorMethods ?? [];
      setMethods(available);
      const initial: MfaMethod = available.includes('totp') ? 'totp' : available.includes('otp') ? 'otp' : 'backup';
      setMethod(initial);
      if (initial === 'otp') {
        const sent = await authClient.twoFactor.sendOtp();
        if (sent.error) throw sent.error;
      }
      setStep('mfa');
    }
  });

  const resendVerification = () => run(async () => {
    const result = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: ExpoLinking.createURL('/auth/verified') });
    if (result.error) throw result.error;
  });

  const requestReset = () => run(async () => {
    if (!email.trim()) throw new Error('Enter the email on your account.');
    const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: ExpoLinking.createURL('/reset-password') });
    if (result.error) throw result.error;
    setError('If the account exists, a password reset link is on its way.');
  });

  const verifyMfa = () => run(async () => {
    const result = method === 'totp' ? await authClient.twoFactor.verifyTotp({ code })
      : method === 'otp' ? await authClient.twoFactor.verifyOtp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code });
    if (result.error) throw result.error;
  });

  const chooseMethod = async (next: MfaMethod) => {
    setMethod(next); setCode(''); setError(null);
    if (next === 'otp') await run(async () => {
      const result = await authClient.twoFactor.sendOtp();
      if (result.error) throw result.error;
    });
  };

  const goBack = () => {
    if (step === 'credentials') onBack();
    else { setStep('credentials'); setCode(''); setError(null); }
  };

  const title = step === 'verifyEmail' ? 'Check your email.' : step === 'recoveryEmail' ? 'Reset password.' : step === 'mfa' ? 'Verify.' : mode === 'signIn' ? 'Sign in.' : 'Create account.';
  const subtitle = step === 'verifyEmail' ? email : step === 'mfa' ? method === 'otp' ? 'Email code' : method === 'backup' ? 'Backup code' : 'Authenticator app' : undefined;

  return <AuthShell title={title} subtitle={subtitle} onBack={goBack} styles={styles}>
    {step === 'credentials' && <>
      <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" styles={styles} colors={colors} />
      <Field label="Password" value={password} onChangeText={setPassword} autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} secureTextEntry styles={styles} colors={colors} />
      {mode === 'signIn' && <Pressable accessibilityRole="button" onPress={() => { setError(null); setStep('recoveryEmail'); }} style={styles.textAction}><Text style={styles.textActionLabel}>Forgot password?</Text></Pressable>}
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label={busy ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Create account'} disabled={busy} onPress={submitCredentials} styles={styles} />
      <Pressable accessibilityRole="button" onPress={() => onModeChange(mode === 'signIn' ? 'signUp' : 'signIn')} style={styles.switchAction}><Text style={styles.switchTextStrong}>{mode === 'signIn' ? 'Create account' : 'Sign in'}</Text></Pressable>
    </>}
    {step === 'verifyEmail' && <>
      <Text style={styles.subtitle}>Open the verification link we sent to {email} to finish creating your account.</Text>
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label={busy ? 'Sending…' : 'Resend verification email'} disabled={busy} onPress={() => { void resendVerification(); }} styles={styles} />
    </>}
    {step === 'recoveryEmail' && <>
      <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" styles={styles} colors={colors} />
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label={busy ? 'Sending…' : 'Send reset link'} disabled={busy} onPress={() => { void requestReset(); }} styles={styles} />
    </>}
    {step === 'mfa' && <>
      <View style={styles.methodRow}>
        {(['totp', ...(methods.includes('otp') ? ['otp' as const] : []), 'backup'] as MfaMethod[]).map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: item === method }} onPress={() => { void chooseMethod(item); }} style={[styles.method, item === method && styles.methodActive]}><Text style={[styles.methodText, item === method && styles.methodTextActive]}>{item === 'totp' ? 'Authenticator' : item === 'otp' ? 'Email code' : 'Backup code'}</Text></Pressable>)}
      </View>
      <CodeForm code={code} setCode={setCode} error={error} busy={busy} label="Verify" onSubmit={verifyMfa} styles={styles} colors={colors} />
    </>}
  </AuthShell>;
}

export function VerificationPrompt({ email, onContinue }: { email: string; onContinue: () => void }) {
  const { colors } = useAppearance();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resend = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await authClient.sendVerificationEmail({ email, callbackURL: ExpoLinking.createURL('/auth/verified') });
      if (result.error) throw result.error;
      setMessage('Verification email sent.');
    } catch (reason) { setMessage(messageFrom(reason)); }
    finally { setBusy(false); }
  };

  return <AuthShell title="Check your email." styles={styles}>
    <Text style={styles.subtitle}>You’re signed in. Open the verification link we sent to {email} to verify your address.</Text>
    {message && <Text accessibilityRole="alert" style={styles.subtitle}>{message}</Text>}
    <ActionButton label={busy ? 'Sending…' : 'Resend verification email'} disabled={busy} onPress={() => { void resend(); }} styles={styles} />
    <Pressable accessibilityRole="button" onPress={onContinue} style={styles.switchAction}><Text style={styles.switchTextStrong}>Continue to Lift</Text></Pressable>
  </AuthShell>;
}

export function AccountTaskFlow({ onDone }: { onDone: () => void }) { return <MfaSetupFlow onDone={onDone} />; }

export function PasswordResetFlow() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { colors } = useAppearance();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!token) { setError('This reset link is invalid or expired. Request another one.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw result.error;
      router.replace('/');
    } catch (reason) { setError(messageFrom(reason)); }
    finally { setBusy(false); }
  };
  return <AuthShell title="New password." styles={styles}>
    <Field label="New password" value={password} onChangeText={setPassword} autoComplete="new-password" secureTextEntry styles={styles} colors={colors} />
    <ErrorMessage message={error} styles={styles} />
    <ActionButton label={busy ? 'Saving…' : 'Save password'} disabled={busy || password.length < 12} onPress={() => { void submit(); }} styles={styles} />
  </AuthShell>;
}

export function MfaSetupFlow({ onDone }: { onDone: () => void }) {
  const { colors } = useAppearance();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [password, setPassword] = useState('');
  const [method, setMethod] = useState<'totp' | 'otp'>('totp');
  const [code, setCode] = useState('');
  const [uri, setUri] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [stage, setStage] = useState<'password' | 'setup' | 'backup'>('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => run(async () => {
    const result = await authClient.twoFactor.enable({ password, method, issuer: 'Lift' });
    if (result.error) throw result.error;
    if (method === 'otp') {
      await finish();
      return;
    }
    const data = result.data as { totpURI?: string; backupCodes?: string[] };
    setUri(data.totpURI ?? '');
    setSecret(data.totpURI ? new URL(data.totpURI).searchParams.get('secret') ?? '' : '');
    setBackupCodes(data.backupCodes ?? []);
    setStage('setup');
  });

  const verify = () => run(async () => {
    const result = await authClient.twoFactor.verifyTotp({ code });
    if (result.error) throw result.error;
    if (!backupCodes.length) {
      const backup = await authClient.twoFactor.generateBackupCodes({ password });
      if (backup.error) throw backup.error;
      setBackupCodes(backup.data.backupCodes);
    }
    setStage('backup');
  });

  const finish = async () => {
    await authClient.getSession();
    onDone();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await action(); } catch (reason) { setError(messageFrom(reason)); }
    finally { setBusy(false); }
  };

  return <AuthShell title={stage === 'backup' ? 'Save backup codes.' : 'Set up MFA.'} subtitle={stage === 'setup' ? 'Use your authenticator app.' : undefined} styles={styles}>
    {stage === 'password' && <>
      <Text style={styles.subtitle}>Confirm your password to add an authenticator or email code.</Text>
      <Field label="Password" value={password} onChangeText={setPassword} autoComplete="current-password" secureTextEntry styles={styles} colors={colors} />
      <View style={styles.methodRow}>{(['totp', 'otp'] as const).map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: item === method }} onPress={() => setMethod(item)} style={[styles.method, item === method && styles.methodActive]}><Text style={[styles.methodText, item === method && styles.methodTextActive]}>{item === 'totp' ? 'Authenticator' : 'Email code'}</Text></Pressable>)}</View>
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label={busy ? 'Preparing…' : 'Continue'} disabled={busy || !password} onPress={() => { void start(); }} styles={styles} />
    </>}
    {stage === 'setup' && <>
      {!!uri && <ActionButton label="Open authenticator app" onPress={() => { void Linking.openURL(uri).catch((reason: unknown) => setError(messageFrom(reason))); }} styles={styles} />}
      {!!secret && <View style={styles.secretBox}><Text style={styles.secretLabel}>Manual setup code</Text><Text selectable style={styles.secret}>{secret}</Text></View>}
      <Field label="Authenticator code" value={code} onChangeText={setCode} autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} styles={styles} colors={colors} />
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label={busy ? 'Verifying…' : 'Verify code'} disabled={busy || code.length < 6} onPress={() => { void verify(); }} styles={styles} />
    </>}
    {stage === 'backup' && <>
      {!!backupCodes.length && <View style={styles.backupGrid}>{backupCodes.map((item) => <Text selectable key={item} style={styles.backupCode}>{item}</Text>)}</View>}
      <Text style={styles.subtitle}>Store these backup codes somewhere safe. Each code works once.</Text>
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label="Done" onPress={() => { void finish(); }} styles={styles} />
    </>}
  </AuthShell>;
}

function AuthShell({ title, subtitle, onBack, children, styles }: { title: string; subtitle?: string; onBack?: () => void; children: ReactNode; styles: Styles }) {
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {onBack && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}><Text style={styles.back}>‹ Back</Text></Pressable>}
    <Animated.View entering={FadeInUp.duration(320)} style={styles.authCard}><Wordmark height={22} /><Text style={styles.title}>{title}</Text>{!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}<View style={styles.form}>{children}</View></Animated.View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function Field({ label, value, onChangeText, styles, colors, ...props }: { label: string; value: string; onChangeText: (value: string) => void; styles: Styles; colors: AppearanceColors; secureTextEntry?: boolean; keyboardType?: 'email-address' | 'number-pad'; autoComplete?: 'email' | 'current-password' | 'new-password' | 'one-time-code'; maxLength?: number }) {
  return <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholderTextColor={colors.subtleText} autoCapitalize="none" autoCorrect={false} style={styles.input} {...props} /></View>;
}

function CodeForm({ code, setCode, error, busy, label, onSubmit, styles, colors }: { code: string; setCode: (value: string) => void; error?: string | null; busy: boolean; label: string; onSubmit: () => void; styles: Styles; colors: AppearanceColors }) {
  return <><Field label="Verification code" value={code} onChangeText={setCode} autoComplete="one-time-code" keyboardType="number-pad" styles={styles} colors={colors} /><ErrorMessage message={error} styles={styles} /><ActionButton label={busy ? 'Checking…' : label} disabled={busy || !code} onPress={onSubmit} styles={styles} /></>;
}

function ErrorMessage({ message, styles }: { message?: string | null; styles: Styles }) {
  return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null;
}

function ActionButton({ label, onPress, disabled, styles }: { label: string; onPress: () => void; disabled?: boolean; styles: Styles }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

function messageFrom(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'That didn’t work. Try again.';
}

function createStyles(colors: AppearanceColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, content: { flexGrow: 1, padding: 24 }, backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 20 },
    back: { color: colors.mutedText, fontSize: 16, fontWeight: '700' }, authCard: { flex: 1, paddingTop: 42 }, title: { color: colors.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.7, lineHeight: 44, marginTop: 22, maxWidth: 340 },
    subtitle: { color: colors.mutedText, fontSize: 16, lineHeight: 23, marginTop: 13, maxWidth: 330 }, form: { marginTop: 42, gap: 16 }, fieldGroup: { gap: 8 }, fieldLabel: { color: colors.mutedText, fontSize: 13, fontWeight: '800' },
    input: { minHeight: 58, borderRadius: 16, borderWidth: 1.5, borderColor: colors.surfaceStrong, backgroundColor: colors.surface, color: colors.text, fontSize: 17, fontWeight: '700', paddingHorizontal: 18 }, button: { minHeight: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    buttonDisabled: { opacity: 0.5 }, buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 }, buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '900' }, textAction: { alignSelf: 'flex-end', paddingVertical: 2 }, textActionLabel: { color: colors.accent, fontSize: 14, fontWeight: '800' },
    switchAction: { alignSelf: 'center', padding: 12 }, switchTextStrong: { color: colors.accent, fontSize: 15, fontWeight: '900' }, error: { color: '#D74C41', fontSize: 13, lineHeight: 18, fontWeight: '700' }, methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, method: { borderWidth: 1, borderColor: colors.surfaceStrong, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12 }, methodActive: { backgroundColor: colors.accent, borderColor: colors.accent }, methodText: { color: colors.mutedText, fontSize: 12, fontWeight: '800' }, methodTextActive: { color: colors.accentText },
    secretBox: { padding: 16, borderRadius: 14, backgroundColor: colors.surface }, secretLabel: { color: colors.mutedText, fontSize: 12, fontWeight: '800' }, secret: { color: colors.text, marginTop: 8, fontSize: 16, fontWeight: '900', letterSpacing: 2 }, backupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, backupCode: { width: '47%', padding: 10, color: colors.text, backgroundColor: colors.surface, borderRadius: 8, textAlign: 'center', fontWeight: '800' },
  });
}
