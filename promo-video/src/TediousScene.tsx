import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Headline } from "./Headline";
import { C, FONT } from "./theme";

// Phone-local layout (px inside the 740x1340 phone).
const ROW_Y = (i: number) => 200 + i * 112;
const WEIGHT_X = 230;
const REPS_X = 440;
const KB_TOP = 880;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
const keyPos = (k: string) => {
  const i = KEYS.indexOf(k);
  return { x: 120 + (i % 3) * 230, y: KB_TOP + 120 + Math.floor(i / 3) * 88 };
};
const center = (x: number, w: number, y: number) => ({ x: x + w / 2, y: y + 46 });

type Action = { frame: number; x: number; y: number; row: number } & (
  | { kind: "add" | "done" | "focusW" | "focusR" }
  | { kind: "type"; field: "w" | "r"; char: string }
);

// Every set needs the same tap-tap-type-type-tap-type-tap routine, speeding
// up until the finger is a motion-blurred streak.
const DURS = [56, 32, 22, 16, 12, 9, 7, 6, 5, 5];
const WEIGHTS = ["185", "185", "185", "175", "175", "165", "165", "155", "155", "145"];
const REPS = ["8", "8", "7", "8", "6", "8", "7", "8", "6", "5"];
const SETS = DURS.map((dur, i) => ({
  start: 4 + DURS.slice(0, i).reduce((a, b) => a + b, 0),
  dur,
  w: WEIGHTS[i],
  r: REPS[i],
}));
export const TEDIOUS_FRAMES = 4 + DURS.reduce((a, b) => a + b, 0);
const VISIBLE_ROWS = 5;

