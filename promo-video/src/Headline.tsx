import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "./theme";

// Pops in with an overshoot at `from` (frame within the parent sequence).
export const Headline: React.FC<{
  text: string;
  from: number;
  color: string;
  top: number;
}> = ({ text, from, color, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - from, fps, config: { damping: 9, mass: 0.6 } });
  if (frame < from) return null;
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 80,
        right: 80,
        textAlign: "center",
        fontFamily: FONT,
        fontWeight: 900,
        fontSize: 104,
        lineHeight: 1.02,
        letterSpacing: -3,
        color,
        transform: `scale(${s}) rotate(${(1 - s) * -6}deg)`,
      }}
    >
      {text}
    </div>
  );
};
