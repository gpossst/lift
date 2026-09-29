import { ui } from '@/styles/primitives';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated as RNAnimated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SplitBodyGraphic } from '@/components/split-body-graphic';
import { createWorkout, getCustomSplits, getRecommendedWorkoutSplit, getWorkoutSplitDefinition, type WorkoutSplit } from '@/db';
import { useAppearance } from '@/components/appearance-provider';

const splits = [
  { id: 'push', title: 'Push', detail: 'Chest · Shoulders · Triceps' },
  { id: 'pull', title: 'Pull', detail: 'Back · Biceps · Rear Delts' },
  { id: 'legs', title: 'Legs', detail: 'Quads · Glutes · Hamstrings' },
] as const;

export default function StartWorkoutScreen() {
  const { colors, useCustomSplits } = useAppearance();
  const [customSplits] = useState(getCustomSplits);
  const customMode = useCustomSplits && customSplits.length > 0;
  const [recommendedSplit] = useState(() => getRecommendedWorkoutSplit(new Date(), customMode));
  const [selectedSplit, setSelectedSplit] = useState<WorkoutSplit>(recommendedSplit);
  const [previousSplit, setPreviousSplit] = useState<WorkoutSplit>(recommendedSplit);
  const [pickerWidth, setPickerWidth] = useState(0);
  // RN Animated (not Reanimated): the shared-value + useAnimatedStyle equivalent
  // intermittently fails to attach its mapper on RN 0.86 Fabric, freezing the tile.
  const [tilePosition] = useState(() => new RNAnimated.Value(0));
  const tileWidth = Math.max((pickerWidth - 16) / 3, 0);
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
    RNAnimated.timing(tilePosition, { toValue: selectedIndex * (tileWidth + 4), duration: 240, useNativeDriver: true }).start();
  }, [selectedIndex, tileWidth, tilePosition]);

	return <SafeAreaView edges={['top', 'right', 'left']} style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
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
      {customMode && <View style={styles.customList}>{customSplits.map(({ id, name, muscles }) => <Pressable key={id} onPress={() => chooseSplit(id)} style={[styles.customOption, { backgroundColor: selectedSplit === id ? colors.inverse : colors.surface }]} accessibilityRole="radio" accessibilityState={{ selected: selectedSplit === id }} accessibilityLabel={`Select ${name} workout`}><Text style={[styles.customName, { color: selectedSplit === id ? colors.inverseText : colors.text }]}>{name}</Text><Text style={[styles.customMuscles, { color: selectedSplit === id ? colors.inverseText : colors.mutedText }]} numberOfLines={1}>{muscles.join(' · ')}</Text></Pressable>)}</View>}
    </ScrollView>
	<View style={[styles.actionFooter, { backgroundColor: colors.background }]}>
		<Pressable hitSlop={12} onPress={() => chooseSplit(recommendedSplit)} style={({ pressed }) => [styles.recommendedBadge, { backgroundColor: colors.accent }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`${recommendedName} is recommended today`}><Text style={[styles.recommendedText, { color: colors.accentText }]}>{recommendedName.toUpperCase()} RECOMMENDED TODAY</Text></Pressable>
		{!customMode && <View style={[styles.splitPicker, { backgroundColor: colors.surface }]} onLayout={({ nativeEvent }) => setPickerWidth(nativeEvent.layout.width)} accessibilityRole="tablist">
			{tileWidth > 0 && !selectedSplit.startsWith('custom:') && <RNAnimated.View pointerEvents="none" style={[styles.activeSplitTile, { width: tileWidth, backgroundColor: colors.inverse, transform: [{ translateX: tilePosition }] }]} />}
        {splits.map(({ id, title }) => {
          const isSelected = id === selectedSplit;
			return <Pressable key={id} onPress={() => chooseSplit(id)} style={({ pressed }) => [styles.splitButton, pressed && ui.pressed]} accessibilityRole="tab" accessibilityState={{ selected: isSelected }} accessibilityLabel={`Select ${title} workout`}><Text style={[styles.splitButtonText, { color: colors.subtleText }, isSelected && { color: colors.inverseText }]}>{title}</Text></Pressable>;
        })}
      </View>}
		<Pressable onPress={startWorkout} style={({ pressed }) => [styles.startButton, { backgroundColor: colors.accent }, pressed && ui.pressed]} accessibilityRole="button" accessibilityLabel={`Start ${selectedDefinition?.name ?? selectedSplit} workout`}>
        <Text style={styles.startText}>{`Start ${selectedDefinition?.name ?? selectedSplit} workout`}</Text>
      </Pressable>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  header:{height:72,paddingHorizontal:24,flexDirection:'row',alignItems:'center',gap:10},content:{flexGrow:1,paddingHorizontal:24,paddingTop:20,paddingBottom:20},middleContent:{flex:1,justifyContent:'center'},bodyPreview:{height:240,alignItems:'center',justifyContent:'center',position:'relative'},bodyMapLayer:{position:'absolute',alignItems:'center',justifyContent:'center'},recommendedBadge:{alignSelf:'center',paddingHorizontal:9,paddingVertical:5,borderRadius:8,marginBottom:7},recommendedText:{fontSize:9,fontWeight:'900',letterSpacing:.75},selectedDetail:{fontSize:13,fontWeight:'700',lineHeight:18,minHeight:36,color:'#72776D',textAlign:'center',marginBottom:12},splitPicker:{height:52,padding:4,borderRadius:17,backgroundColor:'#EDEEE9',flexDirection:'row',gap:4,position:'relative'},activeSplitTile:{position:'absolute',left:4,top:4,bottom:4,borderRadius:13,backgroundColor:'#17180F'},splitButton:{flex:1,borderRadius:13,alignItems:'center',justifyContent:'center',zIndex:1},splitButtonText:{fontSize:14,fontWeight:'900',letterSpacing:-.2,color:'#767B72'},splitButtonTextSelected:{color:'#FFFFFF'},customList:{marginTop:12,gap:8},customOption:{minHeight:56,borderRadius:14,paddingHorizontal:16,justifyContent:'center'},customName:{fontSize:15,fontWeight:'900'},customMuscles:{fontSize:11,fontWeight:'700',textTransform:'capitalize',marginTop:3},actionFooter:{paddingHorizontal:24,paddingTop:13,paddingBottom:11,backgroundColor:'#F9F9F7',gap:12},startButton:{minHeight:62,paddingHorizontal:10,borderRadius:19,backgroundColor:'#FFCC4A',alignItems:'center',justifyContent:'center'},startText:{fontSize:18,fontWeight:'900',letterSpacing:-.55,color:'#17180F'},});
