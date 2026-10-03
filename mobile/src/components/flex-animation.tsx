import LottieView, { type AnimationObject } from 'lottie-react-native';
import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useAppearance } from '@/components/appearance-provider';

// flex.json's only visible paint is a #5194FF fill (the Blue accent); strokes are
// transparent. Retint fills to the active accent so the art matches the theme.
const flexBlue: [number, number, number] = [0.3176470588235294, 0.5803921568627451, 1];
function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const n = Number.parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function tintFlexFills(source: AnimationObject, hex: string): AnimationObject {
  const clone = JSON.parse(JSON.stringify(source)) as unknown;
  const [r, g, b] = hexToRgb(hex);
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      if (o['ty'] === 'fl' && o['c'] && typeof o['c'] === 'object') {
        const k = (o['c'] as Record<string, unknown>)['k'];
        if (Array.isArray(k) && k.length === 4 && k.every((v) => typeof v === 'number')
          && Math.abs((k[0] as number) - flexBlue[0]) < 0.01 && Math.abs((k[1] as number) - flexBlue[1]) < 0.01 && Math.abs((k[2] as number) - flexBlue[2]) < 0.01) {
          (o['c'] as Record<string, unknown>)['k'] = [r, g, b, k[3]];
        }
      }
      Object.values(o).forEach(visit);
    }
  };
  visit(clone);
  return clone as AnimationObject;
}

/** The looping flex art, tinted to the active accent. */
export function FlexAnimation({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useAppearance();
  const source = useMemo(() => tintFlexFills(require('../../assets/flex.json'), colors.accent), [colors.accent]);
  return <LottieView autoPlay loop resizeMode="contain" source={source} style={style} />;
}
