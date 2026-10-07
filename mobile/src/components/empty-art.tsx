import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useAppearance } from '@/components/appearance-provider';

export type EmptyArtName = 'logbook' | 'chart' | 'search' | 'friends' | 'offline' | 'rack';

// Same flat palette as the calendar (return-plan.json) and barbell (barbell-load.json) animations.
const paper = '#FFFFFF';
const line = '#E0E3DE';
const metal = '#8F969E';
const ink = '#171A14';

/** Decorative empty-state art: flat shapes on an accent circle. */
export function EmptyArt({ name, width = 180 }: { name: EmptyArtName; width?: number }) {
  const { colors } = useAppearance();
  return <Svg width={width} height={width * 2 / 3} viewBox="0 0 240 160" style={{ alignSelf: 'center', marginBottom: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Circle cx={120} cy={84} r={68} fill={colors.accent} />
    {art[name]}
  </Svg>;
}

const art: Record<EmptyArtName, React.ReactNode> = {
  logbook: <>
    <Rect x={74} y={32} width={92} height={104} rx={12} fill={paper} />
    <Rect x={74} y={32} width={22} height={104} rx={12} fill={metal} />
    <Rect x={86} y={32} width={10} height={104} fill={metal} />
    <Rect x={66} y={50} width={18} height={8} rx={4} fill={ink} />
    <Rect x={66} y={80} width={18} height={8} rx={4} fill={ink} />
    <Rect x={66} y={110} width={18} height={8} rx={4} fill={ink} />
    <Rect x={108} y={52} width={44} height={10} rx={5} fill={line} />
    <Rect x={108} y={74} width={44} height={10} rx={5} fill={line} />
    <Rect x={108} y={96} width={28} height={10} rx={5} fill={line} />
  </>,
  chart: <>
    <Rect x={65} y={40} width={110} height={88} rx={12} fill={paper} />
    <Rect x={79} y={68} width={82} height={4} rx={2} fill={line} />
    <Rect x={79} y={92} width={82} height={4} rx={2} fill={line} />
    <Path d="M80 58L101 74L119 68L140 94L158 106" fill="none" stroke="#FF5151" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
  </>,
  search: <>
    <Rect x={136.6} y={92.6} width={16} height={36} rx={8} fill={ink} transform="rotate(-45 144.6 110.6)" />
    <Circle cx={110} cy={74} r={34} fill={metal} />
    <Circle cx={110} cy={74} r={25} fill={paper} opacity={0.9} />
  </>,
  friends: <>
    <Rect x={66} y={34} width={108} height={56} rx={12} fill={paper} />
    <Circle cx={88} cy={62} r={11} fill={ink} />
    <Rect x={106} y={52} width={52} height={8} rx={4} fill={line} />
    <Rect x={106} y={66} width={34} height={8} rx={4} fill={line} />
    <Rect x={66} y={98} width={108} height={38} rx={12} fill={paper} opacity={0.55} />
    <Circle cx={88} cy={117} r={9} fill={metal} />
    <Rect x={106} y={113} width={44} height={8} rx={4} fill={paper} opacity={0.8} />
  </>,
  offline: <>
    <Rect x={74} y={66} width={96} height={28} rx={14} fill={paper} />
    <Circle cx={102} cy={66} r={18} fill={paper} />
    <Circle cx={132} cy={56} r={24} fill={paper} />
    <Circle cx={154} cy={70} r={14} fill={paper} />
    <Rect x={85} y={104} width={6} height={12} rx={3} fill={paper} transform="rotate(20 88 110)" />
    <Rect x={103} y={104} width={6} height={12} rx={3} fill={paper} transform="rotate(20 106 110)" />
    <Rect x={121} y={104} width={6} height={12} rx={3} fill={paper} transform="rotate(20 124 110)" />
    <Rect x={139} y={104} width={6} height={12} rx={3} fill={paper} transform="rotate(20 142 110)" />
    <Rect x={157} y={104} width={6} height={12} rx={3} fill={paper} transform="rotate(20 160 110)" />
    <Rect x={94} y={124} width={6} height={12} rx={3} fill={paper} transform="rotate(20 97 130)" />
    <Rect x={112} y={124} width={6} height={12} rx={3} fill={paper} transform="rotate(20 115 130)" />
    <Rect x={130} y={124} width={6} height={12} rx={3} fill={paper} transform="rotate(20 133 130)" />
    <Rect x={148} y={124} width={6} height={12} rx={3} fill={paper} transform="rotate(20 151 130)" />
  </>,
  rack: <>
    <Rect x={60} y={64} width={120} height={6} rx={3} fill={paper} opacity={0.5} />
    <Rect x={78} y={34} width={84} height={8} rx={4} fill={metal} />
    <Rect x={78} y={34} width={10} height={104} rx={4} fill={metal} />
    <Rect x={152} y={34} width={10} height={104} rx={4} fill={metal} />
    <Rect x={88} y={70} width={12} height={6} rx={3} fill={ink} />
    <Rect x={140} y={70} width={12} height={6} rx={3} fill={ink} />
    <Rect x={94} y={62} width={6} height={14} rx={3} fill={ink} />
    <Rect x={140} y={62} width={6} height={14} rx={3} fill={ink} />
    <Rect x={66} y={106} width={12} height={6} rx={3} fill={ink} />
    <Rect x={162} y={106} width={12} height={6} rx={3} fill={ink} />
    <Rect x={66} y={134} width={34} height={8} rx={4} fill={ink} />
    <Rect x={140} y={134} width={34} height={8} rx={4} fill={ink} />
  </>,
};
