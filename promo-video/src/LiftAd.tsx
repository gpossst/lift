import { HtmlInCanvasMotionBlur } from "@remotion/motion-blur";
import { springTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LiftScene } from "./LiftScene";
import { TEDIOUS_FRAMES, TediousScene } from "./TediousScene";

export const TRANSITION_FRAMES = 14;
export const LIFT_FRAMES = 300 - TEDIOUS_FRAMES + TRANSITION_FRAMES;
const SLIDE_START = TEDIOUS_FRAMES - TRANSITION_FRAMES;
const SLIDE_SPRING = { config: { damping: 200 }, durationInFrames: TRANSITION_FRAMES };

export const LiftAd: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Frame-sampled blur for the frantic typing. More samples drift colors in
  // the canvas, so the slide gets a cheaper directional blur instead.
  const typingBlur = frame >= 120 && frame < SLIDE_START;
  const p = (f: number) => spring({ frame: f - SLIDE_START, fps, ...SLIDE_SPRING });
  const slideBlur = (p(frame + 0.5) - p(frame - 0.5)) * height * 0.2;

  return (
    <HtmlInCanvasMotionBlur width={width} height={height} samples={typingBlur ? 10 : 1} shutterAngle={typingBlur ? 270 : 0}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id="slide-blur" y="-10%" height="120%">
          <feGaussianBlur stdDeviation={`0 ${slideBlur}`} />
        </filter>
      </svg>
      <div style={{ position: "absolute", inset: 0, filter: slideBlur > 0.5 ? "url(#slide-blur)" : undefined }}>
        <TransitionSeries>
          <TransitionSeries.Sequence name="Tedious" durationInFrames={TEDIOUS_FRAMES} premountFor={fps}>
            <TediousScene />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition
            presentation={slide({ direction: "from-bottom" })}
            timing={springTiming(SLIDE_SPRING)}
          />
          <TransitionSeries.Sequence name="Lift" durationInFrames={LIFT_FRAMES} premountFor={fps}>
            <LiftScene />
          </TransitionSeries.Sequence>
        </TransitionSeries>
      </div>
    </HtmlInCanvasMotionBlur>
  );
};
