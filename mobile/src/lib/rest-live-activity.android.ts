import { syncRestNotification } from './rest-notification';

export function syncRestLiveActivity(endsAt: number | null, _durationSeconds?: number) {
  syncRestNotification(endsAt);
}
