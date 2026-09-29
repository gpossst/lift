import { HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import { fixedSize, font, foregroundStyle, frame, padding, resizable } from '@expo/ui/swift-ui/modifiers';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo';

const widgets: typeof import('expo-widgets') | null = requireOptionalNativeModule('ExpoWidgets')
  // Keep the native import lazy so Expo Go and older development builds can load the workout route.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ? require('expo-widgets')
  : null;

type RestProps = { endsAt: number; markUri: string };

const RestLayout = ({ endsAt, markUri }: RestProps) => {
  'widget';
  const countdown = <Text timerInterval={{ lower: new Date(endsAt - 600_000), upper: new Date(endsAt) }} countsDown modifiers={[font({ weight: 'bold' })]} />;
  const compactCountdown = <Text timerInterval={{ lower: new Date(endsAt - 600_000), upper: new Date(endsAt) }} countsDown modifiers={[font({ size: 14, weight: 'semibold', design: 'monospaced' }), frame({ width: 45 })]} />;
  const mark = <Image uiImage={markUri} modifiers={[resizable(), frame({ width: 18, height: 18 }), fixedSize()]} />;
  return {
    banner: <HStack spacing={12} modifiers={[padding({ all: 16 })]}>
      {mark}
      <Text>Rest timer</Text>
      {countdown}
    </HStack>,
    compactLeading: mark,
    compactTrailing: compactCountdown,
    minimal: mark,
    expandedCenter: <VStack spacing={4} modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[foregroundStyle('#5194FF')]}>Rest timer</Text>
      {countdown}
    </VStack>,
  };
};

const RestActivity = widgets?.createLiveActivity<RestProps>('RestTimer', RestLayout);

let pending = Promise.resolve();
let markUri: string | null = null;

async function getMarkUri() {
  if (markUri) return markUri;
  if (!widgets?.widgetsDirectory) throw new Error('Widget shared directory is unavailable');
  const asset = await Asset.fromModule(require('../../assets/images/mark-island.png')).downloadAsync();
  if (!asset.localUri) throw new Error('Could not load the rest timer mark');
  const destination = new File(widgets.widgetsDirectory, 'lift-mark.png');
  await new File(asset.localUri).copy(destination, { overwrite: true });
  markUri = destination.uri;
  return markUri;
}

export function syncRestLiveActivity(endsAt: number | null) {
  if (!RestActivity) return;
  pending = pending.then(async () => {
    const instances = RestActivity.getInstances();
    if (endsAt === null || endsAt <= Date.now()) {
      await Promise.all(instances.map((instance) => instance.end('immediate')));
    } else {
      const props = { endsAt, markUri: await getMarkUri() };
      if (instances.length) {
        await Promise.all(instances.map((instance) => instance.update(props)));
      } else {
        RestActivity.start(props);
      }
    }
  }).catch((error) => { console.error('Rest Live Activity failed', error); });
}