// List scrolls one row per new set once it outgrows the screen.
const ADD_FRAMES = SETS.slice(VISIBLE_ROWS).map((x) => x.start);
const scrollAt = (f: number) =>
  interpolate(f, [ADD_FRAMES[0] - 4, ...ADD_FRAMES], [0, ...ADD_FRAMES.map((_, i) => (i + 1) * 112)], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const ACTIONS: Action[] = SETS.flatMap((s, row) => {
  const at = (p: number) => Math.round(s.start + p * s.dur);
  const y = ROW_Y(row) - scrollAt(s.start);
  const wDigits = [...s.w].map((char, j) => ({
    frame: at(0.28 + j * 0.1), ...keyPos(char), row, kind: "type" as const, field: "w" as const, char,
  }));
  return [
    { frame: at(0), ...center(40, 660, y), row, kind: "add" as const },
    { frame: at(0.15), ...center(WEIGHT_X, 180, y), row, kind: "focusW" as const },
    ...wDigits,
    { frame: at(0.6), ...center(REPS_X, 130, y), row, kind: "focusR" as const },
    { frame: at(0.72), ...keyPos(s.r), row, kind: "type" as const, field: "r" as const, char: s.r },
    { frame: at(0.86), x: 640, y: KB_TOP + 45, row, kind: "done" as const },
  ];
});

export const TediousScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 12 } });
  const past = ACTIONS.filter((a) => a.frame <= frame);
  const last = past[past.length - 1];
  const next = ACTIONS[past.length];

  // Finger glides toward the next tap, then rests on it.
  const finger =
    !last ? { x: 370, y: 1300 }
    : !next || next.frame === last.frame ? last
    : (() => {
        const t = interpolate(frame, [last.frame, last.frame + (next.frame - last.frame) * 0.7], [0, 1], {
          extrapolateRight: "clamp",
          easing: Easing.inOut(Easing.cubic),
        });
        return { x: last.x + (next.x - last.x) * t, y: last.y + (next.y - last.y) * t };
      })();
  const press = last ? interpolate(frame - last.frame, [0, 3, 7], [0.7, 0.55, 1], { extrapolateRight: "clamp" }) : 1;

  const rows = SETS.map((_, row) => {
    const mine = past.filter((a) => a.row === row);
    const typed = (f: "w" | "r") =>
      mine.flatMap((a) => (a.kind === "type" && a.field === f ? [a.char] : [])).join("");
    const lastKind = mine[mine.length - 1]?.kind;
    return {
      added: mine.some((a) => a.kind === "add"),
      added_at: mine[0]?.frame ?? 0,
      w: typed("w"),
      r: typed("r"),
      done: lastKind === "done",
      focus: lastKind === "done" ? null : mine.some((a) => a.kind === "focusR") ? "r" : mine.some((a) => a.kind === "focusW") ? "w" : null,
    };
  });
  const addY = ROW_Y(rows.filter((r) => r.added).length);
  const scroll = scrollAt(frame);
  const kbUp = spring({ frame: frame - 12, fps, config: { damping: 14 } });
  const keyHit = last?.kind === "type" && frame - last.frame < 5 ? last.char : null;

  return (
    <AbsoluteFill style={{ background: frame < 90 ? C.paper : C.line, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: 170,
          top: 440,
          width: 740,
          height: 1340,
          borderRadius: 70,
          background: "white",
          border: `14px solid ${C.ink}`,
          overflow: "hidden",
          fontFamily: FONT,
          color: C.ink,
          transform: `scale(${0.9 + enter * 0.1})`,
        }}
      >
        <div style={{ position: "absolute", left: 40, top: 60, fontSize: 52, fontWeight: 900, letterSpacing: -1 }}>
          Bench Press
        </div>

        <div style={{ position: "absolute", left: 0, right: 0, top: 170, height: KB_TOP - 170, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: -170, transform: `translateY(${-scroll}px)` }}>
        {rows.map((r, i) =>
          !r.added ? null : (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 40,
                top: ROW_Y(i),
                width: 660,
                height: 92,
                display: "flex",
                alignItems: "center",
                transform: `scaleY(${spring({ frame: frame - r.added_at, fps, config: { damping: 12, mass: 0.4 } })})`,
              }}
            >
              <div style={{ width: 190, fontSize: 32, fontWeight: 700, color: C.muted }}>Set {i + 1}</div>
              <Box value={r.w} focus={r.focus === "w"} width={180} />
              <div style={{ width: 30, textAlign: "center", fontSize: 32, color: C.muted }}>×</div>
              <Box value={r.r} focus={r.focus === "r"} width={130} />
              <div style={{ marginLeft: 40, fontSize: 44, color: r.done ? C.ink : C.line }}>✓</div>
            </div>
          )
        )}

        <div
          style={{
            position: "absolute",
            left: 40,
            top: addY,
            width: 660,
            height: 92,
            borderRadius: 20,
            border: `3px dashed ${C.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            fontWeight: 700,
            color: C.muted,
          }}
        >
          + Add set
        </div>
        </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: KB_TOP,
            bottom: 0,
            background: C.paper,
            borderTop: `2px solid ${C.line}`,
            transform: `translateY(${(1 - kbUp) * 500}px)`,
          }}
        >
          <div style={{ position: "absolute", right: 40, top: 22, fontSize: 34, fontWeight: 800, color: C.blue }}>Done</div>
          {KEYS.map((k) => {
            if (!k) return null;
            const p = keyPos(k);
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: p.x - 100,
                  top: p.y - KB_TOP - 40,
                  width: 200,
                  height: 80,
                  borderRadius: 14,
                  background: keyHit === k ? C.line : "white",
                  boxShadow: "0 2px 0 rgba(0,0,0,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 40,
                  fontWeight: 500,
                }}
              >
                {k}
              </div>
            );
          })}
        </div>

        <div
          style={{
            position: "absolute",
            left: finger.x - 45,
            top: finger.y - 45,
            width: 90,
            height: 90,
            borderRadius: 99,
            background: "rgba(23,24,15,0.28)",
            border: "4px solid rgba(23,24,15,0.5)",
            transform: `scale(${press})`,
          }}
        />
      </div>

      {frame < 90 ? (
        <Headline text="You came to lift." from={6} color={C.ink} top={150} />
      ) : (
        <Headline text="Not do data entry." from={90} color={C.ink} top={150} />
      )}
    </AbsoluteFill>
  );
};

const Box: React.FC<{ value: string; focus: boolean; width: number }> = ({ value, focus, width }) => (
  <div
    style={{
      width,
      height: 80,
      borderRadius: 16,
      border: `3px solid ${focus ? C.blue : C.line}`,
      display: "flex",
      alignItems: "center",
      paddingLeft: 20,
      boxSizing: "border-box",
      fontSize: 40,
      fontWeight: 800,
    }}
  >
    {value}
    {focus && <span style={{ color: C.blue, fontWeight: 400 }}>|</span>}
  </div>
);
