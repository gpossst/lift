import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "./theme";

// "Other things I'm working on": a wall of AI tool / lab logos, every tile the
// same size, drifting in alternating marquee rows. Logos live in public/logos
// (LobeHub icons + T3 Code / Herdr app icons).
const LOGOS = [
  "claudecode.svg", "openai.svg", "t3code.png", "cursor.svg", "deepseek.svg", "hermesagent.svg", "claude.svg", "opencode.svg",
  "herdr.png", "gemini.svg", "codex.svg", "mistral.svg", "amp.svg", "xai.svg", "cline.svg", "qwen.svg",
  "windsurf.svg", "metaai.svg", "githubcopilot.svg", "kimi.svg", "geminicli.svg", "zai.svg", "kiro.svg", "minimax.svg",
  "devin.svg", "deepmind.svg", "lovable.svg", "grok.svg", "v0.svg", "huggingface.svg", "replit.svg", "ollama.svg",
  "roocode.svg", "openrouter.svg", "kilocode.svg", "mcp.svg", "junie.svg", "vercel.svg", "goose.svg", "groq.svg",
  "openhands.svg", "cerebras.svg", "trae.svg", "perplexity.svg", "langchain.svg", "nvidia.svg", "cohere.svg",
];

export const AI_TOOLS_FRAMES = 330;
const TILE = 130;
const GAP = 35;
const ROW_COUNT = 6;
const PER_ROW = 17; // 17 * 165px = 2805px, wide enough to cover 1920 through the whole drift
const TOP = (1080 - (ROW_COUNT * TILE + (ROW_COUNT - 1) * GAP)) / 2;

// Consecutive slices of the list (wrapping), so adjacent rows never share a logo.
const ROWS = Array.from({ length: ROW_COUNT }, (_, r) =>
  Array.from({ length: PER_ROW }, (_, i) => LOGOS[(r * PER_ROW + i) % LOGOS.length]),
);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const AIToolsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const out = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: C.paper, overflow: "hidden", opacity: out }}>
      <AbsoluteFill style={{ scale: interpolate(frame, [0, durationInFrames], [1, 1.06], { ...clamp, easing: Easing.inOut(Easing.quad) }) }}>
        {ROWS.map((row, r) => {
          const dir = r % 2 ? 1 : -1;
          const drift = dir * frame * 1.6 + (dir > 0 ? -700 : 0);
          return (
            <div
              key={r}
              style={{ position: "absolute", top: TOP + r * (TILE + GAP), left: 0, display: "flex", gap: GAP, translate: `${drift}px 0px` }}
            >
              {row.map((file, i) => {
                const s = spring({ frame: frame - 4 - r * 4 - i * 2, fps, config: { damping: 14 } });
                return (
                  <div
                    key={i}
                    style={{
                      width: TILE,
                      height: TILE,
                      flexShrink: 0,
                      borderRadius: TILE * 0.23,
                      background: "white",
                      border: `2px solid ${C.line}`,
                      boxSizing: "border-box",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      scale: s,
                      opacity: s,
                    }}
                  >
                    <Img src={staticFile(`logos/${file}`)} style={{ width: TILE * 0.5, height: TILE * 0.5, borderRadius: TILE * 0.1 }} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
