import { useEffect, useState } from 'react';

// Covers the 200ms SlideOutDown/FadeOut exits plus a frame of slack.
const SHEET_EXIT_MS = 240;

/**
 * RN Modal unmounts its children instantly, so Reanimated `exiting` never runs.
 * Use the return value as the Modal's `visible` and render the sheet only while
 * `open`: the Modal stays up long enough for the exit animation to play.
 */
export function useSheetPresence(open: boolean) {
  const [visible, setVisible] = useState(open);
  if (open && !visible) setVisible(true);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setVisible(false), SHEET_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);
  return open || visible;
}
