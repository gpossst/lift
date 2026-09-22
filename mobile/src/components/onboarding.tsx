import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import LottieView, { type AnimationObject } from 'lottie-react-native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInUp, Layout, SlideInLeft, SlideInRight, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/components/appearance-provider';
import { Wordmark } from '@/components/wordmark';
import { exerciseCatalog } from '@/db/exercise-catalog';
import type { AppearanceColors } from '@/lib/appearance';
import { savePendingOnboarding, type Onboarding } from '@/lib/onboarding';

type Props = { onSignIn: () => void; onSignUp: () => void };
type Step = 'welcome' | 'name' | 'goals' | 'body' | 'experience' | 'favorites' | 'routine';
type Styles = ReturnType<typeof createStyles>;
const baseSteps: Step[] = ['welcome', 'name', 'goals', 'body', 'experience', 'routine'];
const experiencedSteps: Step[] = ['welcome', 'name', 'goals', 'body', 'experience', 'favorites', 'routine'];
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
  const flexRef = useRef<LottieView>(null);
  const scrollRef = useRef<ScrollView>(null);
  const flexSource = useMemo(() => tintFlexFills(require('../../assets/flex.json'), colors.accent), [colors.accent]);
  const [step, setStep] = useState<Step>('welcome');
  const [forward, setForward] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [weight, setWeight] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [experience, setExperience] = useState<Onboarding['experience'] | null>(null);
  const [favoriteExerciseIds, setFavoriteExerciseIds] = useState<string[]>([]);
  const [exerciseQuery, setExerciseQuery] = useState('');
  const [location, setLocation] = useState<Onboarding['trainingLocation'] | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  // flex.json is ~10s at 25fps; loop just the first three seconds, restarting
  // whenever the welcome step (re)mounts.
  useEffect(() => { if (step === 'welcome') flexRef.current?.play(0, 75); }, [step]);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  const steps = experience === 'experienced' ? experiencedSteps : baseSteps;
  const index = steps.indexOf(step);
  const goTo = (next: number) => { setForward(next > index); setStep(steps[next]!); };
  const next = () => goTo(index + 1);
  const back = () => index > 0 && goTo(index - 1);
  const totalHeight = Number(heightFeet) * 12 + Number(heightInches);
  const bodyValid = Number(weight) >= 50 && Number(weight) <= 1_000 && Number(heightFeet) > 0 && Number(heightInches) >= 0 && Number(heightInches) < 12 && totalHeight >= 36 && totalHeight <= 108;
  const finish = async () => {
    if (!experience || !location || !days || saving) return;
    setSaving(true);
    await savePendingOnboarding({ displayName: displayName.trim().replace(/\s+/g, ' '), goals: selectedGoals, weightLb: Number(weight), heightInches: totalHeight, experience, favoriteExerciseIds: experience === 'experienced' ? favoriteExerciseIds : [], trainingLocation: location, trainingDays: days });
    onSignUp();
  };
  // Timing curve, not a spring: springs overshoot x=0 and bounce back, which
  // reads as a glitch on a full-screen slide. Matches start.tsx's FadeIn.
  const slide = (forward ? SlideInRight : SlideInLeft).duration(280).easing(Easing.bezier(0.33, 1, 0.68, 1));

  return <SafeAreaView style={styles.safe}>
    {step !== 'welcome' && <View style={styles.progressHeader}>
      <Animated.Text entering={FadeIn.duration(250)} style={styles.stepCount}>{index} of {steps.length - 1}</Animated.Text>
      <View style={styles.progress}>{steps.slice(1).map((item, position) => <View key={item} style={styles.progressSegment}>
        {(index - 1 >= position) && <Animated.View entering={FadeIn.duration(300)} layout={springify(Layout.damping(24).stiffness(260))} style={styles.progressFill} />}
      </View>)}</View>
    </View>}
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {step !== 'welcome' && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={back} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }], opacity: pressed ? 0.6 : 1 }]}><Text style={styles.back}>‹ Back</Text></Pressable>}
      <Animated.View key={step} entering={slide} style={styles.stepWrap}>
        {step === 'welcome' && <View style={styles.welcome}>
          <Animated.View entering={FadeInUp.delay(0).duration(400)} accessible accessibilityLabel="LIFT"><Wordmark height={48} /></Animated.View>
          <Animated.Text entering={FadeInUp.delay(80).duration(400)} style={styles.subtitle}>A few quick questions will tailor your starting point.</Animated.Text>
          <Animated.View entering={FadeIn.delay(150).duration(500)} style={styles.animationWrap}><LottieView ref={flexRef} autoPlay={false} loop={false} resizeMode="contain" source={flexSource} style={styles.animation} onAnimationFinish={() => flexRef.current?.play(0, 75)} /></Animated.View>
          <Animated.View entering={FadeInUp.delay(250).duration(400)}><Button label="Let's go" onPress={next} styles={styles} /></Animated.View>
          <Animated.View entering={FadeIn.delay(350).duration(400)}><Pressable accessibilityRole="button" onPress={onSignIn} style={styles.signIn}><Text style={styles.signInText}>I already have an account</Text></Pressable></Animated.View>
        </View>}
        {step === 'name' && <Question title="What should we call you?" subtitle="This is how friends will see you." styles={styles}><View style={styles.nameField}><Text style={styles.fieldLabel}>DISPLAY NAME</Text><TextInput accessibilityLabel="Display name" autoCapitalize="words" autoCorrect={false} maxLength={40} value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor={colors.subtleText} style={styles.nameInput} /></View><Button label="Continue" disabled={!displayName.trim()} onPress={next} styles={styles} /></Question>}
        {step === 'goals' && <Question title="What are you working toward?" subtitle="Pick all that feel right." styles={styles}><View style={styles.choices}>{goals.map((goal, i) => {
          const selected = selectedGoals.includes(goal);
          return <Animated.View key={goal} entering={FadeInUp.delay(120 + i * 70).duration(380)} layout={springify(Layout.damping(26).stiffness(300))}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => setSelectedGoals(current => current.includes(goal) ? current.filter(item => item !== goal) : [...current, goal])} style={({ pressed }) => [styles.choice, selected && styles.selected, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{goal}</Text>
              <Animated.Text key={String(selected)} entering={springify(ZoomIn.duration(220))} style={[styles.check, !selected && styles.checkIdle, selected && styles.checkSelected]}>{selected ? '✓' : '+'}</Animated.Text>
            </Pressable>
          </Animated.View>;
        })}</View><Animated.View entering={FadeInUp.delay(420).duration(380)}><Button label="Continue" disabled={!selectedGoals.length} onPress={next} styles={styles} /></Animated.View></Question>}
        {step === 'body' && <Question title="Tell us about your body." subtitle="This helps make weight-based recommendations useful." styles={styles}><Animated.View entering={FadeInUp.delay(120).duration(380)} style={styles.measurements}><Field label="Weight" value={weight} onChangeText={setWeight} suffix="lb" styles={styles} placeholderColor={colors.subtleText} /><Field label="Height" value={heightFeet} onChangeText={setHeightFeet} suffix="ft" styles={styles} placeholderColor={colors.subtleText} /><Field label="" value={heightInches} onChangeText={setHeightInches} suffix="in" styles={styles} placeholderColor={colors.subtleText} /></Animated.View><Animated.View entering={FadeInUp.delay(280).duration(380)}><Button label="Continue" disabled={!bodyValid} onPress={next} styles={styles} /></Animated.View></Question>}
        {step === 'experience' && <Question title="How familiar are you with the gym?" subtitle="We’ll meet you where you are." styles={styles}><View style={styles.choices}>
          {(['new', 'some', 'experienced'] as const).map((value, i) => <Choice key={value} index={i} value={value} selected={experience} onPress={setExperience} styles={styles}
            label={value === 'new' ? 'Just getting started' : value === 'some' ? 'I’ve trained before' : 'Very experienced'}
            detail={value === 'new' ? 'I’m learning the basics.' : value === 'some' ? 'I know my way around a workout.' : 'Training is already part of my routine.'} />)}
        </View><Animated.View entering={FadeInUp.delay(360).duration(380)}><Button label="Continue" disabled={!experience} onPress={next} styles={styles} /></Animated.View></Question>}
        {step === 'favorites' && <Question title="What do you love to train?" subtitle="Choose up to 5 exercises. We’ll favor them when they fit your workout." styles={styles}>
          <TextInput accessibilityLabel="Search exercises" autoCapitalize="none" autoCorrect={false} value={exerciseQuery} onChangeText={setExerciseQuery} placeholder="Search exercises" placeholderTextColor={colors.subtleText} style={styles.nameInput} />
          <Text style={styles.favoriteCount}>{favoriteExerciseIds.length} of 5 selected</Text>
          <View style={styles.choices}>{favoriteChoices(exerciseQuery, favoriteExerciseIds).map((exercise, i) => {
            const selected = favoriteExerciseIds.includes(exercise.id);
            return <Animated.View key={exercise.id} entering={FadeInUp.delay(80 + i * 30).duration(280)}>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} disabled={!selected && favoriteExerciseIds.length >= 5} onPress={() => setFavoriteExerciseIds(current => current.includes(exercise.id) ? current.filter(id => id !== exercise.id) : [...current, exercise.id])} style={({ pressed }) => [styles.choice, selected && styles.selected, !selected && favoriteExerciseIds.length >= 5 && styles.disabled, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                <View style={styles.choiceText}><Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>{exercise.name}</Text><Text style={[styles.choiceDetail, selected && styles.choiceDetailSelected]}>{exercise.area} · {exercise.equipment}</Text></View>
                <Text style={[styles.check, !selected && styles.checkIdle, selected && styles.checkSelected]}>{selected ? '✓' : '+'}</Text>
              </Pressable>
            </Animated.View>;
          })}</View>
          <Button label="Continue" disabled={!favoriteExerciseIds.length} onPress={next} styles={styles} />
        </Question>}
        {step === 'routine' && <Question title="Let’s shape your routine." subtitle="Where do you plan to train, and how often?" styles={styles}>
          <Animated.Text entering={FadeInUp.delay(100).duration(350)} style={styles.sectionLabel}>LOCATION</Animated.Text>
          <View style={styles.inlineChoices}>{(['gym', 'home', 'both'] as const).map((value, i) => <Choice key={value} index={i} compact value={value} selected={location} onPress={setLocation} styles={styles} label={value === 'gym' ? 'Gym' : value === 'home' ? 'Home' : 'Both'} />)}</View>
          <Animated.Text entering={FadeInUp.delay(200).duration(350)} style={styles.sectionLabel}>DAYS PER WEEK</Animated.Text>
          <View style={styles.inlineChoices}>{[2, 3, 4, 5].map((day, i) => <Choice key={day} index={i} compact value={day} selected={days} onPress={setDays} styles={styles} label={String(day)} />)}</View>
          <Animated.View entering={FadeInUp.delay(320).duration(380)}><Button label={saving ? 'Saving…' : 'Create my account'} disabled={!location || !days || saving} onPress={() => { void finish(); }} styles={styles} /></Animated.View>
        </Question>}
      </Animated.View>
    </ScrollView>
  </SafeAreaView>;
}

function favoriteChoices(query: string, selectedIds: readonly string[]) {
  const selected = new Set(selectedIds);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return exerciseCatalog.filter((exercise) => {
    if (selected.has(exercise.id)) return true;
    if (!terms.length) return exercise.isFeatured;
    const searchable = `${exercise.name} ${exercise.area} ${exercise.equipment}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  }).sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || b.isFeatured - a.isFeatured || a.name.localeCompare(b.name)).slice(0, 12);
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
function Field({ label, value, onChangeText, suffix, styles, placeholderColor }: { label: string; value: string; onChangeText: (value: string) => void; suffix: string; styles: Styles; placeholderColor: string }) { return <View style={styles.fieldWrap}><Text style={styles.fieldLabel}>{label.toUpperCase() || ' '}</Text><View style={styles.field}><TextInput accessibilityLabel={label || suffix} keyboardType="number-pad" value={value} onChangeText={onChangeText} placeholder="—" placeholderTextColor={placeholderColor} style={styles.input} maxLength={3} /><Text style={styles.suffix}>{suffix}</Text></View></View>; }
function Button({ label, onPress, disabled, styles }: { label: string; onPress: () => void; disabled?: boolean; styles: Styles }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, disabled && styles.disabled, { transform: [{ scale: pressed && !disabled ? 0.98 : 1 }], opacity: pressed && !disabled ? 0.92 : 1 }]}><Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>{label}</Text></Pressable>;
}

function createStyles(colors: AppearanceColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    progressHeader: { gap: 8, paddingHorizontal: 24, paddingTop: 14 },
    stepCount: { color: colors.mutedText, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
    progress: { flexDirection: 'row', gap: 5 },
    progressSegment: { flex: 1, height: 4, borderRadius: 4, backgroundColor: colors.surfaceStrong, overflow: 'hidden' },
    progressFill: { flex: 1, borderRadius: 4, backgroundColor: colors.accent },
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
    favoriteCount: { color: colors.mutedText, fontSize: 12, fontWeight: '800', marginVertical: 12 },
    button: { minHeight: 56, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 28 }, disabled: { backgroundColor: colors.surfaceStrong, opacity: 0.75 }, buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '900' }, buttonTextDisabled: { color: colors.subtleText }, measurements: { flexDirection: 'row', gap: 10 }, fieldWrap: { flex: 1 }, fieldLabel: { color: colors.mutedText, fontSize: 11, fontWeight: '900', letterSpacing: .8, marginBottom: 8 }, field: { height: 62, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceStrong, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center' }, input: { flex: 1, color: colors.text, fontSize: 21, fontWeight: '800', textAlign: 'center' }, nameField: { marginTop: 8 }, nameInput: { height: 62, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.surfaceStrong, paddingHorizontal: 16, color: colors.text, fontSize: 18, fontWeight: '800' }, suffix: { color: colors.mutedText, fontSize: 12, fontWeight: '700' }, sectionLabel: { color: colors.mutedText, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 9, marginTop: 22 }, inlineChoices: { flexDirection: 'row', gap: 8 },
  });
}
