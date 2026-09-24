import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import LottieView, { type AnimationObject } from 'lottie-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInUp, Layout, SlideInLeft, SlideInRight, ZoomIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/components/appearance-provider';
import { Wordmark } from '@/components/wordmark';
import type { AppearanceColors } from '@/lib/appearance';
import { savePendingOnboarding, type Onboarding } from '@/lib/onboarding';

type Props = { onSignIn: () => void; onSignUp: () => void };
type Step = 'welcome' | 'goals' | 'experience' | 'routine';
type Styles = ReturnType<typeof createStyles>;
const steps: Step[] = ['welcome', 'goals', 'experience', 'routine'];
const goals = ['Build muscle', 'Get stronger', 'Lose fat', 'Feel healthier'];
const springify = <T,>(e: T) => (e as { springify: () => T }).springify();
// flex.json's only visible paint is a #5194FF fill (the Blue accent); strokes are
// transparent. Retint fills to the active accent so the art matches the theme.
const flexBlue: [number, number, number] = [0.3176470588235294, 0.5803921568627451, 1];
function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const n = Number.parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function tintFlexFills(source: AnimationObject, hex: string): AnimationObject {
  const clone = JSON.parse(JSON.stringify(source)) as unknown;
  const [r, g, b] = hexToRgb(hex);
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if (o['ty'] === 'fl' && o['c'] && typeof o['c'] === 'object') {
        const k = (o['c'] as Record<string, unknown>)['k'];
        if (Array.isArray(k) && k.length === 4 && k.every((v) => typeof v === 'number')
          && Math.abs((k[0] as number) - flexBlue[0]) < 0.01 && Math.abs((k[1] as number) - flexBlue[1]) < 0.01 && Math.abs((k[2] as number) - flexBlue[2]) < 0.01) {
          (o['c'] as Record<string, unknown>)['k'] = [r, g, b, k[3]];
        }
      }
      Object.values(o).forEach(visit);
    }
  };
  visit(clone);
  return clone as AnimationObject;
}

