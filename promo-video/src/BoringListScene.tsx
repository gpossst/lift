import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "./theme";

// Generic "every tracker ever" set list: tap weight, type, tap reps, type,
// tap check. Same steady rhythm every set, on purpose; it should feel boring.
const INK = "#1C1C1E";
const GREY = "#8A8A8E";
const LINE = "#E4E4E2";
const SCREEN = "#F3F3F1";

const EXERCISES = [
  { name: "Bench Press", sets: [["1", "135", "10"], ["2", "185", "8"], ["3", "185", "8"], ["4", "185", "7"]] },
  { name: "Incline Dumbbell Press", sets: [["1", "60", "10"], ["2", "60", "9"], ["3", "60", "8"]] },
  { name: "Cable Fly", sets: [["1", "30", "12"], ["2", "30", "12"], ["3", "30", "12"]] },
];

// Phone-local layout (px inside the 476px-wide screen).
const PHONE_W = 500;
const PHONE_H = 1010;
const HEADER_H = 150;
const TITLE_H = 64;
const COLS_H = 34;
const ROW_H = 58;
const ADD_H = 52;
const GAP = 24;
const COL = { set: 40, w: 140, r: 266, check: 392 };
const W_BOX = 104;
const R_BOX = 104;

// Per-set beats, in frames from the set's start.
const PER_SET = 26;
const START = 15;
const FOCUS_R = 13;
const CHECK = 23;
const typed = (value: string, local: number, from: number) =>
  value.slice(0, [...value].filter((_, j) => local >= from + j * 3).length);

let y = 16;
let n = 0;
const BLOCKS = EXERCISES.map((ex) => {
  const top = y;
  y += TITLE_H + COLS_H;
  const rows = ex.sets.map(([label, w, r]) => {
    const row = { label, w, r, y, start: START + n++ * PER_SET };
    y += ROW_H;
    return row;
  });
  const addY = y;
  y += ADD_H + GAP;
  return { name: ex.name, top, rows, addY };
});
const ROWS = BLOCKS.flatMap((b) => b.rows);
export const BORING_LIST_FRAMES = START + ROWS.length * PER_SET + 30;

