import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const SHOTS = [1, 2, 3, 4, 5, 6, 7].map((i) => staticFile(`screenshots/${i}.png`));
const W = 460; // card size in "world" units (screenshots are 1320×2868)
const H = W * (2868 / 1320);
const GAP = 44;
const PAD = 80; // screen-space margin once everything fits
const SPAN = SHOTS.length * W + (SHOTS.length - 1) * GAP;
const START_SCALE = 1040 / H; // first card nearly fills the frame height
const ENTER = 30; // frames for one card to slide in
const ENTER_STAGGER = 14;
const SETTLED = (SHOTS.length - 1) * ENTER_STAGGER + ENTER;
const HL_START = SETTLED + 12;
const HL_STAGGER = 3;
const HL_IN = 18;
const HL_HOLD = 60;
const TEXT_BAND = 0.203; // top fraction of each screenshot holding the headline

export const SCREENSHOTS_FRAMES = HL_START + (SHOTS.length - 1) * HL_STAGGER + HL_IN * 2 + HL_HOLD + 30;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const ScreenshotsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // One continuous camera move (zoom out in log space + pan) over the whole entrance, so it never lurches per card.
  const cam = interpolate(frame, [0, SETTLED], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const endScale = (width - PAD * 2) / SPAN;
  const s = START_SCALE * (endScale / START_SCALE) ** cam;
  const cx = cam * (SPAN / 2 - W / 2);
  const w = W * s;
  const h = H * s;

  return (
    <AbsoluteFill style={{ background: "white", overflow: "hidden" }}>
      {SHOTS.map((src, i) => {
        const enter = interpolate(frame - i * ENTER_STAGGER, [0, ENTER], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        const t = frame - HL_START - i * HL_STAGGER;
        const hl = interpolate(t, [0, HL_IN, HL_IN + HL_HOLD, HL_IN * 2 + HL_HOLD], [0, 1, 1, 0], {
          ...clamp,
          easing: Easing.inOut(Easing.cubic),
        });
        // Highlight crops each card down to its headline and recenters the strip vertically.
        const visible = h * (1 - hl * (1 - TEXT_BAND));
        const x = width / 2 + (i * (W + GAP) - cx) * s - w / 2 + (1 - enter) * (width + w);
        return (
          <div
            key={src}
            style={{
              position: "absolute",
              left: x,
              top: (height - visible) / 2,
              width: w,
              height: visible,
              borderRadius: w * 0.075,
              overflow: "hidden",
              boxShadow: "0 8px 28px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.12)",
            }}
          >
            <Img src={src} style={{ width: w, height: h, display: "block" }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
