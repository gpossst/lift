import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "./theme";

export const VIRAL_SEARCH_FRAMES = 210;
const BG = "#FAFAFA";
const QUERY = "app viral marketing";
const SUGGESTIONS = [
  "app viral marketing",
  "app viral marketing strategy",
  "app viral marketing tiktok 2026",
  "app viral marketing examples",
];
const GRID_AT = 104;

const THUMBS = [
  { big: "$0 → $50K", emoji: "🤯", bg: ["#1B1B1B", "#3A3A3A"], title: "I made $50K with ONE TikTok (copy this)", ch: "AppBro", views: "4.1M", len: "12:47", arrow: true },
  { big: "STOP POSTING", emoji: "😡", bg: ["#FF3B30", "#B3001B"], title: "Why your app videos get 200 views", ch: "GrowthHackz", views: "890K", len: "9:03" },
  { big: "3 SEC HOOK", emoji: "😱", bg: ["#5856D6", "#2A1B8F"], title: "The hook formula nobody tells you", ch: "Hook Doctor", views: "2.3M", len: "14:21", circle: true },
  { big: "#1 OVERNIGHT", emoji: "🚀", bg: ["#00B386", "#00664D"], title: "How a dumb app hit #1 overnight", ch: "IndieRich", views: "6.7M", len: "18:09", arrow: true },
  { big: "DO THIS", emoji: "👉", bg: ["#FF9500", "#C24E00"], title: "Do THIS before you post (algorithm hack)", ch: "Algo Whisperer", views: "1.2M", len: "8:44" },
  { big: "30 DAYS...", emoji: "😭", bg: ["#007AFF", "#003E99"], title: "I tried viral marketing for 30 days...", ch: "Solo Dev Diaries", views: "540K", len: "22:15", circle: true },
  { big: "THE SECRET", emoji: "🤫", bg: ["#AF52DE", "#5E1F80"], title: "The UGC secret agencies hide from you", ch: "MarketingMike", views: "3.3M", len: "11:38", arrow: true },
  { big: "0 VIEWS?", emoji: "💀", bg: ["#2C2C2E", "#000000"], title: "Your hook is killing your app", ch: "ViralLab", views: "1.9M", len: "7:52" },
];

