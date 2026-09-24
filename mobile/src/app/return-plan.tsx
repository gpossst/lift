import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/components/appearance-provider';
import { saveReturnPlan } from '@/lib/return-plan';
import { authClient } from '@/lib/auth-client';

const options = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 2 days', days: 2 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function ReturnPlanScreen() {
  const { colors } = useAppearance();
  const { data: session } = authClient.useSession();
  const finish = (date: string | null) => {
    if (session?.user.id) saveReturnPlan(session.user.id, date);
    router.replace('/');
  };

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
    <View style={styles.content}>
      <Text style={[styles.kicker, { color: colors.mutedText }]}>KEEP YOUR MOMENTUM</Text>
      <Text style={[styles.title, { color: colors.text }]}>When do you plan to come back?</Text>
      <Text style={[styles.subtitle, { color: colors.mutedText }]}>A small plan makes it easier to show up again.</Text>
      <View style={styles.options}>{options.map(({ label, days }) => <Pressable key={days} onPress={() => finish(dateAfter(days))} style={({ pressed }) => [styles.option, { backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button"><Text style={[styles.optionText, { color: colors.text }]}>{label}</Text><Text style={[styles.arrow, { color: colors.mutedText }]}>›</Text></Pressable>)}</View>
      <Pressable onPress={() => finish(null)} style={styles.skip} accessibilityRole="button"><Text style={[styles.skipText, { color: colors.mutedText }]}>I’m not sure yet</Text></Pressable>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, content: { flex: 1, justifyContent: 'center', padding: 24 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, title: { marginTop: 10, fontSize: 35, lineHeight: 39, fontWeight: '900', letterSpacing: -1.5 }, subtitle: { marginTop: 9, fontSize: 15, lineHeight: 21, fontWeight: '600' }, options: { gap: 9, marginTop: 28 },
  option: { minHeight: 58, paddingHorizontal: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, optionText: { fontSize: 16, fontWeight: '800' }, arrow: { fontSize: 24, fontWeight: '400' }, pressed: { opacity: .75, transform: [{ scale: .99 }] },
  skip: { alignSelf: 'center', padding: 14, marginTop: 10 }, skipText: { fontSize: 14, fontWeight: '800' },
});
