import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import { useEffect, useState } from "react";
import {
  AbsoluteFill, Freeze, Img, Sequence, cancelRender, continueRender, delayRender,
  spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";

// flex-red.json is mobile/assets/flex.json with its blue fill retinted to the red accent.
// wordmark.svg is logo.svg minus the static arm; the flex animation takes the arm's place.
const BG = "#151612"; // app dark-mode background
const INTRO = 24; // frames the arm spends popping in before it starts flexing
const FLEX = 54; // one loop of flex.json: 36 frames @ 20fps = 1.8s
const HOLD = 30;
export const LOGO_REVEAL_FRAMES = INTRO + FLEX + HOLD;

const LOGO_W = 1000;
const LOGO_H = (LOGO_W * 610) / 2050; // logo.svg viewBox aspect
// The static arm sits at (0.4%, 0.85%) of the logo width and is 28.3% wide; the Lottie's
// rest-pose arm spans 744 units starting at (585, 169) of its 1920x1080 canvas.
const ARM = LOGO_W * 0.283;
const S = ARM / 744;

export const LogoReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [handle] = useState(() => delayRender("flex lottie"));
  const [flex, setFlex] = useState<LottieAnimationData | null>(null);
  useEffect(() => {
    fetch(staticFile("flex-red.json")).then((r) => r.json()).then((d) => { setFlex(d); continueRender(handle); }).catch(cancelRender);
  }, [handle]);

  const armIn = spring({ frame, fps, config: { damping: 11, mass: 0.6 } });
  const wordIn = spring({ frame: frame - 6, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill style={{ background: BG, alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "relative", width: LOGO_W, height: LOGO_H }}>
        <Img
          src={staticFile("wordmark.svg")}
          style={{ width: LOGO_W, opacity: wordIn, transform: `translateX(${(1 - wordIn) * -80}px)` }}
        />
        <div
          style={{
            position: "absolute",
            left: LOGO_W * 0.004 - 585 * S,
            top: LOGO_W * 0.0085 - 169 * S,
            width: 1920 * S,
            height: 1080 * S,
            transform: `scale(${armIn})`,
            transformOrigin: `${(585 + 744 / 2) * S}px ${(169 + 744) * S}px`, // arm's bottom-center
          }}
        >
          {flex && (
            <Freeze frame={INTRO} active={frame < INTRO}>
              <Sequence from={INTRO} layout="none">
                <Lottie animationData={flex} />
              </Sequence>
            </Freeze>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
