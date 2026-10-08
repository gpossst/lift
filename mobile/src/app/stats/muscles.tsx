import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { ArrowLeft } from 'react-native-feather';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { bodyMuscleIds } from '@/components/muscle-body-graphic';
import { CoverageTrendSheet } from '@/components/coverage-trend-sheet';
import { MuscleTrendRow } from '@/components/muscle-trend-row';
import { getCompletedWorkoutExerciseDetails, getExercises, getWorkoutVisits } from '@/db';
import { defaultWorkoutSplits } from '@/lib/exercise-recommendations';
import { compareCoverage, coverageDays, coverageSummary, muscleCoverage, trainingOverview, weeklyTrainingHistory } from '@/lib/training-overview';
import { ui } from '@/styles/primitives';
import { useCoveragePlan } from '@/hooks/use-coverage-plan';
import { useWorkoutData } from '@/hooks/use-workout-data';


export default function MusclesScreen() {
  const { colors } = useAppearance();
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const { split } = useLocalSearchParams<{ split?: string }>();
  const { plan, customSplits } = useCoveragePlan();
  const definition = [...defaultWorkoutSplits, ...customSplits].find((item) => item.id === split);
  const visits = useWorkoutData(getWorkoutVisits);
  const now = new Date();
  const details = getCompletedWorkoutExerciseDetails();
  const overview = trainingOverview(visits, (id) => details.get(id) ?? [], getExercises(), now, weeklyTrainingHistory(visits, now).length);
  const weeks = overview.weeks.slice(-8);
  // Status is global: work logged on any split counts. A split only narrows which muscles are listed.
  const muscles = definition ? definition.muscles : [...new Set([...bodyMuscleIds, ...plan?.targets.keys() ?? [], ...weeks.flatMap((week) => Object.keys(week.muscles))])];
  const coverage = plan ? muscles.map((muscle) => muscleCoverage(overview, muscle, plan)).sort(compareCoverage) : [];
  const summary = coverageSummary(coverage);
  const selected = coverage.find((item) => item.muscle === selectedMuscle) ?? null;

  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={() => router.dismissTo('/stats')} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back to stats"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable></View>
    <FlatList data={coverage} keyExtractor={(item) => item.muscle} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<View style={styles.intro}>
      <Text style={[styles.title, { color: colors.text }]}>{definition ? definition.name : 'All muscles'}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedText }]}>{plan ? `${summary.onTrack} of ${summary.planned} on track · last ${coverageDays(overview, plan)} days` : 'Loading…'}</Text>
    </View>} renderItem={({ item, index }) => <MuscleTrendRow coverage={item} onPress={() => setSelectedMuscle(item.muscle)} last={index === coverage.length - 1} />} />
    <CoverageTrendSheet coverage={selected} weeks={overview.weeks} onClose={() => setSelectedMuscle(null)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header: { height: 52, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 56 },
  intro: { marginBottom: 10 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
