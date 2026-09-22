import { useClerk, useSignIn, useSignUp, useUser } from '@clerk/expo';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { Wordmark } from '@/components/wordmark';
import type { AppearanceColors } from '@/lib/appearance';

type AuthMode = 'signIn' | 'signUp';
type AuthStep = 'credentials' | 'signUpCode' | 'recoveryEmail' | 'recoveryCode' | 'newPassword' | 'mfa';
type MfaStrategy = 'totp' | 'phone_code' | 'email_code' | 'backup_code';
type Styles = ReturnType<typeof createStyles>;

const mfaLabels: Record<MfaStrategy, string> = {
  totp: 'Authenticator app',
  phone_code: 'Text message',
  email_code: 'Email code',
  backup_code: 'Backup code',
};

export function AuthFlow({ mode, onBack, onModeChange }: { mode: AuthMode; onBack: () => void; onModeChange: (mode: AuthMode) => void }) {
  const { colors } = useAppearance();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { signIn, errors: signInErrors, fetchStatus: signInStatus } = useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpStatus } = useSignUp();
  const [step, setStep] = useState<AuthStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaStrategy, setMfaStrategy] = useState<MfaStrategy>('totp');
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = signInStatus === 'fetching' || signUpStatus === 'fetching';

  const availableMfa = signIn.supportedSecondFactors
    .map((factor) => factor.strategy)
    .filter((strategy): strategy is MfaStrategy => strategy in mfaLabels)
    .filter((strategy, index, all) => all.indexOf(strategy) === index);

  const error = localError
    ?? (mode === 'signUp'
      ? signUpErrors.fields.emailAddress?.message || signUpErrors.fields.password?.message || signUpErrors.fields.code?.message || signUpErrors.global?.[0]?.message
      : signInErrors.fields.identifier?.message || signInErrors.fields.password?.message || signInErrors.fields.code?.message || signInErrors.global?.[0]?.message);

  const finalizeSignIn = async () => {
    await signIn.finalize();
  };

  const chooseMfa = async (strategy?: MfaStrategy) => {
    const currentStrategies = signIn.supportedSecondFactors
      .map((factor) => factor.strategy)
      .filter((item): item is MfaStrategy => item in mfaLabels)
      .filter((item, index, all) => all.indexOf(item) === index);
    const next = strategy ?? currentStrategies.find((item) => item !== 'backup_code') ?? currentStrategies[0];
    if (!next) { setLocalError('No supported verification method is available.'); return; }
    setLocalError(null);
    setCode('');
    setMfaStrategy(next);
    const result = next === 'phone_code'
      ? await signIn.mfa.sendPhoneCode()
      : next === 'email_code'
        ? await signIn.mfa.sendEmailCode()
        : { error: null };
    if (!result.error) setStep('mfa');
  };

  const continueAfterSignIn = async () => {
    if (signIn.status === 'complete') return finalizeSignIn();
    if (signIn.status === 'needs_second_factor') return chooseMfa();
    if (signIn.status === 'needs_client_trust') return chooseMfa('email_code');
    setLocalError('Clerk needs another sign-in step that Lift does not support yet.');
  };

  const submitCredentials = async () => {
    setLocalError(null);
    if (!email.trim() || !password) { setLocalError('Enter your email and password.'); return; }
    if (mode === 'signUp') {
      const { error: requestError } = await signUp.password({ emailAddress: email.trim(), password });
      if (requestError) return;
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (!sendError) { setCode(''); setStep('signUpCode'); }
      return;
    }
    const { error: requestError } = await signIn.password({ emailAddress: email.trim(), password });
    if (!requestError) await continueAfterSignIn();
  };

  const verifySignUp = async () => {
    setLocalError(null);
    const { error: requestError } = await signUp.verifications.verifyEmailCode({ code });
    if (requestError) return;
    if (signUp.status === 'complete') await signUp.finalize();
    else setLocalError('Your account still needs another verification step.');
  };

  const sendRecoveryCode = async () => {
    setLocalError(null);
    if (!email.trim()) { setLocalError('Enter the email on your account.'); return; }
    const { error: createError } = await signIn.create({ identifier: email.trim() });
    if (createError) return;
    const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
    if (!sendError) { setCode(''); setStep('recoveryCode'); }
  };

  const verifyRecoveryCode = async () => {
    setLocalError(null);
    const { error: requestError } = await signIn.resetPasswordEmailCode.verifyCode({ code });
    if (!requestError && signIn.status === 'needs_new_password') { setPassword(''); setStep('newPassword'); }
  };

  const setNewPassword = async () => {
    setLocalError(null);
    const { error: requestError } = await signIn.resetPasswordEmailCode.submitPassword({ password, signOutOfOtherSessions: true });
    if (!requestError) await continueAfterSignIn();
  };

  const verifyMfa = async () => {
    setLocalError(null);
    const result = mfaStrategy === 'totp' ? await signIn.mfa.verifyTOTP({ code })
      : mfaStrategy === 'phone_code' ? await signIn.mfa.verifyPhoneCode({ code })
        : mfaStrategy === 'email_code' ? await signIn.mfa.verifyEmailCode({ code })
          : await signIn.mfa.verifyBackupCode({ code });
    if (!result.error) await continueAfterSignIn();
  };

  const goBack = async () => {
    if (step === 'credentials') { onBack(); return; }
    await signIn.reset();
    await signUp.reset();
    setStep('credentials');
    setCode('');
    setLocalError(null);
  };

  const screen = step === 'credentials'
    ? mode === 'signIn'
      ? { title: 'Sign in.' }
      : { title: 'Create account.' }
    : step === 'signUpCode'
      ? { title: 'Check your email.', subtitle: email }
      : step === 'recoveryEmail'
        ? { title: 'Reset password.' }
        : step === 'recoveryCode'
          ? { title: 'Enter the code.', subtitle: email }
          : step === 'newPassword'
            ? { title: 'New password.' }
            : { title: 'Verify.', subtitle: mfaLabels[mfaStrategy] };

  return <AuthShell title={screen.title} subtitle={screen.subtitle} onBack={() => { void goBack(); }} styles={styles}>
    {step === 'credentials' && <>
      <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" styles={styles} colors={colors} />
      <Field label="Password" value={password} onChangeText={setPassword} autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} secureTextEntry styles={styles} colors={colors} />
      {mode === 'signIn' && <Pressable accessibilityRole="button" onPress={() => { setLocalError(null); setStep('recoveryEmail'); }} style={styles.textAction}><Text style={styles.textActionLabel}>Forgot password?</Text></Pressable>}
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label={busy ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Create account'} disabled={busy} onPress={() => { void submitCredentials(); }} styles={styles} />
      <Pressable accessibilityRole="button" onPress={() => onModeChange(mode === 'signIn' ? 'signUp' : 'signIn')} style={styles.switchAction}>
        <Text style={styles.switchTextStrong}>{mode === 'signIn' ? 'Create account' : 'Sign in'}</Text>
      </Pressable>
      {mode === 'signUp' && <View nativeID="clerk-captcha" />}
    </>}
    {step === 'signUpCode' && <CodeForm code={code} setCode={setCode} error={error} busy={busy} label="Verify account" onSubmit={verifySignUp} onResend={() => signUp.verifications.sendEmailCode()} styles={styles} colors={colors} />}
    {step === 'recoveryEmail' && <>
      <Field label="Email" value={email} onChangeText={setEmail} autoComplete="email" keyboardType="email-address" styles={styles} colors={colors} />
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label={busy ? 'Sending…' : 'Send code'} disabled={busy} onPress={() => { void sendRecoveryCode(); }} styles={styles} />
    </>}
    {step === 'recoveryCode' && <CodeForm code={code} setCode={setCode} error={error} busy={busy} label="Verify code" onSubmit={verifyRecoveryCode} onResend={() => signIn.resetPasswordEmailCode.sendCode()} styles={styles} colors={colors} />}
    {step === 'newPassword' && <>
      <Field label="New password" value={password} onChangeText={setPassword} autoComplete="new-password" secureTextEntry styles={styles} colors={colors} />
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label={busy ? 'Saving…' : 'Save password'} disabled={busy} onPress={() => { void setNewPassword(); }} styles={styles} />
    </>}
    {step === 'mfa' && <>
      {availableMfa.length > 1 && <View style={styles.methodRow}>{availableMfa.map((strategy) => <Pressable key={strategy} accessibilityRole="radio" accessibilityState={{ checked: strategy === mfaStrategy }} onPress={() => { void chooseMfa(strategy); }} style={[styles.method, strategy === mfaStrategy && styles.methodActive]}><Text style={[styles.methodText, strategy === mfaStrategy && styles.methodTextActive]}>{mfaLabels[strategy]}</Text></Pressable>)}</View>}
      <CodeForm code={code} setCode={setCode} error={error} busy={busy} label="Verify" onSubmit={verifyMfa} onResend={mfaStrategy === 'phone_code' ? () => signIn.mfa.sendPhoneCode() : mfaStrategy === 'email_code' ? () => signIn.mfa.sendEmailCode() : undefined} styles={styles} colors={colors} />
    </>}
  </AuthShell>;
}

