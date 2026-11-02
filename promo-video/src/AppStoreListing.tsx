import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "./theme";

export const APP_STORE_LISTING_FRAMES = 210;

export const AppStoreListing = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const assetBase = staticFile("").replace(/\/$/, "");
  const reveal = (at: number, children: ReactNode, style: CSSProperties = {}) => {
    const entranceFrame = (frame - at * 0.85) * 1.25;
    const progress = spring({ frame: entranceFrame, fps, config: { damping: 20, stiffness: 115, mass: 0.8 } });
    return (
      <div style={{
        ...style,
        opacity: interpolate(entranceFrame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        translate: `0 ${(1 - progress) * 32}px`,
        scale: 0.975 + progress * 0.025,
      }}>{children}</div>
    );
  };

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#242423", color: "#f5f5f3", fontFamily: FONT }}>
      {reveal(0, <Img src={`${assetBase}/app-icon-dark-red.png`} style={{ width: 152, height: 152, borderRadius: 34, display: "block" }} />, { position: "absolute", left: 100, top: 72 })}
      {reveal(6, "Lift: Workout Tracker & Log", { position: "absolute", left: 292, top: 72, fontSize: 40, fontWeight: 750, letterSpacing: -1 })}
      {reveal(11, "Weight Lifting & Strength Plan", { position: "absolute", left: 292, top: 125, fontSize: 26, color: "#b8b8b6" })}
      {reveal(16, "Designed for iPhone.", { position: "absolute", left: 292, top: 164, fontSize: 19, color: "#858583" })}
      {reveal(21, <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="#ff5158" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M13 29H10a7 7 0 0 1-1-14 11 11 0 0 1 21-3 8.5 8.5 0 0 1 3 17h-3M22 21v18m-7-7 7 7 7-7" /></svg>, { position: "absolute", left: 292, top: 202 })}

      <div style={{ position: "absolute", top: 278, left: 100, right: 100, display: "flex" }}>
        {[
          ["AGE", "17+", "Years Old"],
          ["CATEGORY", "fitness", "Health & Fitness"],
          ["DEVELOPER", "person", "Garrett Post"],
          ["LANGUAGE", "EN", "English"],
          ["SIZE", "65.2", "MB"],
        ].map(([label, value, sub], i) => (
          <div key={label} style={{ flex: 1, textAlign: "center" }}>
            {reveal(26 + i * 4, label, { fontSize: 16, fontWeight: 650, color: "#858583", letterSpacing: 0.6 })}
            {reveal(29 + i * 4, value === "fitness" ? <svg width="34" height="36" viewBox="0 0 34 36" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="21" cy="5" r="3" fill="currentColor" stroke="none" /><path d="m15 12 5-2 5 7 5 1M20 11l-5 10 7 4-4 9M15 21l-4 8-7 3M14 12l-5 2-3 7" /></svg> : value === "person" ? <svg width="34" height="36" viewBox="0 0 34 36" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="4" y="3" width="26" height="30" rx="3" /><circle cx="17" cy="13" r="5" fill="currentColor" stroke="none" /><path d="M7 32c0-13 20-13 20 0" fill="currentColor" stroke="none" /></svg> : value, { fontSize: 33, fontWeight: 700, height: 44, lineHeight: "44px", marginTop: 7, color: "#c6c6c3" })}
            {reveal(32 + i * 4, sub, { fontSize: 18, marginTop: 5, color: "#a5a5a1" })}
          </div>
        ))}
      </div>

      {reveal(44, <Img src={`${assetBase}/screenshots/1.png`} style={{ width: "100%", display: "block" }} />, { position: "absolute", left: 110, top: 420, width: 280, borderRadius: 7, overflow: "hidden" })}
      {reveal(47, <Img src={`${assetBase}/screenshots/2.png`} style={{ width: "100%", display: "block" }} />, { position: "absolute", left: 465, top: 420, width: 280, borderRadius: 7, overflow: "hidden" })}
      {reveal(50, <Img src={`${assetBase}/screenshots/3.png`} style={{ width: "100%", display: "block" }} />, { position: "absolute", left: 820, top: 420, width: 280, borderRadius: 7, overflow: "hidden" })}
      {reveal(53, <Img src={`${assetBase}/screenshots/4.png`} style={{ width: "100%", display: "block" }} />, { position: "absolute", left: 1175, top: 420, width: 280, borderRadius: 7, overflow: "hidden" })}
      {reveal(56, <Img src={`${assetBase}/screenshots/5.png`} style={{ width: "100%", display: "block" }} />, { position: "absolute", left: 1530, top: 420, width: 280, borderRadius: 7, overflow: "hidden" })}
    </AbsoluteFill>
  );
};