const TAPS = ROWS.flatMap((row) => [
  { frame: row.start, x: COL.w + W_BOX / 2, row },
  { frame: row.start + FOCUS_R, x: COL.r + R_BOX / 2, row },
  { frame: row.start + CHECK, x: COL.check + 18, row },
]);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Steps down one set at a time, easing just before each set starts.
const scrollAt = (f: number) =>
  ROWS.reduce((acc, row, i) => {
    const target = Math.max(0, row.y - 380);
    if (i === 0) return target;
    const prev = Math.max(0, ROWS[i - 1].y - 380);
    const t = interpolate(f, [row.start - 8, row.start], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    return acc + (target - prev) * t;
  }, 0);

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export const BoringListScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const scroll = scrollAt(frame);
  const rowCenter = (row: { y: number }) => HEADER_H + row.y + ROW_H / 2 - scroll;

  const past = TAPS.filter((t) => t.frame <= frame);
  const last = past[past.length - 1];
  const next = TAPS[past.length];
  const finger = (() => {
    const from = last ? { x: last.x, y: rowCenter(last.row) } : { x: 260, y: PHONE_H + 80 };
    if (!next) return from;
    const t = interpolate(
      frame,
      [last ? last.frame + 2 : 0, last ? last.frame + (next.frame - last.frame) * 0.75 : next.frame],
      [0, 1],
      { ...clamp, easing: Easing.inOut(Easing.cubic) },
    );
    return { x: from.x + (next.x - from.x) * t, y: from.y + (rowCenter(next.row) - from.y) * t };
  })();
  const press = last ? interpolate(frame - last.frame, [0, 3, 7], [1, 0.75, 1], clamp) : 1;

  return (
    <AbsoluteFill style={{ background: "#E9E9E6", fontFamily: FONT, color: INK, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: (1920 - PHONE_W) / 2,
          top: 35,
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: 66,
          background: SCREEN,
          border: "12px solid #111",
          boxShadow: "0 40px 90px rgba(0,0,0,0.18)",
          overflow: "hidden",
          scale: interpolate(frame, [0, durationInFrames], [1, 1.04], { ...clamp, easing: Easing.inOut(Easing.quad) }),
        }}
      >
        {/* Scrolling set list */}
        <div style={{ position: "absolute", left: 0, right: 0, top: HEADER_H, translate: `0px ${-scroll}px` }}>
          {BLOCKS.map((b) => (
            <div key={b.name}>
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  right: 16,
                  top: b.top,
                  height: b.addY + ADD_H - b.top,
                  borderRadius: 18,
                  background: "white",
                }}
              />
              <div style={{ position: "absolute", left: 40, top: b.top + 22, fontSize: 23, fontWeight: 600 }}>{b.name}</div>
              <div style={{ position: "absolute", left: 0, right: 0, top: b.top + TITLE_H, height: COLS_H, fontSize: 14, fontWeight: 500, letterSpacing: 0.4, color: GREY }}>
                <span style={{ position: "absolute", left: COL.set, top: 8 }}>Set</span>
                <span style={{ position: "absolute", left: COL.w, width: W_BOX, top: 8, textAlign: "center" }}>lbs</span>
                <span style={{ position: "absolute", left: COL.r, width: R_BOX, top: 8, textAlign: "center" }}>Reps</span>
              </div>
              {b.rows.map((row) => {
                const local = frame - row.start;
                const done = local >= CHECK;
                const focus = local >= 0 && !done ? (local < FOCUS_R ? "w" : "r") : null;
                return (
                  <div key={row.start} style={{ position: "absolute", left: 0, right: 0, top: row.y, height: ROW_H }}>
                    <div style={{ position: "absolute", left: COL.set, top: 17, fontSize: 20, fontWeight: 500, color: GREY }}>{row.label}</div>
                    <Field left={COL.w} width={W_BOX} value={typed(row.w, local, 4)} focus={focus === "w"} frame={frame} />
                    <Field left={COL.r} width={R_BOX} value={typed(row.r, local, FOCUS_R + 3)} focus={focus === "r"} frame={frame} />
                    <div
                      style={{
                        position: "absolute",
                        left: COL.check,
                        top: 11,
                        width: 36,
                        height: 36,
                        borderRadius: 99,
                        border: `2px solid ${done ? INK : "#C7C7CC"}`,
                        background: done ? INK : "transparent",
                        boxSizing: "border-box",
                        color: "white",
                        fontSize: 18,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        scale: interpolate(local, [CHECK, CHECK + 3, CHECK + 7], [1, 1.12, 1], clamp),
                      }}
                    >
                      {done ? "✓" : ""}
                    </div>
                  </div>
                );
              })}
              <div style={{ position: "absolute", left: 40, top: b.addY + 14, fontSize: 18, fontWeight: 500, color: GREY }}>+ Add set</div>
            </div>
          ))}
        </div>

        {/* Workout header */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: HEADER_H, background: SCREEN }}>
          <div style={{ position: "absolute", left: 44, top: 22, fontSize: 20, fontWeight: 600 }}>9:41</div>
          <div style={{ position: "absolute", left: 160, top: 14, width: 156, height: 38, borderRadius: 20, background: "#000" }} />
          <div style={{ position: "absolute", left: 28, top: 72, fontSize: 32, fontWeight: 700 }}>Workout</div>
          <div style={{ position: "absolute", left: 28, top: 114, fontSize: 17, color: GREY, fontVariantNumeric: "tabular-nums" }}>
            {mmss(724 + Math.floor(frame / fps))}
          </div>
        </div>

        {/* Finger */}
        <div
          style={{
            position: "absolute",
            left: finger.x - 30,
            top: finger.y - 30,
            width: 60,
            height: 60,
            borderRadius: 99,
            background: "rgba(0,0,0,0.22)",
            border: "3px solid rgba(0,0,0,0.4)",
            scale: press,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const Field: React.FC<{ left: number; width: number; value: string; focus: boolean; frame: number }> = ({
  left,
  width,
  value,
  focus,
  frame,
}) => (
  <div
    style={{
      position: "absolute",
      left,
      top: 9,
      width,
      height: 40,
      borderRadius: 8,
      border: `1.5px solid ${focus ? INK : LINE}`,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 21,
      fontWeight: 500,
    }}
  >
    {value}
    {focus && <span style={{ fontWeight: 300, opacity: frame % 16 < 8 ? 1 : 0 }}>|</span>}
  </div>
);