export function AccountTaskFlow({ task }: { task: 'setup-mfa' | 'reset-password' }) {
  return task === 'setup-mfa' ? <MfaSetupFlow /> : <ForcedPasswordReset />;
}

function MfaSetupFlow() {
  const { colors } = useAppearance();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useUser();
  const clerk = useClerk();
  const [stage, setStage] = useState<'loading' | 'setup' | 'backup'>('loading');
  const [uri, setUri] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const didStart = useRef(false);

  const startTotp = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError(null);
    try {
      const totp = await user.createTOTP();
      setUri(totp.uri ?? '');
      setSecret(totp.secret ?? '');
      setStage('setup');
    } catch (reason) { setError(messageFrom(reason)); setStage('setup'); }
    finally { setBusy(false); }
  }, [user]);

  useEffect(() => {
    if (!user || didStart.current) return;
    didStart.current = true;
    void startTotp();
  }, [startTotp, user]);

  const verify = async () => {
    if (!user || busy) return;
    setBusy(true); setError(null);
    try {
      await user.verifyTOTP({ code });
      const backup = await user.createBackupCode();
      setBackupCodes(backup.codes);
      setStage('backup');
    } catch (reason) { setError(messageFrom(reason)); }
    finally { setBusy(false); }
  };
  const finish = async () => { await clerk.setActive({ session: clerk.session?.id }); };

  const title = stage === 'backup' ? 'Save backup codes.' : 'Set up MFA.';
  const subtitle = stage === 'backup' ? undefined : 'Use your authenticator app.';
  return <AuthShell title={title} subtitle={subtitle} styles={styles}>
    {stage === 'loading' ? <ActivityIndicator color={colors.accent} size="large" /> : stage === 'setup' ? <>
      {!!uri && <ActionButton label="Open authenticator app" onPress={() => { void Linking.openURL(uri).catch((reason: unknown) => setError(messageFrom(reason))); }} styles={styles} />}
      {!!secret && <View style={styles.secretBox}><Text style={styles.secretLabel}>Manual setup code</Text><Text selectable style={styles.secret}>{secret}</Text></View>}
      {!secret && <ActionButton label={busy ? 'Preparing…' : 'Try setup again'} disabled={busy} onPress={() => { void startTotp(); }} styles={styles} />}
      <Field label="Authenticator code" value={code} onChangeText={setCode} autoComplete="one-time-code" keyboardType="number-pad" maxLength={6} styles={styles} colors={colors} />
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label={busy ? 'Verifying…' : 'Verify code'} disabled={busy || code.length < 6} onPress={() => { void verify(); }} styles={styles} />
    </> : <>
      <View style={styles.backupGrid}>{backupCodes.map((item) => <Text selectable key={item} style={styles.backupCode}>{item}</Text>)}</View>
      <ErrorMessage message={error} styles={styles} />
      <ActionButton label="Done" onPress={() => { void finish(); }} styles={styles} />
    </>}
  </AuthShell>;
}

