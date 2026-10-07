import { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search, X } from 'react-native-feather';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { useAppearance } from '@/components/appearance-provider';
import { EmptyArt } from '@/components/empty-art';
import { StatsExerciseRow, type StatsExercise } from '@/components/stats-exercise-row';
import { searchExercises } from '@/lib/exercise-search';

/** The full exercise list from the Stats page, searchable in place. `focus` opens with the keyboard up. */
export function ExerciseSearchSheet({ visible, focus, exercises, onClose }: { visible: boolean; focus: boolean; exercises: StatsExercise[]; onClose: () => void }) {
  const { colors } = useAppearance();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => searchExercises(exercises, query), [exercises, query]);
  const close = useCallback(() => { setQuery(''); onClose(); }, [onClose]);
  const renderExercise = useCallback(({ item, index }: { item: StatsExercise; index: number }) => <StatsExerciseRow item={item} last={index === filtered.length - 1} onOpen={close} />, [close, filtered.length]);

  return <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
    <View style={styles.overlay}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}><Pressable onPress={close} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close exercises" /></Animated.View>
      <Animated.View entering={SlideInDown.duration(280)} style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.handle, { backgroundColor: colors.surfaceStrong }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Exercises</Text>
          <Pressable onPress={close} hitSlop={10} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close"><X width={20} height={20} color={colors.text} strokeWidth={2.5} /></Pressable>
        </View>
        <View style={[styles.searchField, { backgroundColor: colors.surface }]}><Search width={17} height={17} color={colors.subtleText} strokeWidth={2.4} /><TextInput value={query} onChangeText={setQuery} placeholder="Search exercises" placeholderTextColor={colors.subtleText} style={[styles.searchInput, { color: colors.text }]} accessibilityLabel="Search exercises" autoFocus={focus} autoCorrect={false} autoCapitalize="none" returnKeyType="search" /></View>
        <FlatList data={filtered} keyExtractor={(exercise) => exercise.id} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} renderItem={renderExercise} ListEmptyComponent={<View style={{ paddingTop: 24 }}><EmptyArt name="search" width={132} /><Text style={[styles.emptyCopy, { color: colors.mutedText, textAlign: 'center' }]}>No matching exercises</Text></View>} />
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,.38)' },
  sheet: { height: '92%', paddingTop: 9, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 23, lineHeight: 27, fontWeight: '900', letterSpacing: -.8 },
  closeButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  searchField: { height: 46, marginHorizontal: 20, marginTop: 12, marginBottom: 6, paddingHorizontal: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, searchInput: { flex: 1, height: '100%', fontSize: 15, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingBottom: 56 },
  emptyCopy: { marginVertical: 16, fontSize: 13, lineHeight: 19, fontWeight: '600' },
});
