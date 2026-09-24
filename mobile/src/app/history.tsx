import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'react-native-feather';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getWorkoutVisits } from '@/db';
import { useAppearance } from '@/components/appearance-provider';
import { StatsPanel } from '@/app/stats';
import { workoutSplitLabel } from '@/lib/workout-split-label';

const formatVolume = (volume: number) => volume >= 1_000 ? `${(volume / 1_000).toFixed(volume >= 10_000 ? 0 : 1)}k` : String(volume);
const formatDate = (date: Date) => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
const dayKey = (date: Date) => new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
const dayLabel = (date: Date) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
};

export default function HistoryScreen() {
  const { colors } = useAppearance();
  const { exerciseId } = useLocalSearchParams<{ exerciseId?: string }>();
  const [view, setView] = useState<'history' | 'progress'>('progress');
  const activeView = exerciseId ? 'progress' : view;
  const visits = getWorkoutVisits();
  const groups = visits.reduce<{ date: Date; visits: typeof visits }[]>((items, visit) => {
    const date = visit.workout.endedAt ?? visit.workout.createdAt;
    const existing = items.at(-1);
    if (existing && dayKey(existing.date) === dayKey(date)) existing.visits.push(visit);
    else items.push({ date, visits: [visit] });
    return items;
  }, []);
  return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Text style={[styles.title, { color: colors.text }]}>History</Text><View style={[styles.viewPicker, { backgroundColor: colors.surface }]} accessibilityRole="tablist"><Pressable onPress={() => { router.setParams({ exerciseId: undefined }); setView('history'); }} style={[styles.viewButton, activeView === 'history' && { backgroundColor: colors.inverse }]} accessibilityRole="tab" accessibilityState={{ selected: activeView === 'history' }}><Text style={[styles.viewLabel, { color: activeView === 'history' ? colors.inverseText : colors.mutedText }]}>Workouts</Text></Pressable><Pressable onPress={() => { router.setParams({ exerciseId: undefined }); setView('progress'); }} style={[styles.viewButton, activeView === 'progress' && { backgroundColor: colors.inverse }]} accessibilityRole="tab" accessibilityState={{ selected: activeView === 'progress' }}><Text style={[styles.viewLabel, { color: activeView === 'progress' ? colors.inverseText : colors.mutedText }]}>Progress</Text></Pressable></View></View>
    {activeView === 'progress' ? <StatsPanel key={exerciseId ?? 'default'} initialExerciseId={exerciseId} /> : <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {groups.length ? groups.map((group) => <View key={dayKey(group.date)} style={styles.dayGroup}><Text style={[styles.dayLabel, { color: colors.mutedText }]}>{dayLabel(group.date)}</Text>{group.visits.map((visit) => <Pressable key={visit.workout.id} onPress={() => router.push({ pathname: '/history-detail', params: { workoutId: visit.workout.id } })} style={({ pressed }) => [styles.visit, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`View ${workoutSplitLabel(visit.workout.split)} workout from ${formatDate(visit.workout.endedAt ?? visit.workout.createdAt)}`}>
        <View style={styles.visitCopy}><Text style={[styles.visitTitle, { color: colors.text }]}>{workoutSplitLabel(visit.workout.split)} workout</Text><Text style={[styles.meta, { color: colors.mutedText }]}>{visit.exercises} exercises  ·  {visit.sets} sets  ·  {visit.volume ? `${formatVolume(visit.volume)} lb` : `${visit.reps} reps`}</Text></View><ChevronRight width={20} height={20} color={colors.subtleText} strokeWidth={2.2} />
      </Pressable>)}</View>) : <View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>No workouts yet</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Finish a workout to find it here.</Text></View>}
    </ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, header: { height: 72, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, viewPicker: { height: 34, padding: 3, borderRadius: 11, flexDirection: 'row' }, viewButton: { minWidth: 70, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, viewLabel: { fontSize: 11, fontWeight: '900', letterSpacing: -.15 }, title: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2 }, content: { padding: 24, paddingTop: 12, paddingBottom: 30 }, dayGroup: { marginBottom: 26 }, dayLabel: { marginBottom: 6, fontSize: 12, fontWeight: '900', letterSpacing: -.1 }, visit: { minHeight: 72, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center' }, visitCopy: { flex: 1 }, visitTitle: { fontSize: 16, fontWeight: '900', letterSpacing: -.4 }, meta: { marginTop: 3, fontSize: 12, fontWeight: '700', letterSpacing: -.1 }, pressed: { opacity: .62 }, empty: { paddingTop: 120, alignItems: 'center' }, emptyTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -.8 }, emptyCopy: { marginTop: 7, fontSize: 14, fontWeight: '600' },
});