export const ViralSearchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const smooth = Easing.bezier(0.16, 1, 0.3, 1);

  const barIn = spring({ frame, fps, config: { damping: 13, mass: 0.6 } });
  const barTop = interpolate(frame, [90, 108], [380, 50], { ...clamp, easing: smooth });
  const typed = QUERY.slice(0, Math.floor(interpolate(frame, [14, 52], [0, QUERY.length], clamp)));
  const cursorOn = frame < 70 || frame % 16 < 8;
  const dropIn = spring({ frame: frame - 34, fps, config: { damping: 14, mass: 0.5 } });
  const dropOut = interpolate(frame, [88, 96], [1, 0], clamp);
  const tapped = frame >= 76;
  const tap = interpolate(frame, [76, 79, 86], [0.4, 1, 1.4], clamp);

  return (
    <AbsoluteFill style={{ background: BG, fontFamily: FONT, color: C.ink, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transformOrigin: "50% 60%",
          scale: interpolate(frame, [GRID_AT, 210], [1, 1.05], { ...clamp, easing: Easing.inOut(Easing.quad) }),
        }}
      >
        {/* Search bar */}
        <div
          style={{
            position: "absolute",
            left: 410,
            width: 1100,
            top: barTop,
            height: 130,
            borderRadius: 65,
            background: "white",
            boxShadow: "0 18px 50px rgba(0, 0, 0, 0.10)",
            display: "flex",
            alignItems: "center",
            paddingLeft: 40,
            gap: 26,
            fontSize: 46,
            fontWeight: 500,
            scale: interpolate(barIn, [0, 1], [0.7, 1]),
            opacity: barIn,
          }}
        >
          <MagGlass size={50} />
          <span>
            {typed}
            {cursorOn && <span style={{ color: C.blue, fontWeight: 300 }}>|</span>}
          </span>
        </div>

        {/* Autocomplete */}
        {typed.length >= 12 && dropOut > 0 && (
          <div
            style={{
              position: "absolute",
              left: 410,
              width: 1100,
              top: barTop + 150,
              borderRadius: 40,
              background: "white",
              boxShadow: "0 18px 50px rgba(0, 0, 0, 0.08)",
              padding: "18px 0",
              opacity: dropIn * dropOut,
              translate: `0 ${(1 - dropIn) * -30}px`,
              transformOrigin: "top",
            }}
          >
            {SUGGESTIONS.map((s, i) => (
              <div
                key={s}
                style={{
                  position: "relative",
                  height: 100,
                  display: "flex",
                  alignItems: "center",
                  gap: 26,
                  paddingLeft: 44,
                  fontSize: 40,
                  background: i === 0 && tapped ? "#F0F0F0" : "transparent",
                  opacity: interpolate(frame, [36 + i * 4, 42 + i * 4], [0, 1], clamp),
                }}
              >
                <MagGlass size={36} color={C.muted} />
                <Suggestion text={s} typed={typed} />
                {i === 0 && tapped && frame < 88 && (
                  <div
                    style={{
                      position: "absolute",
                      left: 300,
                      top: 5,
                      width: 90,
                      height: 90,
                      borderRadius: 99,
                      background: "rgba(23,24,15,0.25)",
                      border: "4px solid rgba(23,24,15,0.45)",
                      scale: tap,
                      opacity: interpolate(tap, [1, 1.4], [1, 0], clamp),
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Results grid */}
        {THUMBS.map((t, i) => {
          const from = GRID_AT + i * 4;
          if (frame < from) return null;
          const pop = spring({ frame: frame - from, fps, config: { damping: 12, mass: 0.5 } });
          return (
            <div
              key={t.title}
              style={{
                position: "absolute",
                left: 75 + (i % 4) * 450,
                top: 230 + Math.floor(i / 4) * 405,
                width: 420,
                opacity: pop,
                scale: interpolate(pop, [0, 1], [0.6, 1]),
                translate: `0 ${(1 - pop) * 80}px`,
              }}
            >
              <Thumbnail {...t} />
              <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 99, flexShrink: 0, background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})` }} />
                <div>
                  <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.3 }}>{t.title}</div>
                  <div style={{ fontSize: 21, color: C.muted, marginTop: 6 }}>
                    {t.ch} · {t.views} views
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Thumbnail: React.FC<(typeof THUMBS)[number]> = ({ big, emoji, bg, len, arrow, circle }) => (
  <div
    style={{
      position: "relative",
      width: 420,
      height: 236,
      borderRadius: 22,
      overflow: "hidden",
      background: `linear-gradient(135deg, ${bg[0]}, ${bg[1]})`,
    }}
  >
    <div style={{ position: "absolute", right: 22, top: 30, fontSize: 120, lineHeight: 1 }}>{emoji}</div>
    {circle && (
      <div style={{ position: "absolute", right: 4, top: 12, width: 168, height: 168, borderRadius: 99, border: "7px solid #FF2D2D", rotate: "-8deg" }} />
    )}
    {arrow && (
      <svg width="130" height="90" viewBox="0 0 130 90" style={{ position: "absolute", left: 150, top: 26 }}>
        <path d="M6 70 Q 60 72 98 30" stroke="#FF2D2D" strokeWidth="13" fill="none" strokeLinecap="round" />
        <path d="M76 22 L112 16 L104 52 Z" fill="#FF2D2D" />
      </svg>
    )}
    <div
      style={{
        position: "absolute",
        left: 22,
        bottom: 20,
        right: 120,
        fontSize: 52,
        fontWeight: 900,
        lineHeight: 0.95,
        letterSpacing: -1.5,
        color: "#FFE600",
        WebkitTextStroke: "3px #000",
        paintOrder: "stroke fill",
        textShadow: "0 5px 0 #000",
      }}
    >
      {big}
    </div>
    <div style={{ position: "absolute", right: 12, bottom: 12, padding: "3px 9px", borderRadius: 8, background: "rgba(0,0,0,0.8)", color: "white", fontSize: 20, fontWeight: 700 }}>
      {len}
    </div>
  </div>
);

// Google-style: the part you've typed is regular, the completion is bold.
const Suggestion: React.FC<{ text: string; typed: string }> = ({ text, typed }) =>
  text.startsWith(typed) ? (
    <span>
      {typed}
      <b>{text.slice(typed.length)}</b>
    </span>
  ) : (
    <span>{text}</span>
  );

const MagGlass: React.FC<{ size: number; color?: string }> = ({ size, color = C.ink }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round">
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 L21 21" />
  </svg>
);
