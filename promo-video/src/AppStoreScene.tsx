import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "./theme";

export const APP_STORE_FRAMES = 150;
// Laid out in landscape iPad points (1200 wide), then scaled up to 1920.
const S = 1920 / 1200;
const BLUE = "#007AFF";
const GRAY = "#8E8E93";
const SEP = "#E5E5EA";
const FINAL = 1284392;
const COUNT_FROM = 12;
const COUNT_TO = 118;

const REVIEWS = [
  { title: "Deleted my spreadsheet", body: "Logging a set takes one tap now. Genuinely don't know how I tracked lifts before this." },
  { title: "Finally, no data entry", body: "It already knows my weights and tells me what to do next. Best lifting app I've tried." },
  { title: "Why didn't this exist?", body: "Clean, fast, and the recommendations actually make sense. Five stars, easy." },
];

const short = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.floor(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;

export const AppStoreScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

  // Exponential climb that keeps accelerating, then lands on FINAL.
  const exp = interpolate(frame, [COUNT_FROM, COUNT_TO], [1, Math.log10(FINAL)], { ...clamp, easing: Easing.in(Easing.cubic) });
  const count = frame >= COUNT_TO ? FINAL : Math.round(10 ** exp);
  const rank = Math.max(1, Math.round(interpolate(exp, [1, 5.6], [847, 1], clamp)));
  const landed = spring({ frame: frame - COUNT_TO, fps, config: { damping: 8, mass: 0.5 } });
  const tick = frame < COUNT_TO ? 1 + (frame % 3 === 0 ? 0.04 : 0) * Math.min(1, exp / 3) : 1 + Math.sin(landed * Math.PI) * 0.18;
  const enter = spring({ frame, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill style={{ background: "white", overflow: "hidden" }}>
      <div
        style={{
          width: 1200,
          height: 1080 / S,
          position: "relative",
          fontFamily: FONT,
          color: "#000",
          transformOrigin: "0 0",
          scale: `${S}`,
          opacity: enter,
          translate: `0 ${(1 - enter) * 40}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            transformOrigin: "75% 62%",
            scale: interpolate(frame, [0, APP_STORE_FRAMES], [1, 1.06], { ...clamp, easing: Easing.inOut(Easing.quad) }),
          }}
        >
          {/* Status bar + nav */}
          <div style={{ position: "absolute", top: 12, left: 24, fontSize: 14, fontWeight: 600 }}>9:41&nbsp;&nbsp;Tue Oct 13</div>
          <div style={{ position: "absolute", top: 14, right: 24, display: "flex", gap: 5, alignItems: "center" }}>
            <div style={{ width: 17, height: 11, display: "flex", gap: 1.5, alignItems: "flex-end" }}>
              {[4, 6, 8, 11].map((h) => (
                <div key={h} style={{ width: 3, height: h, borderRadius: 1, background: "#000" }} />
              ))}
            </div>
            <div style={{ width: 24, height: 11, borderRadius: 3, border: "1px solid #999", padding: 1 }}>
              <div style={{ width: "80%", height: "100%", borderRadius: 1.5, background: "#000" }} />
            </div>
          </div>
          <div style={{ position: "absolute", top: 46, left: 28, fontSize: 17, color: BLUE, display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="11" height="18" viewBox="0 0 11 18"><path d="M9 2 L2 9 L9 16" stroke={BLUE} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Search
          </div>

          {/* App header */}
          <div style={{ position: "absolute", top: 86, left: 40, right: 40, display: "flex", gap: 24, alignItems: "center" }}>
            <Img src={staticFile("app-icon.png")} style={{ width: 140, height: 140, borderRadius: 32, border: `0.5px solid ${SEP}` }} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.5 }}>Lift</div>
              <div style={{ fontSize: 18, color: GRAY, marginTop: 2 }}>Workout Tracker</div>
              <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ background: BLUE, color: "white", fontSize: 16, fontWeight: 700, borderRadius: 99, padding: "7px 26px" }}>GET</div>
                <div style={{ fontSize: 11, color: GRAY, lineHeight: 1.2 }}>In-App<br />Purchases</div>
              </div>
            </div>
            <svg width="20" height="24" viewBox="0 0 18 22" fill="none" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ alignSelf: "flex-end", marginBottom: 6 }}>
              <path d="M9 14 V2 M4.5 6 L9 1.5 L13.5 6 M5 9 H2.5 V20.5 H15.5 V9 H13" />
            </svg>
          </div>

          {/* Stats strip */}
          <div style={{ position: "absolute", top: 254, left: 40, right: 40, height: 74, borderTop: `0.5px solid ${SEP}`, paddingTop: 12, display: "flex" }}>
            <Stat label={`${short(count)} RATINGS`} value="4.9" sub="★★★★★" scale={tick} />
            <Stat label="AGES" value="4+" sub="Years Old" />
            <Stat label="CHART" value={`#${rank}`} sub="Health & Fitness" highlight={rank === 1} />
            <Stat label="LANGUAGE" value="EN" sub="English" />
            <Stat label="SIZE" value="48.2" sub="MB" last />
          </div>

          {/* Ratings & Reviews */}
          <div style={{ position: "absolute", top: 352, left: 40, right: 40, borderTop: `0.5px solid ${SEP}`, paddingTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>Ratings & Reviews</div>
              <div style={{ fontSize: 17, color: BLUE }}>See All</div>
            </div>
            <div style={{ display: "flex", marginTop: 10, gap: 28, alignItems: "flex-end" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>4.9</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#3C3C43", opacity: 0.6, marginTop: 4 }}>out of 5</div>
              </div>
              <div style={{ width: 360, paddingBottom: 6 }}>
                {[0.9, 0.07, 0.02, 0.006, 0.004].map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, height: 12 }}>
                    <div style={{ width: 50, textAlign: "right", fontSize: 9, color: GRAY, letterSpacing: 0.5 }}>{"★".repeat(5 - i)}</div>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: SEP }}>
                      <div style={{ height: "100%", borderRadius: 2, background: GRAY, width: `${p * 100 * Math.min(1, 0.3 + exp / 6)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  flex: 1,
                  textAlign: "right",
                  fontSize: 34,
                  fontWeight: 700,
                  letterSpacing: -0.5,
                  color: frame >= COUNT_TO ? BLUE : "#3C3C43",
                  fontVariantNumeric: "tabular-nums",
                  transformOrigin: "100% 50%",
                  scale: `${tick}`,
                }}
              >
                {count.toLocaleString("en-US")} Ratings
              </div>
            </div>
          </div>

          {/* Review cards slide past faster as the count climbs */}
          <div
            style={{
              position: "absolute",
              top: 524,
              left: 40,
              display: "flex",
              gap: 16,
              translate: `${interpolate(frame, [30, APP_STORE_FRAMES], [0, -760], { ...clamp, easing: Easing.in(Easing.quad) })}px 0`,
            }}
          >
            {[...REVIEWS, ...REVIEWS].map((r, i) => {
              const pop = spring({ frame: frame - 18 - i * 6, fps, config: { damping: 12, mass: 0.5 } });
              return (
                <div
                  key={i}
                  style={{ width: 364, height: 136, flexShrink: 0, borderRadius: 14, background: "#F2F2F7", padding: "16px 18px", boxSizing: "border-box", opacity: pop, scale: `${0.85 + pop * 0.15}` }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{r.title}</div>
                    <div style={{ fontSize: 13, color: GRAY }}>{["1m", "2m", "now"][i % 3]}</div>
                  </div>
                  <div style={{ fontSize: 13, color: "#FF9500", marginTop: 3 }}>★★★★★</div>
                  <div style={{ fontSize: 15, color: "#3C3C43", marginTop: 6, lineHeight: 1.3 }}>{r.body}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Stat: React.FC<{ label: string; value: string; sub: string; scale?: number; highlight?: boolean; last?: boolean }> = ({
  label, value, sub, scale = 1, highlight, last,
}) => (
  <div style={{ flex: 1, textAlign: "center", borderRight: last ? "none" : `0.5px solid ${SEP}` }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: GRAY, letterSpacing: 0.4, scale: `${scale}`, fontVariantNumeric: "tabular-nums" }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? BLUE : "#636366", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    <div style={{ fontSize: 12, color: GRAY, marginTop: 2, whiteSpace: "nowrap" }}>{sub}</div>
  </div>
);
