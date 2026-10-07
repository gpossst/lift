import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppearance } from '@/components/appearance-provider';
import { FlexAnimation } from '@/components/flex-animation';

export default function VerifiedEmailScreen() {
  const { colors } = useAppearance();
  useEffect(() => { router.replace('/'); }, []);
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}><View style={styles.loading}><FlexAnimation style={styles.animation} /></View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' }, animation: { width: '100%', aspectRatio: 16 / 9 } });