function ForcedPasswordReset() {
  const { colors } = useAppearance();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useUser();
  const clerk = useClerk();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!user || busy) return;
    setBusy(true); setError(null);
    try {
      await user.updatePassword({ newPassword: password, signOutOfOtherSessions: true });
      await clerk.setActive({ session: clerk.session?.id });
    } catch (reason) { setError(messageFrom(reason)); }
    finally { setBusy(false); }
  };
  return <AuthShell title="New password required." styles={styles}>
    <Field label="New password" value={password} onChangeText={setPassword} autoComplete="new-password" secureTextEntry styles={styles} colors={colors} />
    <ErrorMessage message={error} styles={styles} />
    <ActionButton label={busy ? 'Saving…' : 'Update password'} disabled={busy || !password} onPress={() => { void submit(); }} styles={styles} />
  </AuthShell>;
}

function AuthShell({ title, subtitle, onBack, children, styles }: { title: string; subtitle?: string; onBack?: () => void; children: ReactNode; styles: Styles }) {
  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {onBack && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.backButton}><Text style={styles.back}>‹ Back</Text></Pressable>}
        <Animated.View entering={FadeInUp.duration(320)} style={styles.authCard}>
          <Wordmark height={22} />
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <View style={styles.form}>{children}</View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Field({ label, value, onChangeText, styles, colors, ...props }: { label: string; value: string; onChangeText: (value: string) => void; styles: Styles; colors: AppearanceColors; secureTextEntry?: boolean; keyboardType?: 'email-address' | 'number-pad'; autoComplete?: 'email' | 'current-password' | 'new-password' | 'one-time-code'; maxLength?: number }) {
  return <View style={styles.fieldGroup}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholderTextColor={colors.subtleText} autoCapitalize="none" autoCorrect={false} style={styles.input} {...props} /></View>;
}

