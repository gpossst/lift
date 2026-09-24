import { StyleSheet } from 'react-native';

// Shared screen and control styles. Appearance colors stay in useAppearance().
export const ui = StyleSheet.create({
  screen: { flex: 1 },
  header: { height: 72, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2 },
  backButton: { width: 38, height: 38, marginLeft: -9, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { minHeight: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontSize: 17, fontWeight: '900', letterSpacing: -.45 },
  stat: { flex: 1, minHeight: 82, borderRadius: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, lineHeight: 22, fontWeight: '900', letterSpacing: -.7 },
  statLabel: { marginTop: 3, fontSize: 10, fontWeight: '800' },
  listIndex: { width: 31, fontSize: 11, fontWeight: '900', letterSpacing: .5 },
  listName: { fontSize: 15, fontWeight: '800', letterSpacing: -.35 },
  listMeta: { marginTop: 2, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: .78, transform: [{ scale: .985 }] },
});
