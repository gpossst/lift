import { ui } from '@/styles/primitives';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'react-native-feather';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SplitBodyGraphic } from '@/components/split-body-graphic';
import { createWorkout, getCustomSplits, getRecommendedWorkoutSplit, getWorkoutSplitDefinition, type WorkoutSplit } from '@/db';
import { useAppearance } from '@/components/appearance-provider';

const splits = [
  { id: 'push', title: 'Push', detail: 'Chest · Shoulders · Triceps' },
  { id: 'pull', title: 'Pull', detail: 'Back · Biceps · Rear Delts' },
  { id: 'legs', title: 'Legs', detail: 'Quads · Glutes · Hamstrings' },
] as const;

export default function StartWorkoutScreen() {
	const { colors } = useAppearance();
  const [recommendedSplit] = useState(getRecommendedWorkoutSplit);
  const [selectedSplit, setSelectedSplit] = useState<WorkoutSplit>(recommendedSplit);
  const [previousSplit, setPreviousSplit] = useState<WorkoutSplit>(recommendedSplit);
  const [customSplits] = useState(getCustomSplits);
  const [pickerWidth, setPickerWidth] = useState(0);
  const tilePosition = useSharedValue(0);
  const tileWidth = Math.max((pickerWidth - 16) / 3, 0);
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  const startWorkout = () => {
    const workout = createWorkout(selectedSplit);
    router.replace({ pathname: '/exercises', params: { split: selectedSplit, workoutId: workout.id } });
  };
  const chooseSplit = (split: WorkoutSplit) => {
    if (split === selectedSplit) return;
    setPreviousSplit(selectedSplit);
    setSelectedSplit(split);
  };
  const selectedIndex = Math.max(0, splits.findIndex(({ id }) => id === selectedSplit));
  const selectedDefinition = getWorkoutSplitDefinition(selectedSplit);
  const previousDefinition = getWorkoutSplitDefinition(previousSplit);
  const recommendedName = getWorkoutSplitDefinition(recommendedSplit)?.name ?? recommendedSplit;
  useEffect(() => {
    tilePosition.value = withTiming(selectedIndex * (tileWidth + 4), { duration: 240 });
  }, [selectedIndex, tileWidth, tilePosition]);
  const activeTileStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tilePosition.value }] }));

	return <SafeAreaView style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
		<Pressable onPress={goBack} hitSlop={14} style={ui.backButton} accessibilityRole="button" accessibilityLabel="Go back"><ArrowLeft width={22} height={22} color={colors.text} strokeWidth={2.5} /></Pressable>
		<Text style={[ui.title, { color: colors.text }]}>New Workout</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.middleContent}>
      <View style={styles.bodyPreview}>
        <View style={styles.bodyMapLayer}><SplitBodyGraphic split={previousSplit} muscles={previousDefinition?.muscles} large /></View>
        <Animated.View key={selectedSplit} entering={FadeIn.duration(260)} style={styles.bodyMapLayer}><SplitBodyGraphic split={selectedSplit} muscles={selectedDefinition?.muscles} large /></Animated.View>
      </View>
		<Text style={[styles.selectedDetail, { color: colors.mutedText }]}>{selectedDefinition?.muscles.map((muscle) => muscle.replace(/\b\w/g, (letter) => letter.toUpperCase())).join(' · ')}</Text>
      </View>
		{customSplits.length > 0 && <View style={styles.customList}>{customSplits.map(({ id, name, muscles }) => <Pressable key={id} onPress={() => chooseSplit(id)} style={[styles.customOption, { backgroundColor: selectedSplit === id ? colors.inverse : colors.surface }]} accessibilityRole="radio" accessibilityState={{ selected: selectedSplit === id }}><Text style={[styles.customName, { color: selectedSplit === id ? colors.inverseText : colors.text }]}>{name}</Text><Text style={[styles.customMuscles, { color: selectedSplit === id ? colors.inverseText : colors.mutedText }]} numberOfLines={1}>{muscles.join(' · ')}</Text></Pressable>)}</View>}
    </ScrollView>
	<View style={[styles.actionFooter, { backgroundColor: colors.background }]}>
		<Pressable onPress={() => chooseSplit(recommendedSplit)} style={({ pressed }) => [styles.recommendedBadge, { backgroundColor: colors.accent }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`${recommendedName} is recommended today`}><Text style={[styles.recommendedText, { color: colors.accentText }]}>{recommendedName.toUpperCase()} RECOMMENDED TODAY</Text></Pressable>
		<View style={[styles.splitPicker, { backgroundColor: colors.surface }]} onLayout={({ nativeEvent }) => setPickerWidth(nativeEvent.layout.width)} accessibilityRole="tablist">
			{tileWidth > 0 && !selectedSplit.startsWith('custom:') && <Animated.View pointerEvents="none" style={[styles.activeSplitTile, { width: tileWidth, backgroundColor: colors.inverse }, activeTileStyle]} />}
        {splits.map(({ id, title }) => {
          const isSelected = id === selectedSplit;
			return <Pressable key={id} onPress={() => chooseSplit(id)} style={({ pressed }) => [styles.splitButton, pressed && ui.pressed]} accessibilityRole="tab" accessibilityState={{ selected: isSelected }} accessibilityLabel={`Select ${title} workout`}><Text style={[styles.splitButtonText, { color: colors.subtleText }, isSelected && { color: colors.inverseText }]}>{title}</Text></Pressable>;
        })}
      </View>
		<Pressable onPress={startWorkout} style={({ pressed }) => [styles.startButton, { backgroundColor: colors.accent }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`Start ${selectedDefinition?.name ?? selectedSplit} workout`}>
        <Text style={styles.startText}>Confirm</Text>
      </Pressable>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header:{height:72,paddingHorizontal:24,flexDirection:'row',alignItems:'center',gap:10},content:{flexGrow:1,paddingHorizontal:24,paddingTop:20,paddingBottom:20},middleContent:{flex:1,justifyContent:'center'},bodyPreview:{height:240,alignItems:'center',justifyContent:'center',position:'relative'},bodyMapLayer:{position:'absolute',alignItems:'center',justifyContent:'center'},recommendedBadge:{alignSelf:'center',paddingHorizontal:9,paddingVertical:5,borderRadius:8,marginBottom:7},recommendedText:{fontSize:9,fontWeight:'900',letterSpacing:.75},selectedDetail:{fontSize:13,fontWeight:'700',lineHeight:18,minHeight:36,color:'#72776D',textAlign:'center',marginBottom:12},splitPicker:{height:52,padding:4,borderRadius:17,backgroundColor:'#EDEEE9',flexDirection:'row',gap:4,position:'relative'},activeSplitTile:{position:'absolute',left:4,top:4,bottom:4,borderRadius:13,backgroundColor:'#17180F'},splitButton:{flex:1,borderRadius:13,alignItems:'center',justifyContent:'center',zIndex:1},splitButtonText:{fontSize:14,fontWeight:'900',letterSpacing:-.2,color:'#767B72'},splitButtonTextSelected:{color:'#FFFFFF'},customList:{marginTop:12,gap:8},customOption:{minHeight:56,borderRadius:14,paddingHorizontal:16,justifyContent:'center'},customName:{fontSize:15,fontWeight:'900'},customMuscles:{fontSize:11,fontWeight:'700',textTransform:'capitalize',marginTop:3},actionFooter:{paddingHorizontal:24,paddingTop:13,paddingBottom:11,backgroundColor:'#F9F9F7',gap:12},startButton:{minHeight:62,paddingHorizontal:10,borderRadius:19,backgroundColor:'#FFCC4A',alignItems:'center',justifyContent:'center'},startText:{fontSize:18,fontWeight:'900',letterSpacing:-.55,color:'#17180F'},});