function CodeForm({ code, setCode, error, busy, label, onSubmit, onResend, styles, colors }: { code: string; setCode: (value: string) => void; error?: string | null; busy: boolean; label: string; onSubmit: () => Promise<void>; onResend?: () => Promise<unknown>; styles: Styles; colors: AppearanceColors }) {
  return <>
    <Field label="Verification code" value={code} onChangeText={setCode} autoComplete="one-time-code" keyboardType="number-pad" styles={styles} colors={colors} />
    {!!onResend && <Pressable accessibilityRole="button" onPress={() => { void onResend(); }} style={styles.textAction}><Text style={styles.textActionLabel}>Resend code</Text></Pressable>}
    <ErrorMessage message={error} styles={styles} />
    <ActionButton label={busy ? 'Checking…' : label} disabled={busy || !code} onPress={() => { void onSubmit(); }} styles={styles} />
  </>;
}

function ErrorMessage({ message, styles }: { message?: string | null; styles: Styles }) {
  return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null;
}

function ActionButton({ label, onPress, disabled, styles }: { label: string; onPress: () => void; disabled?: boolean; styles: Styles }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

function messageFrom(error: unknown) {
  if (error && typeof error === 'object' && 'errors' in error) {
    const errors = (error as { errors?: { message?: string; longMessage?: string }[] }).errors;
    return errors?.[0]?.longMessage ?? errors?.[0]?.message ?? 'That didn’t work. Try again.';
  }
  return error instanceof Error ? error.message : 'That didn’t work. Try again.';
}

function createStyles(colors: AppearanceColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 },
    content: { flexGrow: 1, padding: 24 }, backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 20 },
    back: { color: colors.mutedText, fontSize: 16, fontWeight: '700' }, authCard: { flex: 1, paddingTop: 42 },
    title: { color: colors.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.7, lineHeight: 44, marginTop: 22, maxWidth: 340 },
    subtitle: { color: colors.mutedText, fontSize: 16, lineHeight: 23, marginTop: 13, maxWidth: 330 }, form: { marginTop: 42, gap: 16 },
    fieldGroup: { gap: 8 }, fieldLabel: { color: colors.mutedText, fontSize: 13, fontWeight: '800' },
    input: { minHeight: 58, borderRadius: 16, borderWidth: 1.5, borderColor: colors.surfaceStrong, backgroundColor: colors.surface, color: colors.text, fontSize: 17, fontWeight: '700', paddingHorizontal: 18 },
    button: { minHeight: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    buttonDisabled: { opacity: 0.5 }, buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.92 }, buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '900' },
    textAction: { alignSelf: 'flex-end', paddingVertical: 2 }, textActionLabel: { color: colors.mutedText, fontSize: 14, fontWeight: '800' },
    switchAction: { alignItems: 'center', paddingVertical: 12 }, switchTextStrong: { color: colors.text, fontSize: 14, fontWeight: '900' },
    error: { color: '#E05252', fontSize: 14, fontWeight: '700', lineHeight: 20 },
    methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, method: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.surfaceStrong, paddingHorizontal: 14, paddingVertical: 10 },
    methodActive: { borderColor: colors.accent, backgroundColor: colors.accent }, methodText: { color: colors.mutedText, fontSize: 13, fontWeight: '800' }, methodTextActive: { color: colors.accentText },
    secretBox: { borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.surfaceStrong, padding: 16, gap: 8 },
    secretLabel: { color: colors.mutedText, fontSize: 13, fontWeight: '800' }, secret: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: 1.2 },
    backupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, backupCode: { width: '47%', borderRadius: 12, backgroundColor: colors.surface, color: colors.text, fontSize: 14, fontWeight: '800', padding: 12, textAlign: 'center' },
  });
}
