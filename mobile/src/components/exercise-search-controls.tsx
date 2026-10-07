import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search, X } from 'react-native-feather';
import { useAppearance } from '@/components/appearance-provider';
import { formatLabel } from '@/lib/exercise-filters';

type Props = {
  autoFocus?: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  muscleOptions: string[];
  muscleFilters: string[];
  onMuscleFiltersChange: (values: string[]) => void;
  equipmentOptions: string[];
  equipmentFilters: string[];
  onEquipmentFiltersChange: (values: string[]) => void;
};

export function ExerciseSearchControls({ autoFocus = false, query, onQueryChange, muscleOptions, muscleFilters, onMuscleFiltersChange, equipmentOptions, equipmentFilters, onEquipmentFiltersChange }: Props) {
  const { colors } = useAppearance();
  return <View><View style={[styles.searchBox, { backgroundColor: colors.surface }]}><Search width={19} height={19} color={colors.mutedText} strokeWidth={2.35} /><TextInput autoFocus={autoFocus} value={query} onChangeText={onQueryChange} placeholder="Search names, aliases, or muscles" placeholderTextColor={colors.subtleText} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={[styles.searchInput, { color: colors.text }]} accessibilityLabel="Search exercises" />{query.length > 0 && <Pressable onPress={() => onQueryChange('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search"><X width={18} height={18} color={colors.mutedText} strokeWidth={2.5} /></Pressable>}</View><FilterRow options={muscleOptions} selected={muscleFilters} onSelect={onMuscleFiltersChange} /><FilterRow options={equipmentOptions} selected={equipmentFilters} onSelect={onEquipmentFiltersChange} /></View>;
}

function FilterRow({ options, selected, onSelect }: { options: string[]; selected: string[]; onSelect: (values: string[]) => void }) { const { colors } = useAppearance(); const selectedValues = selected ?? []; return <View style={styles.filterGroup}><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters}>{options.map((option) => { const isSelected = selectedValues.includes(option); return <Pressable key={option} onPress={() => onSelect(isSelected ? selectedValues.filter((value) => value !== option) : [...selectedValues, option])} accessibilityRole="button" accessibilityState={{ selected: isSelected }} hitSlop={{ top: 4, bottom: 4 }} style={[styles.filterPill, { backgroundColor: isSelected ? colors.accent : colors.surface }]}><Text style={[styles.filterText, { color: isSelected ? colors.accentText : colors.mutedText }]}>{formatLabel(option)}</Text></Pressable>; })}</ScrollView></View>; }

const styles = StyleSheet.create({
  searchBox: { height: 52, paddingHorizontal: 16, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '800', height: '100%' },
  filterGroup: { marginTop: 8 },
  filters: { gap: 7, paddingVertical: 4 }, filterScroll: { marginVertical: -4 },
  filterPill: { height: 32, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 12, fontWeight: '900' },
});
