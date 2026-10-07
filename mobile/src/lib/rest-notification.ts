import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

const Notifications: typeof import('expo-notifications') | null = requireOptionalNativeModule('ExpoPushTokenManager')
  // Keep the native import lazy so Expo Go and builds without expo-notifications can load the workout route.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('expo-notifications')
  : null;

const ID = 'rest-timer-done';
let pending = Promise.resolve();

/** Ask up front (workout open) so the system prompt never interrupts the first rest. */
export function requestRestNotificationPermission() {
  if (!Notifications) return;
  void Notifications.getPermissionsAsync()
    .then(({ granted, canAskAgain }) => granted || !canAskAgain ? undefined : Notifications.requestPermissionsAsync())
    .catch(() => {});
}

/** Lets the OS buzz when rest ends while the app is backgrounded; foreground alerts stay in the workout screen. */
export function syncRestNotification(endsAt: number | null) {
  if (!Notifications) return;
  pending = pending.then(async () => {
    await Notifications.cancelScheduledNotificationAsync(ID);
    if (endsAt === null || endsAt <= Date.now()) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('rest', { name: 'Rest timer', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 400, 200, 400] });
    }
    await Notifications.scheduleNotificationAsync({
      identifier: ID,
      content: { title: 'Rest is over', body: 'Time for your next set.', sound: true, interruptionLevel: 'timeSensitive' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt), channelId: 'rest' },
    });
  }).catch((error) => { console.error('Rest notification failed', error); });
}
