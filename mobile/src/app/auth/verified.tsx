import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VerifiedEmailScreen() {
  useEffect(() => { router.replace('/'); }, []);
  return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator size="large" color="#208AEF" /></View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#F9F9F7' }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
