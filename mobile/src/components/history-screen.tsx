import { ui } from '@/styles/primitives';
import { router, usePathname } from 'expo-router';
import { ArrowLeft, ChevronRight } from 'react-native-feather';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getWorkoutVisits } from '@/db';
import { useAppearance } from '@/components/appearance-provider';
import { EmptyArt } from '@/components/empty-art';
import { workoutSplitLabel } from '@/lib/workout-split-label';
import { groupWorkoutVisits } from '@/lib/history-sections';
import { useWorkoutData } from '@/hooks/use-workout-data';

const formatVolume = (volume: number) => volume >= 1_000 ? `${(volume / 1_000).toFixed(volume >= 10_000 ? 0 : 1)}k` : String(volume);
const formatDate = (date: Date) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
const formatRowDate = (date: Date) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(date);

export default function HistoryScreen() {
  const { colors } = useAppearance();
  const pathname = usePathname();
  const visits = useWorkoutData(getWorkoutVisits);
  const back = () => router.canGoBack() ? router.back() : router.replace(pathname.startsWith('/stats/') ? '/stats' : '/');
  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={back} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back from history"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable><Text style={[ui.title, { color: colors.text }]}>History</Text></View>
    <SectionList sections={groupWorkoutVisits(visits)} keyExtractor={(visit) => visit.workout.id} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickySectionHeadersEnabled
      renderSectionHeader={({ section }) => <View style={[styles.monthHeader, { backgroundColor: colors.background }]}><Text style={[styles.monthTitle, { color: colors.mutedText }]}>{section.title}</Text></View>}
      renderItem={({ item: visit }) => <Pressable onPress={() => router.push({ pathname: pathname.startsWith('/stats/') ? '/stats/history-detail' : '/history-detail', params: { workoutId: visit.workout.id } })} style={({ pressed }) => [styles.visit, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`View ${workoutSplitLabel(visit.workout.split)} workout from ${formatDate(visit.workout.endedAt ?? visit.workout.createdAt)}`}>
        <View style={styles.visitCopy}><Text style={[styles.visitTitle, { color: colors.text }]}>{workoutSplitLabel(visit.workout.split)} workout<Text style={[styles.visitDate, { color: colors.mutedText }]}> · {formatRowDate(visit.workout.endedAt ?? visit.workout.createdAt)}</Text></Text><Text style={[styles.meta, { color: colors.mutedText }]}>{visit.exercises} exercise{visit.exercises === 1 ? '' : 's'}  ·  {visit.sets} set{visit.sets === 1 ? '' : 's'}  ·  {visit.volume ? `${formatVolume(visit.volume)} lb` : `${visit.reps} reps`}</Text></View><ChevronRight width={20} height={20} color={colors.subtleText} strokeWidth={2.2} />
      </Pressable>}
      ListEmptyComponent={<View style={styles.empty}><EmptyArt name="logbook" /><Text style={[styles.emptyTitle, { color: colors.text }]}>No workouts yet</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Finish a workout to find it here.</Text></View>}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
    header: { height: 64, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 10 }, content: { paddingHorizontal: 24, paddingBottom: 30 }, monthHeader: { paddingTop: 20, paddingBottom: 8 }, monthTitle: { fontSize: 13, fontWeight: '900', letterSpacing: .5, textTransform: 'uppercase' }, visit: { minHeight: 72, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' }, visitCopy: { flex: 1 }, visitTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -.4 }, visitDate: { fontSize: 12, fontWeight: '700' }, meta: { marginTop: 3, fontSize: 12, fontWeight: '700', letterSpacing: -.1 }, pressed: { opacity: .62 }, empty: { paddingTop: 120, alignItems: 'center' }, emptyTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -.8 }, emptyCopy: { marginTop: 7, fontSize: 14, fontWeight: '600' },
});
