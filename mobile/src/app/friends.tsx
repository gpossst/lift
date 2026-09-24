import { useFocusEffect } from 'expo-router';
import { Check, RefreshCw, Users } from 'react-native-feather';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { addFriend, getFriendCode, getFriends, type Friend, type FriendsSummary } from '@/lib/friends';
import { getProfile, updateProfile } from '@/lib/profile';

export default function FriendsScreen() {
  const { colors } = useAppearance();
  const [code, setCode] = useState('');
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChosenDisplayName, setHasChosenDisplayName] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const nameDirtyRef = useRef(false);
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await getProfile();
      setHasChosenDisplayName(profile.hasChosenDisplayName);
      if (!nameDirtyRef.current) setDisplayName(profile.hasChosenDisplayName ? profile.displayName : '');
      if (!profile.hasChosenDisplayName) {
        setFriendCode(null);
        setFriends(null);
        return;
      }
      const [nextCode, nextFriends] = await Promise.all([getFriendCode(), getFriends()]);
      setFriendCode(nextCode);
      setFriends(nextFriends);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load friends.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const submit = async () => {
    if (code.length !== 6 || adding) return;
    setAdding(true);
    setError(null);
    try {
      setFriends(await addFriend(code));
      setCode('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add friend.');
    } finally {
      setAdding(false);
    }
  };

  const saveDisplayName = async () => {
    const name = displayName.trim();
    if (!name || savingName) return;
    setSavingName(true);
    setError(null);
    try {
      const profile = await updateProfile({ displayName: name });
      setDisplayName(profile.displayName);
      nameDirtyRef.current = false;
      setHasChosenDisplayName(profile.hasChosenDisplayName);
      if (profile.hasChosenDisplayName) await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your name.');
    } finally {
      setSavingName(false);
    }
  };

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
      <Text style={[styles.title, { color: colors.text }]}>Friends</Text>
      {hasChosenDisplayName && <Pressable onPress={() => void load()} disabled={loading} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Refresh friends">
        <RefreshCw width={19} height={19} color={colors.text} strokeWidth={2.5} />
      </Pressable>}
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {!loading && !hasChosenDisplayName ? <View style={[styles.nameCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.nameTitle, { color: colors.text }]}>Choose your display name</Text>
        <Text style={[styles.nameCopy, { color: colors.mutedText }]}>Friends will see this when you connect.</Text>
        <TextInput value={displayName} onChangeText={(value) => { setDisplayName(value); nameDirtyRef.current = true; }} maxLength={40} autoCapitalize="words" autoCorrect={false} placeholder="Your name" placeholderTextColor={colors.mutedText} style={[styles.nameInput, { color: colors.text, borderColor: colors.surfaceStrong }]} accessibilityLabel="Display name" returnKeyType="done" onSubmitEditing={() => void saveDisplayName()} />
        {error && <Text accessibilityRole="alert" style={styles.nameError}>{error}</Text>}
        <Pressable onPress={() => void saveDisplayName()} disabled={!displayName.trim() || savingName} style={({ pressed }) => [styles.nameButton, { backgroundColor: displayName.trim() ? colors.accent : colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Save display name">
          {savingName ? <ActivityIndicator color={colors.accentText} /> : <Text style={[styles.nameButtonText, { color: displayName.trim() ? colors.accentText : colors.mutedText }]}>Save name</Text>}
        </Pressable>
      </View> : hasChosenDisplayName && <>
      <View style={[styles.codeCard, { backgroundColor: colors.inverse }]}>
        <Text style={[styles.cardLabel, { color: colors.inverseText }]}>YOUR CODE</Text>
        {loading && !friendCode ? <ActivityIndicator color={colors.accent} /> : <Text selectable style={[styles.code, { color: colors.inverseText }]}>{friendCode ?? '— — — — — —'}</Text>}
        <View style={[styles.codeDivider, { backgroundColor: colors.inverseText }]} />
        <View style={styles.addRow}>
          <TextInput
            value={code}
            onChangeText={(value) => setCode(value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())}
            autoCapitalize="characters"
            maxLength={6}
            placeholder="Enter a friend’s code"
            placeholderTextColor={colors.inverseText}
            style={[styles.codeInput, { color: colors.inverseText }]}
            accessibilityLabel="Friend code"
            accessibilityHint="Enter the six-character code your friend shared"
          />
          <Pressable onPress={() => void submit()} disabled={code.length !== 6 || adding} style={({ pressed }) => [styles.addButton, { backgroundColor: code.length === 6 ? colors.accent : colors.inverseText }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Add friend">
            {adding ? <ActivityIndicator color={colors.accentText} /> : <Check width={20} height={20} color={code.length === 6 ? colors.accentText : colors.inverse} strokeWidth={3} />}
          </Pressable>
        </View>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>

      {loading && !friends ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : friends?.users.length ? <View style={[styles.friendList, { borderColor: colors.surfaceStrong }]}>{friends.users.map((friend) => <FriendRow key={friend.id} friend={friend} />)}</View> : <View style={styles.empty}><Users width={25} height={25} color={colors.subtleText} strokeWidth={2.3} /><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>No friends yet</Text></View>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

function FriendRow({ friend }: { friend: Friend }) {
  const { colors } = useAppearance();
  const initials = friend.displayName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'L';
  return <View style={[styles.friendRow, { borderColor: colors.surfaceStrong }]}>
    {friend.imageUrl ? <Image source={{ uri: friend.imageUrl }} style={styles.avatar} accessibilityLabel={`${friend.displayName}'s profile photo`} /> : <View style={[styles.avatar, styles.initials, { backgroundColor: colors.surfaceStrong }]}><Text style={[styles.initialsText, { color: colors.text }]}>{initials}</Text></View>}
    <Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>{friend.displayName}</Text>
  </View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, header: { height: 72, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 28, fontWeight: '900', letterSpacing: -1.2 }, refresh: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, content: { paddingHorizontal: 24, paddingTop: 13, paddingBottom: 30 }, nameCard: { marginTop: 12, padding: 22, borderRadius: 22 }, nameTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -.5 }, nameCopy: { marginTop: 7, fontSize: 14, lineHeight: 20, fontWeight: '600' }, nameInput: { height: 52, marginTop: 20, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14, fontSize: 16, fontWeight: '700' }, nameError: { marginTop: 8, fontSize: 12, color: '#D43A2F' }, nameButton: { height: 50, marginTop: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, nameButtonText: { fontSize: 15, fontWeight: '900' }, codeCard: { padding: 22, borderRadius: 22 }, cardLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, opacity: .65 }, code: { marginTop: 10, fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: 5 }, codeDivider: { height: 1, marginTop: 22, opacity: .18 }, addRow: { minHeight: 54, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }, codeInput: { flex: 1, paddingVertical: 8, fontSize: 15, fontWeight: '800', letterSpacing: .2 }, addButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, error: { marginTop: 7, fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#FF9B8A' }, friendList: { marginTop: 25, borderTopWidth: 1 }, friendRow: { minHeight: 67, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 42, height: 42, borderRadius: 14 }, initials: { alignItems: 'center', justifyContent: 'center' }, initialsText: { fontSize: 14, fontWeight: '900' }, friendName: { flex: 1, fontSize: 16, fontWeight: '900', letterSpacing: -.25 }, empty: { minHeight: 128, marginTop: 25, alignItems: 'center', justifyContent: 'center' }, emptyCopy: { marginTop: 9, textAlign: 'center', fontSize: 13, lineHeight: 18, fontWeight: '700' }, loading: { minHeight: 128, marginTop: 25, alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: .72, transform: [{ scale: .97 }] },
});
