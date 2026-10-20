import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "./theme";

// Public App Store screenshots, pulled from Apple's iTunes lookup API into public/inspiration/.
const APPS = [
  { name: "Strava", aspect: 1200 / 2133 },
  { name: "Gravl", aspect: 1200 / 2596 },
  { name: "Caliber", aspect: 1200 / 2597 },
].map((a) => {
  const id = a.name.toLowerCase();
  return { ...a, icon: staticFile(`inspiration/${id}-0.png`), shots: Array.from({ length: 10 }, (_, i) => staticFile(`inspiration/${id}-${i + 1}.jpg`)) };
});

const ROW_H = 300;
const ROW_GAP = 36;
const SHOT_GAP = 18;
const LABEL_W = 400; // white panel the rows drift under
const ENTER = 40;
const STAGGER = 20;
const DRIFT = 1.4; // px per frame, so the rows keep moving while you talk

export const INSPIRATION_FRAMES = 330;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const InspirationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const top0 = (height - (APPS.length * ROW_H + (APPS.length - 1) * ROW_GAP)) / 2;

  return (
    <AbsoluteFill style={{ background: "white", overflow: "hidden", fontFamily: FONT }}>
      {APPS.map((app, r) => {
        const enter = interpolate(frame - r * STAGGER, [0, ENTER], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        const w = ROW_H * app.aspect;
        const top = top0 + r * (ROW_H + ROW_GAP);
        // Alternate speeds a touch so the rows don't move as one block.
        const x = LABEL_W + 20 + (1 - enter) * width - frame * DRIFT * (1 + r * 0.15);
        return (
          <div key={app.name}>
            {[...app.shots, ...app.shots].map((src, i) => (
              <Img
                key={i}
                src={src}
                style={{
                  position: "absolute",
                  left: x + i * (w + SHOT_GAP),
                  top,
                  width: w,
                  height: ROW_H,
                  borderRadius: w * 0.075,
                  boxShadow: "0 6px 20px rgba(0,0,0,0.16), 0 1px 3px rgba(0,0,0,0.1)",
                }}
              />
            ))}
            {/* Label panel: rows slide under it on the left */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: top - 30,
                width: LABEL_W + 40,
                height: ROW_H + 60,
                background: `linear-gradient(to right, white ${(LABEL_W / (LABEL_W + 40)) * 100}%, rgba(255,255,255,0))`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 80,
                top,
                height: ROW_H,
                display: "flex",
                alignItems: "center",
                gap: 22,
                opacity: enter,
                translate: `${(1 - enter) * 40}px 0`,
              }}
            >
              <Img src={app.icon} style={{ width: 96, height: 96, borderRadius: 22, boxShadow: "0 4px 14px rgba(0,0,0,0.15)" }} />
              <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -0.8, color: C.ink }}>{app.name}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
