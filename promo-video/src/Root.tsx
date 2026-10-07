import { Composition, Folder } from "remotion";
import { TEDIOUS_FRAMES, TediousScene } from "./TediousScene";
import { LIFT_FRAMES, LiftAd } from "./LiftAd";
import { LiftScene } from "./LiftScene";

const size = { fps: 30, width: 1080, height: 1920 };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="LiftAd" component={LiftAd} durationInFrames={300} {...size} />
    <Folder name="Scenes">
      <Composition id="Tedious" component={TediousScene} durationInFrames={TEDIOUS_FRAMES} {...size} />
      <Composition id="Lift" component={LiftScene} durationInFrames={LIFT_FRAMES} {...size} />
    </Folder>
  </>
);
