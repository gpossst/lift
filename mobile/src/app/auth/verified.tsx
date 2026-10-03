import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/components/appearance-provider';

export default function VerifiedEmailScreen() {
  const { colors } = useAppearance();
  useEffect(() => { router.replace('/'); }, []);
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}><View style={styles.loading}><ActivityIndicator size="large" color={colors.text} /></View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
