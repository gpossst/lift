import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Headline } from "./Headline";
import { C, FONT } from "./theme";

const STEPS = [
  { at: 10, text: "Enter reps" },
  { at: 42, text: "Log the set" },
  { at: 72, text: "See what's next" },
];

// The middle of the frame is left empty for the app screen recording.
export const LiftScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = (from: number, damping = 11) =>
    spring({ frame: frame - from, fps, config: { damping, mass: 0.5 } });
  const step = [...STEPS].reverse().find((s) => frame >= s.at);

  return (
    <AbsoluteFill style={{ background: C.ink, fontFamily: FONT }}>
      <Img
        src={staticFile("logo.svg")}
        style={{
          position: "absolute",
          top: 110,
          left: (1080 - 300) / 2,
          width: 300,
          transform: `scale(${pop(0, 14)})`,
        }}
      />

      {step && (
        <div
          key={step.text}
          style={{
            position: "absolute",
            top: 250,
            width: "100%",
            textAlign: "center",
            fontSize: 56,
            fontWeight: 800,
            color: "white",
            transform: `scale(${pop(step.at, 9)})`,
          }}
        >
          {step.text}
        </div>
      )}

      <Headline text="Stay focused on your workout." from={98} color={C.yellow} top={1520} />
    </AbsoluteFill>
  );
};
