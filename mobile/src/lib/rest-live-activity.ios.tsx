import { ProgressView, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, monospacedDigit, padding, progressViewStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { requireOptionalNativeModule } from 'expo';
import { syncRestNotification } from './rest-notification';

const widgets: typeof import('expo-widgets') | null = requireOptionalNativeModule('ExpoWidgets')
  // Keep the native import lazy so Expo Go and older development builds can load the workout route.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('expo-widgets')
  : null;

type RestProps = { startedAt: number; endsAt: number };

const RestLayout = ({ startedAt, endsAt }: RestProps) => {
  'widget';
  const interval = { lower: new Date(startedAt), upper: new Date(endsAt) };
  const countdown = (size: number) => <Text timerInterval={interval} countsDown modifiers={[font({ size, weight: 'semibold', design: 'rounded' }), monospacedDigit(), foregroundStyle('#5194FF')]} />;
  const ring = <ProgressView timerInterval={interval} countsDown modifiers={[progressViewStyle('circular'), tint('#5194FF'), frame({ width: 18, height: 18 })]} />;
  const bar = <ProgressView timerInterval={interval} countsDown modifiers={[progressViewStyle('linear'), tint('#5194FF')]} />;
  const full = <VStack spacing={10} modifiers={[padding({ all: 16 })]}>{countdown(44)}{bar}</VStack>;
  return {
    banner: full,
    compactLeading: ring,
    compactTrailing: <Text timerInterval={interval} countsDown modifiers={[font({ size: 15, weight: 'semibold', design: 'rounded' }), monospacedDigit(), foregroundStyle('#5194FF'), frame({ width: 44 })]} />,
    minimal: ring,
    expandedCenter: full,
  };
};

const RestActivity = widgets?.createLiveActivity<RestProps>('RestTimer', RestLayout);

let pending = Promise.resolve();

export function syncRestLiveActivity(endsAt: number | null, durationSeconds = 0) {
  syncRestNotification(endsAt);
  if (!RestActivity) return;
  pending = pending.then(async () => {
    const instances = RestActivity.getInstances();
    if (endsAt === null || endsAt <= Date.now()) {
      await Promise.all(instances.map((instance) => instance.end('immediate')));
    } else {
      const props = { startedAt: endsAt - durationSeconds * 1_000, endsAt };
      if (instances.length) {
        await Promise.all(instances.map((instance) => instance.update(props, new Date(endsAt))));
      } else {
        RestActivity.start(props, undefined, new Date(endsAt));
      }
    }
  }).catch((error) => { console.error('Rest Live Activity failed', error); });
}