// Mobbin patterns (Tonal, Yazio, Strava, WHOOP, Equinox): thin top progress + step
// counter, staggered card entrance, selected-card inversion with radio pop, bottom
// CTA that fades/slides in when valid, direction-aware step slides.
export function OnboardingFlow({ onSignIn, onSignUp }: Props) {
  const { colors } = useAppearance();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const flexSource = useMemo(() => tintFlexFills(require('../../assets/flex.json'), colors.accent), [colors.accent]);
  const [step, setStep] = useState<Step>('welcome');
  const [forward, setForward] = useState(true);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [experience, setExperience] = useState<Onboarding['experience'] | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const progress = useSharedValue(0);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  const index = steps.indexOf(step);
  useEffect(() => {
    progress.value = withTiming(index / (steps.length - 1) * 100, { duration: 360, easing: Easing.inOut(Easing.cubic) });
  }, [index, progress]);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value}%` as `${number}%` }));
  const goTo = (next: number) => { setForward(next > index); setStep(steps[next]!); };
  const next = () => goTo(index + 1);
  const back = () => index > 0 && goTo(index - 1);
  const finish = async () => {
    if (!experience || !days || saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await savePendingOnboarding({ goals: selectedGoals, experience, trainingDays: days });
      onSignUp();
    } catch {
      setSaveError(true);
      setSaving(false);
    }
  };
  // Timing curve, not a spring: springs overshoot x=0 and bounce back, which
  // reads as a glitch on a full-screen slide. Matches start.tsx's FadeIn.
  const slide = (forward ? SlideInRight : SlideInLeft).duration(280).easing(Easing.bezier(0.33, 1, 0.68, 1));

  return <SafeAreaView style={styles.safe}>
    {step !== 'welcome' && <View style={styles.progressHeader}>
      <Text style={styles.stepCount}>{index} of {steps.length - 1}</Text>
      <View style={styles.progress}><Animated.View style={[styles.progressFill, progressStyle]} /></View>
    </View>}
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {step !== 'welcome' && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }], opacity: pressed ? 0.6 : 1 }]}><Text style={styles.back}>‹ Back</Text></Pressable>}
      <Animated.View key={step} entering={slide} style={styles.stepWrap}>
        {step === 'welcome' && <View style={styles.welcome}>
          <Animated.View entering={FadeInUp.delay(0).duration(400)} accessible accessibilityLabel="LIFT"><Wordmark height={48} /></Animated.View>
          <Animated.Text entering={FadeInUp.delay(80).duration(400)} style={styles.subtitle}>A few quick questions will tailor your starting point.</Animated.Text>
          <Animated.View entering={FadeIn.delay(150).duration(500)} style={styles.animationWrap}><LottieView autoPlay loop resizeMode="contain" source={flexSource} style={styles.animation} /></Animated.View>
          <Animated.View entering={FadeInUp.delay(250).duration(400)}><Button label="Let's go" onPress={next} styles={styles} /></Animated.View>
          <Animated.View entering={FadeIn.delay(350).duration(400)}><Pressable accessibilityRole="button" onPress={onSignIn} style={styles.signIn}><Text style={styles.signInText}>I already have an account</Text></Pressable></Animated.View>
        </View>}
        {step === 'goals' && <Question title="What are you working toward?" subtitle="Pick all that feel right." styles={styles}><View style={styles.choices}>{goals.map((goal, i) => {
          const selected = selectedGoals.includes(goal);
          return <Animated.View key={goal} entering={FadeInUp.delay(120 + i * 70).duration(380)} layout={springify(Layout.damping(26).stiffness(300))}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setSelectedGoals(current => current.includes(goal) ? current.filter(item => item !== goal) : [...current, goal])} style={({ pressed }) => [styles.choice, selected && styles.selected, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{goal}</Text>
              <Animated.Text key={String(selected)} entering={springify(ZoomIn.duration(220))} style={[styles.check, !selected && styles.checkIdle, selected && styles.checkSelected]}>{selected ? '✓' : '+'}</Animated.Text>
            </Pressable>
          </Animated.View>;
        })}</View><Animated.View entering={FadeInUp.delay(420).duration(380)}><Button label="Continue" disabled={!selectedGoals.length} onPress={next} styles={styles} /></Animated.View></Question>}
        {step === 'experience' && <Question title="How much lifting experience do you have?" subtitle="We’ll meet you where you are." styles={styles}><View style={styles.choices}>
          {(['new', 'some', 'experienced'] as const).map((value, i) => <Choice key={value} index={i} value={value} selected={experience} onPress={setExperience} styles={styles}
            label={value === 'new' ? 'Just getting started' : value === 'some' ? 'I’ve trained before' : 'Very experienced'}
            detail={value === 'new' ? 'I’m learning the basics.' : value === 'some' ? 'I know my way around a workout.' : 'Training is already part of my routine.'} />)}
        </View><Animated.View entering={FadeInUp.delay(360).duration(380)}><Button label="Continue" disabled={!experience} onPress={next} styles={styles} /></Animated.View></Question>}
        {step === 'routine' && <Question title="Let’s shape your routine." subtitle="How many days a week do you want to train?" styles={styles}>
          <Animated.Text entering={FadeInUp.delay(200).duration(350)} style={styles.sectionLabel}>DAYS PER WEEK</Animated.Text>
          <View style={styles.inlineChoices}>{[2, 3, 4, 5].map((day, i) => <Choice key={day} index={i} compact value={day} selected={days} onPress={setDays} styles={styles} label={String(day)} />)}</View>
          {saveError && <Text accessibilityRole="alert" style={styles.saveError}>Could not save your answers. Try again.</Text>}
          <Animated.View entering={FadeInUp.delay(320).duration(380)}><Button label={saving ? 'Saving…' : 'Create my account'} disabled={!days || saving} onPress={() => { void finish(); }} styles={styles} /></Animated.View>
        </Question>}
      </Animated.View>
    </ScrollView>
  </SafeAreaView>;
}

function Question({ title, subtitle, children, styles }: { title: string; subtitle: string; children: ReactNode; styles: Styles }) {
  return <View style={styles.question}><Animated.View entering={FadeInUp.duration(350)}><Wordmark height={18} /></Animated.View><Animated.Text entering={FadeInUp.delay(50).duration(380)} style={styles.title}>{title}</Animated.Text><Animated.Text entering={FadeInUp.delay(110).duration(380)} style={styles.subtitle}>{subtitle}</Animated.Text><View style={styles.questionBody}>{children}</View></View>;
}

function Choice<T extends string | number>({ value, selected, onPress, label, detail, index, compact, styles }: { value: T; selected: T | null; onPress: (value: T) => void; label: string; detail?: string; index: number; compact?: boolean; styles: Styles }) {
  const active = selected === value;
  return <Animated.View entering={FadeInUp.delay(120 + index * 70).duration(380)} layout={springify(Layout.damping(26).stiffness(300))} style={compact && styles.flexOne}>
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => onPress(value)} style={({ pressed }) => [styles.choice, compact && styles.choiceCompact, active && styles.selected, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
      <View style={styles.choiceText}><Text style={[styles.choiceLabel, active && styles.choiceLabelSelected]}>{label}</Text>{detail && <Text style={[styles.choiceDetail, active && styles.choiceDetailSelected]}>{detail}</Text>}</View>
      {compact
        ? <Animated.View key={String(active)} entering={springify(ZoomIn.duration(220))} style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</Animated.View>
        : <Animated.Text key={String(active)} entering={springify(ZoomIn.duration(220))} style={[styles.check, !active && styles.checkIdle, active && styles.checkSelected]}>{active ? '✓' : ''}</Animated.Text>}
    </Pressable>
  </Animated.View>;
}
function Button({ label, onPress, disabled, styles }: { label: string; onPress: () => void; disabled?: boolean; styles: Styles }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabled, { transform: [{ scale: pressed && !disabled ? 0.98 : 1 }], opacity: pressed && !disabled ? 0.92 : 1 }]}><Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>{label}</Text></Pressable>;
}

function createStyles(colors: AppearanceColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    progressHeader: { gap: 8, paddingHorizontal: 24, paddingTop: 14 },
    stepCount: { color: colors.mutedText, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
    progress: { height: 4, borderRadius: 4, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
    progressFill: { height: 4, borderRadius: 4, backgroundColor: colors.accent },
    content: { flexGrow: 1, padding: 24 }, stepWrap: { flex: 1 },
    welcome: { flex: 1, paddingTop: 72 }, title: { color: colors.text, fontSize: 42, fontWeight: '900', letterSpacing: -1.7, lineHeight: 44, marginTop: 15 }, subtitle: { color: colors.mutedText, fontSize: 16, lineHeight: 23, marginTop: 14, maxWidth: 310 }, animationWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' }, animation: { width: '100%', aspectRatio: 16 / 9 }, signIn: { alignItems: 'center', paddingVertical: 21 }, signInText: { color: colors.mutedText, fontWeight: '700' }, back: { color: colors.mutedText, fontSize: 16, fontWeight: '700', paddingVertical: 8 }, question: { flex: 1, paddingTop: 45 }, questionBody: { flex: 1, marginTop: 40 }, choices: { gap: 10 }, flexOne: { flex: 1 },
    choice: { minHeight: 62, borderWidth: 1.5, borderColor: colors.surfaceStrong, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    choiceCompact: { minHeight: 56, paddingHorizontal: 14, justifyContent: 'center' },
    selected: { borderColor: colors.accent, backgroundColor: colors.accent },
    choiceText: { flex: 1 },
    choiceLabel: { color: colors.text, fontSize: 16, fontWeight: '800' },
    choiceLabelSelected: { color: colors.accentText },
    choiceDetail: { color: colors.mutedText, fontSize: 13, marginTop: 3 },
    choiceDetailSelected: { color: colors.accentText, opacity: 0.7 },
    check: { fontSize: 20, fontWeight: '800', minWidth: 22, textAlign: 'center', color: colors.accentText }, checkIdle: { color: colors.subtleText, opacity: 0.7 }, checkSelected: { color: colors.accentText },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
    radioActive: { borderColor: colors.accentText }, radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accentText },
    button: { minHeight: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
    disabled: { backgroundColor: colors.surfaceStrong, opacity: 0.75 },
    buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '900' },
    buttonTextDisabled: { color: colors.subtleText },
    saveError: { color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 12 },
    sectionLabel: { color: colors.mutedText, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 9, marginTop: 22 },
    inlineChoices: { flexDirection: 'row', gap: 8 },
  });
}
