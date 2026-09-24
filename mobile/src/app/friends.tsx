import { ui } from '@/styles/primitives';
import { useFocusEffect } from 'expo-router';
import { Check, Plus, Users, X } from 'react-native-feather';
import LottieView from 'lottie-react-native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { getExercises } from '@/db';
import { addFriend, blockFriend, getFriendCode, getFriendPersonalRecords, getFriends, removeFriend, unblockFriend, type Friend, type FriendPersonalRecord, type FriendsSummary } from '@/lib/friends';
import { getProfile, updateProfile } from '@/lib/profile';

export default function FriendsScreen() {
  const { colors } = useAppearance();
  const [code, setCode] = useState('');
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendsSummary | null>(null);
  const [records, setRecords] = useState<FriendPersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [updatingFriend, setUpdatingFriend] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasChosenDisplayName, setHasChosenDisplayName] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [showFriends, setShowFriends] = useState(false);
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
        setRecords([]);
        return;
      }
      const [nextCode, nextFriends, nextRecords] = await Promise.all([getFriendCode(), getFriends(), getFriendPersonalRecords()]);
      setFriendCode(nextCode);
      setFriends(nextFriends);
      setRecords(nextRecords);
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
      setShowFriends(true);
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

  const updateConnection = async (friend: Friend, action: 'remove' | 'block' | 'unblock') => {
    const pending = `${action}:${friend.id}`;
    if (updatingFriend) return;
    setUpdatingFriend(pending);
    setError(null);
    try {
      const nextFriends = await (action === 'remove' ? removeFriend(friend.id) : action === 'block' ? blockFriend(friend.id) : unblockFriend(friend.id));
      setFriends(nextFriends);
      if (!nextFriends.count) setShowFriends(false);
      setRecords((current) => action === 'unblock' ? current : current.filter((record) => record.id !== friend.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `Could not ${action} ${friend.displayName}.`);
    } finally {
      setUpdatingFriend(null);
    }
  };

  return <SafeAreaView edges={['top', 'right', 'left']} style={[ui.screen, { backgroundColor: colors.background }]}>
    <View style={ui.header}>
      <Text style={[ui.title, { color: colors.text }]}>Friends</Text>
      {hasChosenDisplayName && <Pressable onPress={() => setShowFriends(true)} style={({ pressed }) => [styles.headerButton, { backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Open friends list">
        <Users width={20} height={20} color={colors.text} strokeWidth={2.5} />
        {!!friends?.count && <View style={[styles.countBadge, { backgroundColor: colors.accent }]}><Text style={[styles.countText, { color: colors.accentText }]}>{friends.count}</Text></View>}
      </Pressable>}
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, !hasChosenDisplayName && styles.nameContent]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {!loading && !hasChosenDisplayName ? <View style={styles.nameSection}>
        <LottieView autoPlay loop resizeMode="contain" source={require('../../assets/friends-intro.json')} style={styles.nameAnimation} webStyle={styles.nameAnimation} />
        <Text style={[styles.nameTitle, { color: colors.text }]}>Make sure your friends know who you are!</Text>
        <TextInput value={displayName} onChangeText={(value) => { setDisplayName(value); nameDirtyRef.current = true; }} maxLength={40} autoCapitalize="words" autoCorrect={false} placeholder="Your name" placeholderTextColor={colors.mutedText} style={[styles.nameInput, { color: colors.text, borderColor: colors.surfaceStrong }]} accessibilityLabel="Display name" returnKeyType="done" onSubmitEditing={() => void saveDisplayName()} />
        {error && <Text accessibilityRole="alert" style={styles.nameError}>{error}</Text>}
        <Pressable onPress={() => void saveDisplayName()} disabled={!displayName.trim() || savingName} style={({ pressed }) => [styles.nameButton, { backgroundColor: displayName.trim() ? colors.accent : colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Save display name">
          {savingName ? <ActivityIndicator color={colors.accentText} /> : <Text style={[styles.nameButtonText, { color: displayName.trim() ? colors.accentText : colors.mutedText }]}>Save name</Text>}
        </Pressable>
      </View> : loading && !friends ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : hasChosenDisplayName && friends?.count === 0 ? <>
        <AddFriendCard code={code} friendCode={friendCode} adding={adding} error={error} onChangeCode={setCode} onSubmit={() => void submit()} />
        <View style={styles.empty}><Users width={27} height={27} color={colors.subtleText} strokeWidth={2.3} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Your feed is waiting</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Add a friend to see their latest lifting highlights.</Text></View>
      </> : hasChosenDisplayName && <FriendFeed records={records} />}
    </ScrollView>

    <Modal visible={showFriends} transparent animationType="slide" onRequestClose={() => setShowFriends(false)}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFriends(false)} accessibilityLabel="Close friends list" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.text }]}>Your friends</Text><Text style={[styles.sheetCount, { color: colors.mutedText }]}>{friends?.count ?? 0} friend{friends?.count === 1 ? '' : 's'}</Text></View><Pressable onPress={() => setShowFriends(false)} style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Close friends list"><X width={20} height={20} color={colors.text} strokeWidth={2.5} /></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
            <AddFriendCard code={code} friendCode={friendCode} adding={adding} error={error} onChangeCode={setCode} onSubmit={() => void submit()} compact />
            {!!friends?.users.length && <View style={[styles.friendList, { borderColor: colors.surfaceStrong }]}>{friends.users.map((friend) => <FriendRow key={friend.id} friend={friend} busy={updatingFriend?.endsWith(`:${friend.id}`) ?? false} onRemove={() => void updateConnection(friend, 'remove')} onBlock={() => void updateConnection(friend, 'block')} />)}</View>}
            {!!friends?.blocked.length && <View style={styles.blockedSection}><Text style={[styles.sectionLabel, { color: colors.mutedText }]}>BLOCKED</Text>{friends.blocked.map((friend) => <BlockedRow key={friend.id} friend={friend} busy={updatingFriend === `unblock:${friend.id}`} onUnblock={() => void updateConnection(friend, 'unblock')} />)}</View>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}

function AddFriendCard({ code, friendCode, adding, error, onChangeCode, onSubmit, compact = false }: { code: string; friendCode: string | null; adding: boolean; error: string | null; onChangeCode: (code: string) => void; onSubmit: () => void; compact?: boolean }) {
  const { colors } = useAppearance();
  return <View style={[styles.codeCard, compact && styles.compactCard, { backgroundColor: colors.inverse }]}>
    <View style={styles.codeHeader}><View><Text style={[styles.cardLabel, { color: colors.inverseText }]}>YOUR CODE</Text><Text selectable style={[styles.code, compact && styles.compactCode, { color: colors.inverseText }]}>{friendCode ?? '— — — — — —'}</Text></View><Plus width={22} height={22} color={colors.inverseText} strokeWidth={2.5} /></View>
    <View style={[styles.codeDivider, { backgroundColor: colors.inverseText }]} />
    <View style={styles.addRow}>
      <TextInput value={code} onChangeText={(value) => onChangeCode(value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={6} placeholder="Enter a friend’s code" placeholderTextColor={colors.inverseText} style={[styles.codeInput, { color: colors.inverseText }]} accessibilityLabel="Friend code" accessibilityHint="Enter the six-character code your friend shared" returnKeyType="done" onSubmitEditing={onSubmit} />
      <Pressable onPress={onSubmit} disabled={code.length !== 6 || adding} style={({ pressed }) => [styles.addButton, { backgroundColor: code.length === 6 ? colors.accent : colors.inverseText }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Add friend">{adding ? <ActivityIndicator color={colors.accentText} /> : <Check width={20} height={20} color={code.length === 6 ? colors.accentText : colors.inverse} strokeWidth={3} />}</Pressable>
    </View>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

function FriendFeed({ records }: { records: FriendPersonalRecord[] }) {
  const { colors } = useAppearance();
  const exercises = new Map(getExercises().map((exercise) => [exercise.id, exercise.name]));
  if (!records.length) return <View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>No updates yet</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Your friends’ new personal records will show up here.</Text></View>;
  return <View style={styles.feed}>{records.map((record) => {
    const initials = record.displayName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'L';
    return <View key={`${record.id}:${record.exerciseId}:${record.completedAt}`} style={[styles.feedCard, { backgroundColor: colors.surface }]}>
      <View style={styles.feedHeader}>{record.imageUrl ? <Image source={{ uri: record.imageUrl }} style={styles.avatar} accessibilityLabel={`${record.displayName}'s profile photo`} /> : <View style={[styles.avatar, styles.initials, { backgroundColor: colors.surfaceStrong }]}><Text style={[styles.initialsText, { color: colors.text }]}>{initials}</Text></View>}<View style={styles.feedPerson}><Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>{record.displayName}</Text><Text style={[styles.feedTime, { color: colors.mutedText }]}>{formatUpdateTime(record.completedAt)}</Text></View></View>
      <Text style={[styles.feedKicker, { color: colors.mutedText }]}>NEW PERSONAL RECORD</Text>
      <Text style={[styles.feedExercise, { color: colors.text }]}>{exercises.get(record.exerciseId) ?? 'Exercise'}</Text>
      <Text style={[styles.feedWeight, { color: colors.text }]}>{record.weight} <Text style={styles.feedUnit}>LB</Text></Text>
      <Text style={[styles.feedReps, { color: colors.mutedText }]}>{record.reps} rep{record.reps === 1 ? '' : 's'}</Text>
    </View>;
  })}</View>;
}

function formatUpdateTime(timestamp: number) {
  const date = new Date(timestamp * 1000);
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60 * 60 * 1000) return 'Just now';
  if (elapsed < 24 * 60 * 60 * 1000) return `${Math.floor(elapsed / (60 * 60 * 1000))}h ago`;
  if (elapsed < 7 * 24 * 60 * 60 * 1000) return `${Math.floor(elapsed / (24 * 60 * 60 * 1000))}d ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

function FriendRow({ friend, busy, onRemove, onBlock }: { friend: Friend; busy: boolean; onRemove: () => void; onBlock: () => void }) {
  const { colors } = useAppearance();
  const initials = friend.displayName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'L';
  return <View style={[styles.friendRow, { borderColor: colors.surfaceStrong }]}>{friend.imageUrl ? <Image source={{ uri: friend.imageUrl }} style={styles.avatar} accessibilityLabel={`${friend.displayName}'s profile photo`} /> : <View style={[styles.avatar, styles.initials, { backgroundColor: colors.surfaceStrong }]}><Text style={[styles.initialsText, { color: colors.text }]}>{initials}</Text></View>}<Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>{friend.displayName}</Text>{busy ? <ActivityIndicator color={colors.accent} /> : <View style={styles.friendActions}><Pressable onPress={onRemove} style={({ pressed }) => [styles.friendAction, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Remove ${friend.displayName} from friends`}><Text style={[styles.friendActionText, { color: colors.mutedText }]}>Remove</Text></Pressable><Pressable onPress={onBlock} style={({ pressed }) => [styles.friendAction, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Block ${friend.displayName}`}><Text style={styles.blockText}>Block</Text></Pressable></View>}</View>;
}

function BlockedRow({ friend, busy, onUnblock }: { friend: Friend; busy: boolean; onUnblock: () => void }) {
  const { colors } = useAppearance();
  return <View style={[styles.blockedRow, { borderColor: colors.surfaceStrong }]}><Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>{friend.displayName}</Text>{busy ? <ActivityIndicator color={colors.accent} /> : <Pressable onPress={onUnblock} style={({ pressed }) => [styles.friendAction, { borderColor: colors.surfaceStrong }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Unblock ${friend.displayName}`}><Text style={[styles.friendActionText, { color: colors.text }]}>Unblock</Text></Pressable>}</View>;
}

const styles = StyleSheet.create({
  headerButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, countBadge: { position: 'absolute', top: 4, right: 3, minWidth: 17, height: 17, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, countText: { fontSize: 9, fontWeight: '900' },
  scroll: { flex: 1 }, content: { paddingHorizontal: 24, paddingTop: 13, paddingBottom: 30 }, nameContent: { flexGrow: 1, justifyContent: 'center' }, nameSection: { width: '100%' }, nameTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -.5, textAlign: 'center' }, nameAnimation: { width: 270, height: 180, alignSelf: 'center', marginBottom: 8 }, nameInput: { height: 52, marginTop: 20, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14, fontSize: 16, fontWeight: '700' }, nameError: { marginTop: 8, fontSize: 12, color: '#D43A2F' }, nameButton: { height: 50, marginTop: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, nameButtonText: { fontSize: 15, fontWeight: '900' },
  codeCard: { padding: 22, borderRadius: 22 }, compactCard: { padding: 18, borderRadius: 18 }, codeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, opacity: .65 }, code: { marginTop: 7, fontSize: 34, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: 5 }, compactCode: { fontSize: 28 }, codeDivider: { height: 1, marginTop: 18, opacity: .18 }, addRow: { height: 40, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }, codeInput: { flex: 1, padding: 0, fontSize: 15, fontWeight: '800', letterSpacing: .2 }, addButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, error: { marginTop: 7, fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#FF9B8A' },
  feed: { gap: 14 }, feedCard: { padding: 18, borderRadius: 20 }, feedHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 }, feedPerson: { flex: 1 }, feedTime: { marginTop: 1, fontSize: 11, fontWeight: '700' }, feedKicker: { marginTop: 22, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, feedExercise: { marginTop: 5, fontSize: 20, fontWeight: '900', letterSpacing: -.6 }, feedWeight: { marginTop: 13, fontSize: 36, lineHeight: 39, fontWeight: '900', letterSpacing: -1.5 }, feedUnit: { fontSize: 12, letterSpacing: 0 }, feedReps: { marginTop: 1, fontSize: 12, fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.38)' }, sheet: { maxHeight: '88%', minHeight: '58%', borderTopLeftRadius: 26, borderTopRightRadius: 26 }, sheetHeader: { paddingHorizontal: 24, paddingTop: 21, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sheetTitle: { fontSize: 23, fontWeight: '900', letterSpacing: -.8 }, sheetCount: { marginTop: 2, fontSize: 12, fontWeight: '700' }, closeButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, sheetContent: { paddingHorizontal: 24, paddingBottom: 28 },
  friendList: { marginTop: 20, borderTopWidth: 1 }, friendRow: { minHeight: 67, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 14 }, initials: { alignItems: 'center', justifyContent: 'center' }, initialsText: { fontSize: 14, fontWeight: '900' }, friendName: { flex: 1, fontSize: 16, fontWeight: '900', letterSpacing: -.25 }, friendActions: { flexDirection: 'row', gap: 6 }, friendAction: { minHeight: 36, paddingHorizontal: 9, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, friendActionText: { fontSize: 11, fontWeight: '800' }, blockText: { color: '#D43A2F', fontSize: 11, fontWeight: '800' }, blockedSection: { marginTop: 30 }, sectionLabel: { marginBottom: 7, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, blockedRow: { minHeight: 55, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, emptyTitle: { marginTop: 10, fontSize: 19, fontWeight: '900', letterSpacing: -.5, textAlign: 'center' }, emptyCopy: { maxWidth: 260, marginTop: 5, textAlign: 'center', fontSize: 13, lineHeight: 19, fontWeight: '700' }, loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: .72, transform: [{ scale: .97 }] },
});
