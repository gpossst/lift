import { Composition, Folder } from "remotion";
import { TEDIOUS_FRAMES, TediousScene } from "./TediousScene";
import { LIFT_FRAMES, LiftAd } from "./LiftAd";
import { LiftScene } from "./LiftScene";
import { VIRAL_SEARCH_FRAMES, ViralSearchScene } from "./ViralSearchScene";
import { APP_STORE_FRAMES, AppStoreScene } from "./AppStoreScene";
import { LOGO_REVEAL_FRAMES, LogoReveal } from "./LogoReveal";
import { BORING_LIST_FRAMES, BoringListScene } from "./BoringListScene";
import { SCREENSHOTS_FRAMES, ScreenshotsScene } from "./ScreenshotsScene";
import { CHART_LOCK, COVERAGE_LOCK, LOCKED_COVERAGE_FRAMES, LockedCoverageScene } from "./LockedCoverageScene";
import { INSPIRATION_FRAMES, InspirationScene } from "./InspirationScene";
import { AI_TOOLS_FRAMES, AIToolsScene } from "./AIToolsScene";
import { APP_STORE_LISTING_FRAMES, AppStoreListing } from "./AppStoreListing";

const size = { fps: 30, width: 1080, height: 1920 };
const landscape = { fps: 30, width: 1920, height: 1080 };

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="LiftAd" component={LiftAd} durationInFrames={300} {...size} />
    <Composition id="LogoReveal" component={LogoReveal} durationInFrames={LOGO_REVEAL_FRAMES} {...landscape} />
    <Folder name="Scenes">
      <Composition id="Tedious" component={TediousScene} durationInFrames={TEDIOUS_FRAMES} {...size} />
      <Composition id="Lift" component={LiftScene} durationInFrames={LIFT_FRAMES} {...size} />
      <Composition id="ViralSearch" component={ViralSearchScene} durationInFrames={VIRAL_SEARCH_FRAMES} {...landscape} />
      <Composition id="AppStoreReviews" component={AppStoreScene} durationInFrames={APP_STORE_FRAMES} {...landscape} />
      <Composition id="AppStoreListing" component={AppStoreListing} durationInFrames={APP_STORE_LISTING_FRAMES} {...landscape} />
      <Composition id="AppStoreScreenshots" component={ScreenshotsScene} durationInFrames={SCREENSHOTS_FRAMES} {...landscape} />
      <Composition id="Inspiration" component={InspirationScene} durationInFrames={INSPIRATION_FRAMES} {...landscape} />
      <Composition id="LockedCoverage" component={LockedCoverageScene} durationInFrames={LOCKED_COVERAGE_FRAMES} fps={30} width={1320} height={2868} defaultProps={COVERAGE_LOCK} />
      <Composition id="LockedChart" component={LockedCoverageScene} durationInFrames={LOCKED_COVERAGE_FRAMES} fps={30} width={1320} height={2868} defaultProps={CHART_LOCK} />
      <Composition id="AITools" component={AIToolsScene} durationInFrames={AI_TOOLS_FRAMES} {...landscape} />
      <Composition id="BoringList" component={BoringListScene} durationInFrames={BORING_LIST_FRAMES} {...landscape} />
    </Folder>
  </>
);
