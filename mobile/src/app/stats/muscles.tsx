import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { ArrowLeft } from 'react-native-feather';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { bodyMuscleIds } from '@/components/muscle-body-graphic';
import { CoverageTrendSheet } from '@/components/coverage-trend-sheet';
import { MuscleTrendRow } from '@/components/muscle-trend-row';
import { getCompletedWorkoutExerciseDetails, getCustomSplits, getExercises, getWorkoutVisits } from '@/db';
import { defaultWorkoutSplits } from '@/lib/exercise-recommendations';
import { averageCoverage, muscleCoverage, trainingOverview, weeklyTrainingHistory } from '@/lib/training-overview';
import { ui } from '@/styles/primitives';
import { useWorkoutData } from '@/hooks/use-workout-data';


export default function MusclesScreen() {
  const { colors, useCustomSplits } = useAppearance();
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const { split } = useLocalSearchParams<{ split?: string }>();
  const customSplits = getCustomSplits();
  const definition = [...defaultWorkoutSplits, ...customSplits].find((item) => item.id === split);
  // The list shows every muscle, but the headline averages the plan's muscles, same as the Stats hero.
  const planMuscles = [...new Set((useCustomSplits && customSplits.length ? customSplits : defaultWorkoutSplits).flatMap((item) => item.muscles))];
  const visits = useWorkoutData(getWorkoutVisits);
  const now = new Date();
  const details = getCompletedWorkoutExerciseDetails();
  const coverageWeeks = trainingOverview(visits, (id) => details.get(id) ?? [], getExercises(), now, undefined, weeklyTrainingHistory(visits, now).length).weeks;
  const weeks = coverageWeeks.slice(-8);
  const muscles = [...new Set(definition ? definition.muscles : [...bodyMuscleIds, ...weeks.flatMap((week) => Object.keys(week.coverage))])]
    .sort((a, b) => muscleCoverage(weeks.slice(4), b, definition?.id) - muscleCoverage(weeks.slice(4), a, definition?.id)
      || muscleCoverage(weeks.slice(0, 4), b, definition?.id) - muscleCoverage(weeks.slice(0, 4), a, definition?.id)
      || a.localeCompare(b));

  const recentOverall = averageCoverage(weeks.slice(4), definition?.muscles ?? planMuscles, definition?.id);

  return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={() => router.dismissTo('/stats')} hitSlop={10} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Back to stats"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable></View>
    <FlatList data={muscles} keyExtractor={(muscle) => muscle} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} ListHeaderComponent={<View style={styles.intro}>
      <Text style={[styles.title, { color: colors.text }]}>{definition ? definition.name : 'All muscles'}</Text>
      <Text style={[styles.subtitle, { color: colors.mutedText }]}>{recentOverall}% average coverage · last 4 weeks, including this week vs the 4 before</Text>
    </View>} renderItem={({ item: muscle, index }) => <View>
      <MuscleTrendRow muscle={muscle} values={weeks.map((week) => muscleCoverage([week], muscle, definition?.id))} recent={muscleCoverage(weeks.slice(4), muscle, definition?.id)} prior={muscleCoverage(weeks.slice(0, 4), muscle, definition?.id)} onPress={() => setSelectedMuscle(muscle)} last={index === muscles.length - 1} />
    </View>} />
    <CoverageTrendSheet muscle={selectedMuscle} weeks={coverageWeeks} split={definition?.id} onClose={() => setSelectedMuscle(null)} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header: { height: 52, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 56 },
  intro: { marginBottom: 10 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
