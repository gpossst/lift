import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "./theme";

// Screenshots are 1320x2868 (compositions match); each card is its pixel bounds in that screenshot.
const SHOT = { w: 1320, h: 2868 };
type Card = { x: number; y: number; w: number; h: number; r: number };
export const COVERAGE_LOCK = { src: "screenshots/3.png", card: { x: 103, y: 805, w: 1113, h: 1117, r: 56 } };
export const CHART_LOCK = { src: "screenshots/5.png", card: { x: 23, y: 1362, w: 1276, h: 948, r: 56 } };

export const LOCKED_COVERAGE_FRAMES = 150;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const LockedCoverageScene: React.FC<{ src: string; card: Card }> = ({ src, card: CARD }) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const s = height / SHOT.h;
  const left = (width - SHOT.w * s) / 2;

  const blur = interpolate(frame, [20, 50], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const pop = spring({ frame: frame - 38, fps, config: { damping: 12, stiffness: 160 } });
  // Shackle drops into the body, then a small thunk on the badge.
  const shut = interpolate(frame, [58, 66], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const thunk = spring({ frame: frame - 66, fps, config: { damping: 8, stiffness: 300 } });
  const badgeScale = pop * (1 + 0.08 * Math.sin(thunk * Math.PI));
  const pill = interpolate(frame, [70, 88], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: FONT }}>
      <Img src={staticFile(src)} style={{ position: "absolute", left, top: 0, width: SHOT.w * s, height }} />
      <div
        style={{
          position: "absolute",
          left: left + CARD.x * s,
          top: CARD.y * s,
          width: CARD.w * s,
          height: CARD.h * s,
          borderRadius: CARD.r * s,
          overflow: "hidden",
          backdropFilter: `blur(${blur * 22}px) saturate(${1 - blur * 0.35})`,
          background: `rgba(249,249,247,${blur * 0.35})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
        }}
      >
        <div
          style={{
            width: 168,
            height: 168,
            borderRadius: 84,
            background: C.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            scale: String(badgeScale),
            boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
          }}
        >
          <svg width="84" height="84" viewBox="0 0 24 24" overflow="visible" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round">
            {/* open shackle sits 3 units high and swung right; shut = closed */}
            <path
              d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11"
              style={{ translate: `0 ${(1 - shut) * -3}px`, rotate: `${(1 - shut) * 18}deg`, transformOrigin: "16.5px 11px" }}
            />
            <rect x="4.5" y="11" width="15" height="10" rx="2.5" fill="white" stroke="none" />
          </svg>
        </div>
        <div
          style={{
            opacity: pill,
            translate: `0 ${(1 - pill) * 24}px`,
            padding: "18px 34px",
            borderRadius: 999,
            background: C.blue,
            color: "white",
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: -0.4,
            boxShadow: "0 10px 24px rgba(81,148,255,0.35)",
          }}
        >
          Unlock with Lift Pro
        </div>
      </div>
    </AbsoluteFill>
  );
};
