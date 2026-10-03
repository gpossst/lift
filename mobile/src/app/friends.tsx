import { ui } from '@/styles/primitives';
import { useFocusEffect } from 'expo-router';
import { Check, Heart, MessageCircle, Plus, Send, Users, X } from 'react-native-feather';
import Svg, { Path } from 'react-native-svg';
import LottieView from 'lottie-react-native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppearance } from '@/components/appearance-provider';
import { getExercises } from '@/db';
import { buildDemoFriendComments, buildDemoFriendRecords, demoFriendIdPrefix, isDemoDataEnabled } from '@/db/demo-data';
import { friendRecordKey, friendWorkoutKey, groupFriendRecords } from '@/lib/friend-record-groups';
import { addFriend, addFriendWorkoutComment, blockFriend, getFriendWorkoutComments, removeFriend, setFriendWorkoutLike, unblockFriend, type Friend, type FriendComment, type FriendPersonalRecord, type FriendsSummary } from '@/lib/friends';
import { loadFriendsPage, takeFriendsPage } from '@/lib/friends-page';
import { updateProfile } from '@/lib/profile';
import { authClient } from '@/lib/auth-client';

const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);

export default function FriendsScreen() {
  const { colors } = useAppearance();
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
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

  const load = useCallback(async (fresh = false) => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const { profile, code: nextCode, friends: nextFriends, records: nextRecords } = await (fresh ? loadFriendsPage() : takeFriendsPage(userId));
      setHasChosenDisplayName(profile.hasChosenDisplayName);
      if (!nameDirtyRef.current) setDisplayName(profile.hasChosenDisplayName ? profile.displayName : '');
      if (!profile.hasChosenDisplayName) {
        setFriendCode(null);
        setFriends(null);
        setRecords([]);
        return;
      }
      setFriendCode(nextCode);
      setFriends(nextFriends);
      setRecords((current) => isDemoDataEnabled ? [...nextRecords, ...buildDemoFriendRecords().map((sample) => {
        const previous = current.find((record) => friendWorkoutKey(record) === friendWorkoutKey(sample));
        return previous ? { ...sample, liked: previous.liked, likeCount: previous.likeCount, commentCount: previous.commentCount } : sample;
      })] : nextRecords);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load friends.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
      if (profile.hasChosenDisplayName) await load(true);
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
      </View> : loading && !friends ? <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View> : hasChosenDisplayName && friends?.count === 0 && !isDemoDataEnabled ? <View style={styles.empty}><Users width={27} height={27} color={colors.subtleText} strokeWidth={2.3} /><Text style={[styles.emptyTitle, { color: colors.text }]}>Your feed is waiting</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Open your friends list to add a friend and see their lifting highlights.</Text></View> : hasChosenDisplayName && <FriendFeed records={records} onChange={setRecords} ownDisplayName={displayName} />}
    </ScrollView>

    <Modal visible={showFriends} transparent animationType="none" onRequestClose={() => setShowFriends(false)}>
      <View style={[styles.modalOverlay, styles.clearOverlay]}>
        <Animated.View entering={FadeIn.duration(180)} style={styles.friendsBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFriends(false)} accessibilityLabel="Close friends list" />
        </Animated.View>
        <AnimatedSafeAreaView entering={SlideInDown.duration(280)} edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.text }]}>Your friends</Text><Text style={[styles.sheetCount, { color: colors.mutedText }]}>{friends?.count ?? 0} friend{friends?.count === 1 ? '' : 's'}</Text></View><Pressable onPress={() => setShowFriends(false)} style={({ pressed }) => [styles.closeButton, { backgroundColor: colors.surface }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Close friends list"><X width={20} height={20} color={colors.text} strokeWidth={2.5} /></Pressable></View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
            <AddFriendCard code={code} friendCode={friendCode} adding={adding} error={error} onChangeCode={setCode} onSubmit={() => void submit()} />
            {!!friends?.users.length && <View style={[styles.friendList, { borderColor: colors.surfaceStrong }]}>{friends.users.map((friend) => <FriendRow key={friend.id} friend={friend} busy={updatingFriend?.endsWith(`:${friend.id}`) ?? false} onRemove={() => void updateConnection(friend, 'remove')} onBlock={() => void updateConnection(friend, 'block')} />)}</View>}
            {!!friends?.blocked.length && <View style={styles.blockedSection}><Text style={[styles.sectionLabel, { color: colors.mutedText }]}>BLOCKED</Text>{friends.blocked.map((friend) => <BlockedRow key={friend.id} friend={friend} busy={updatingFriend === `unblock:${friend.id}`} onUnblock={() => void updateConnection(friend, 'unblock')} />)}</View>}
          </ScrollView>
        </AnimatedSafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}

function AddFriendCard({ code, friendCode, adding, error, onChangeCode, onSubmit }: { code: string; friendCode: string | null; adding: boolean; error: string | null; onChangeCode: (code: string) => void; onSubmit: () => void }) {
  const { colors } = useAppearance();
  return <View style={[styles.codeCard, { backgroundColor: colors.inverse }]}>
    <View style={styles.codeHeader}><View><Text style={[styles.cardLabel, { color: colors.inverseText }]}>YOUR CODE</Text><Text selectable style={[styles.code, { color: colors.inverseText }]}>{friendCode ?? '— — — — — —'}</Text></View><Plus width={22} height={22} color={colors.inverseText} strokeWidth={2.5} /></View>
    <View style={[styles.codeDivider, { backgroundColor: colors.inverseText }]} />
    <View style={styles.addRow}>
      <TextInput value={code} onChangeText={(value) => onChangeCode(value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={6} placeholder="Enter a friend’s code" placeholderTextColor={colors.inverseText} style={[styles.codeInput, { color: colors.inverseText }]} accessibilityLabel="Friend code" accessibilityHint="Enter the six-character code your friend shared" returnKeyType="done" onSubmitEditing={onSubmit} />
      <Pressable onPress={onSubmit} disabled={code.length !== 6 || adding} style={({ pressed }) => [styles.addButton, { backgroundColor: code.length === 6 ? colors.accent : colors.inverseText }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Add friend">{adding ? <ActivityIndicator color={colors.accentText} /> : <Check width={20} height={20} color={code.length === 6 ? colors.accentText : colors.inverse} strokeWidth={3} />}</Pressable>
    </View>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

function FriendFeed({ records, onChange, ownDisplayName }: { records: FriendPersonalRecord[]; onChange: (records: FriendPersonalRecord[] | ((current: FriendPersonalRecord[]) => FriendPersonalRecord[])) => void; ownDisplayName: string }) {
  const { colors } = useAppearance();
  const exercises = new Map(getExercises().map((exercise) => [exercise.id, exercise.name]));
  const [selected, setSelected] = useState<FriendPersonalRecord | null>(null);
  const [comments, setComments] = useState<FriendComment[]>([]);
  const [demoComments, setDemoComments] = useState(buildDemoFriendComments);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const keyFor = friendWorkoutKey;
  const updateWorkout = (workout: FriendPersonalRecord, update: Partial<FriendPersonalRecord>) => onChange((current) => current.map((item) => keyFor(item) === keyFor(workout) ? { ...item, ...update } : item));
  const toggleLike = async (workout: FriendPersonalRecord) => {
    if (workout.id.startsWith(demoFriendIdPrefix)) {
      updateWorkout(workout, { liked: !workout.liked, likeCount: workout.likeCount + (workout.liked ? -1 : 1) });
      return;
    }
    const key = keyFor(workout);
    if (busy === key) return;
    setBusy(key);
    try {
      const result = await setFriendWorkoutLike(workout, !workout.liked);
      updateWorkout(workout, result);
    } catch (reason) {
      setCommentError(reason instanceof Error ? reason.message : 'Could not update like.');
    } finally { setBusy(null); }
  };
  const openComments = async (workout: FriendPersonalRecord) => {
    setSelected(workout);
    setComments(workout.id.startsWith(demoFriendIdPrefix) ? demoComments[keyFor(workout)] ?? [] : []);
    setDraft('');
    setCommentError(null);
    if (workout.id.startsWith(demoFriendIdPrefix)) return;
    try {
      const result = await getFriendWorkoutComments(workout);
      setComments(result.comments);
      updateWorkout(workout, { commentCount: result.commentCount });
    } catch (reason) { setCommentError(reason instanceof Error ? reason.message : 'Could not load comments.'); }
  };
  const submitComment = async () => {
    if (!selected || !draft.trim() || busy) return;
    if (selected.id.startsWith(demoFriendIdPrefix)) {
      const next = [...comments, { id: `demo-comment-${Date.now()}`, body: draft.trim(), createdAt: Math.floor(Date.now() / 1000), displayName: ownDisplayName || 'You', imageUrl: null, mine: true }];
      setComments(next);
      setDemoComments((current) => ({ ...current, [keyFor(selected)]: next }));
      updateWorkout(selected, { commentCount: next.length });
      setDraft('');
      return;
    }
    setBusy('comment');
    setCommentError(null);
    try {
      const result = await addFriendWorkoutComment(selected, draft.trim());
      setComments(result.comments);
      updateWorkout(selected, { commentCount: result.commentCount });
      setDraft('');
    } catch (reason) { setCommentError(reason instanceof Error ? reason.message : 'Could not post comment.'); }
    finally { setBusy(null); }
  };
  if (!records.length) return <View style={styles.empty}><Text style={[styles.emptyTitle, { color: colors.text }]}>No updates yet</Text><Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Your friends’ workout highlights will show up here.</Text></View>;
  return <View>
    <Text style={[styles.feedTitle, { color: colors.text }]}>Recent activity</Text>
    {groupFriendRecords(records).map((workout) => {
    const latest = workout.records[workout.records.length - 1];
    const initials = latest.displayName.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'L';
    return <View key={workout.key} style={[styles.feedCard, { borderColor: colors.surfaceStrong }]}>
      <View style={styles.feedHeader}>{latest.imageUrl ? <Image source={{ uri: latest.imageUrl }} style={styles.avatar} accessibilityLabel={`${latest.displayName}'s profile photo`} /> : <View style={[styles.avatar, styles.initials, { backgroundColor: colors.surfaceStrong }]}><Text style={[styles.initialsText, { color: colors.text }]}>{initials}</Text></View>}<View style={styles.feedPerson}><Text style={[styles.friendName, { color: colors.text }]} numberOfLines={1}>{latest.displayName}</Text><Text style={[styles.feedTime, { color: colors.mutedText }]}>{formatUpdateTime(latest.completedAt)}{latest.id.startsWith(demoFriendIdPrefix) ? ' · Sample' : ''}</Text></View></View>
      <View style={styles.recordTimeline}>{workout.records.map((record) => <View key={friendRecordKey(record)} style={styles.timelineRow}>
        <View style={styles.timelineRail}>
          <View style={[styles.trophyMark, { backgroundColor: colors.accent }]}><TrophyIcon color={colors.accentText} /></View>
        </View>
        <View style={styles.timelineContent}>
          <Text style={[styles.feedExercise, { color: colors.text }]}>{exercises.get(record.exerciseId) ?? 'Exercise'}</Text>
          <Text style={[styles.recordResult, { color: colors.mutedText }]}>{record.weight} lb × {record.reps}</Text>
        </View>
      </View>)}</View>
      <View style={styles.recordActions}>
        <Pressable onPress={() => void toggleLike(latest)} disabled={busy === keyFor(latest)} style={({ pressed }) => [styles.feedAction, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${latest.liked ? 'Unlike' : 'Like'} ${latest.displayName}'s workout`} accessibilityState={{ selected: latest.liked }}><Heart width={18} height={18} color={latest.liked ? colors.accent : colors.mutedText} fill={latest.liked ? colors.accent : 'none'} strokeWidth={2.2} /><Text style={[styles.feedActionText, { color: latest.liked ? colors.text : colors.mutedText }]}>{latest.likeCount ? `${latest.likeCount} Like${latest.likeCount === 1 ? '' : 's'}` : 'Like'}</Text></Pressable>
        <Pressable onPress={() => void openComments(latest)} style={({ pressed }) => [styles.feedAction, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Comment on ${latest.displayName}'s workout`}><MessageCircle width={18} height={18} color={colors.mutedText} strokeWidth={2.2} /><Text style={[styles.feedActionText, { color: colors.mutedText }]}>{latest.commentCount ? `${latest.commentCount} Comment${latest.commentCount === 1 ? '' : 's'}` : 'Comment'}</Text></Pressable>
      </View>
    </View>;
  })}
    {commentError && !selected && <Text accessibilityRole="alert" style={styles.commentError}>{commentError}</Text>}
    <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} accessibilityLabel="Close comments" />
        <SafeAreaView edges={['bottom']} style={[styles.sheet, styles.commentsSheet, { backgroundColor: colors.background }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.surfaceStrong }]} />
          <View style={styles.sheetHeader}>
            <View><Text style={[styles.sheetTitle, { color: colors.text }]}>Comments</Text><Text style={[styles.sheetCount, { color: colors.mutedText }]}>{selected ? `${selected.displayName}'s workout` : ''}</Text></View>
            <Pressable onPress={() => setSelected(null)} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close comments"><X width={20} height={20} color={colors.text} /></Pressable>
          </View>
          <ScrollView style={styles.commentsList} contentContainerStyle={styles.commentsContent} keyboardShouldPersistTaps="handled">
            {!comments.length && !commentError && <Text style={[styles.emptyCopy, { color: colors.mutedText }]}>Be the first to cheer them on.</Text>}
            {comments.map((comment) => <View key={comment.id} style={styles.commentRow}>
              {comment.imageUrl ? <Image source={{ uri: comment.imageUrl }} style={styles.commentAvatar} /> : <View style={[styles.commentAvatar, styles.initials, { backgroundColor: colors.surfaceStrong }]}><Text style={[styles.initialsText, { color: colors.text }]}>{comment.displayName.trim().charAt(0).toUpperCase()}</Text></View>}
              <View style={styles.commentContent}><View style={styles.commentMeta}><Text style={[styles.commentName, { color: colors.text }]}>{comment.displayName}</Text><Text style={[styles.feedTime, { color: colors.mutedText }]}>{formatUpdateTime(comment.createdAt)}</Text></View><Text style={[styles.commentBody, { color: colors.text }]}>{comment.body}</Text></View>
            </View>)}
          </ScrollView>
          {commentError && <Text accessibilityRole="alert" style={styles.commentError}>{commentError}</Text>}
          <View style={styles.commentComposer}><View style={[styles.commentField, { backgroundColor: colors.surface }]}><TextInput value={draft} onChangeText={setDraft} maxLength={280} multiline placeholder="Add a comment" placeholderTextColor={colors.mutedText} style={[styles.commentInput, { color: colors.text }]} accessibilityLabel="Add a comment" /></View><Pressable onPress={() => void submitComment()} disabled={!draft.trim() || !!busy} style={[styles.sendButton, { backgroundColor: draft.trim() ? colors.accent : colors.surfaceStrong }]} accessibilityRole="button" accessibilityLabel="Post comment">{busy === 'comment' ? <ActivityIndicator color={colors.accentText} /> : <Send width={19} height={19} color={draft.trim() ? colors.accentText : colors.mutedText} strokeWidth={2.4} />}</Pressable></View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

function TrophyIcon({ color }: { color: string }) {
  return <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d="M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4M12 15v4m-4 2h8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
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
  codeCard: { padding: 18, borderRadius: 18 }, codeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, cardLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, opacity: .65 }, code: { marginTop: 7, fontSize: 28, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: 5 }, codeDivider: { height: 1, marginTop: 10, opacity: .18 }, addRow: { height: 40, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }, codeInput: { flex: 1, padding: 0, fontSize: 15, fontWeight: '800', letterSpacing: .2 }, addButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, error: { marginTop: 7, fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#FF9B8A' },
  feedTitle: { marginBottom: 18, fontSize: 23, fontWeight: '900', letterSpacing: -.7 }, feedCard: { paddingBottom: 18, marginBottom: 22, borderBottomWidth: 1 }, feedHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 }, feedPerson: { flex: 1 }, feedTime: { marginTop: 1, fontSize: 11, fontWeight: '700' }, recordTimeline: { marginTop: 15 }, timelineRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11 }, timelineRail: { width: 28, alignItems: 'center' }, trophyMark: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, timelineContent: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8 }, feedExercise: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '900', letterSpacing: -.3 }, recordResult: { fontSize: 13, fontWeight: '800', textAlign: 'right' }, recordActions: { marginTop: 9, flexDirection: 'row', gap: 22 }, feedAction: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 }, feedActionText: { fontSize: 12, fontWeight: '800' }, commentsSheet: { height: '70%', maxHeight: '85%' }, sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10 }, commentsList: { flex: 1 }, commentsContent: { paddingHorizontal: 24, paddingBottom: 20 }, commentRow: { flexDirection: 'row', gap: 10, marginBottom: 20 }, commentAvatar: { width: 34, height: 34, borderRadius: 17 }, commentContent: { flex: 1 }, commentMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 8 }, commentName: { fontSize: 13, fontWeight: '900' }, commentBody: { marginTop: 3, fontSize: 14, lineHeight: 20, fontWeight: '600' }, commentError: { paddingHorizontal: 24, paddingBottom: 7, color: '#D43A2F', fontSize: 12, fontWeight: '700' }, commentComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 24, paddingTop: 13, paddingBottom: 18 }, commentField: { flex: 1, minHeight: 44, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, justifyContent: 'center' }, commentInput: { maxHeight: 88, padding: 0, fontSize: 14, fontWeight: '600', textAlignVertical: 'center' }, sendButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.38)' }, clearOverlay: { backgroundColor: 'transparent' }, friendsBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,.38)' }, sheet: { maxHeight: '88%', minHeight: '58%', borderTopLeftRadius: 26, borderTopRightRadius: 26 }, sheetHeader: { paddingHorizontal: 24, paddingTop: 21, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sheetTitle: { fontSize: 23, fontWeight: '900', letterSpacing: -.8 }, sheetCount: { marginTop: 2, fontSize: 12, fontWeight: '700' }, closeButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, sheetContent: { paddingHorizontal: 24, paddingBottom: 28 },
  friendList: { marginTop: 20, borderTopWidth: 1 }, friendRow: { minHeight: 67, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 14 }, initials: { alignItems: 'center', justifyContent: 'center' }, initialsText: { fontSize: 14, fontWeight: '900' }, friendName: { flex: 1, fontSize: 16, fontWeight: '900', letterSpacing: -.25 }, friendActions: { flexDirection: 'row', gap: 6 }, friendAction: { minHeight: 36, paddingHorizontal: 9, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, friendActionText: { fontSize: 11, fontWeight: '800' }, blockText: { color: '#D43A2F', fontSize: 11, fontWeight: '800' }, blockedSection: { marginTop: 30 }, sectionLabel: { marginBottom: 7, fontSize: 10, fontWeight: '900', letterSpacing: 1 }, blockedRow: { minHeight: 55, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }, emptyTitle: { marginTop: 10, fontSize: 19, fontWeight: '900', letterSpacing: -.5, textAlign: 'center' }, emptyCopy: { maxWidth: 260, marginTop: 5, textAlign: 'center', fontSize: 13, lineHeight: 19, fontWeight: '700' }, loading: { minHeight: 220, alignItems: 'center', justifyContent: 'center' }, pressed: { opacity: .72, transform: [{ scale: .97 }] },
});
