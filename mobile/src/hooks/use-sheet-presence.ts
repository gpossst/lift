import { useEffect, useState } from 'react';

// Covers the 200ms SlideOutDown/FadeOut exits plus a frame of slack.
const SHEET_EXIT_MS = 240;

/**
 * RN Modal unmounts its children instantly, so Reanimated `exiting` never runs,
 * and it presents natively after mount, so `entering` can finish off-screen and
 * the sheet pops in. Spread `modal` onto the Modal and render the sheet only
 * while `open`: content mounts once the Modal is on screen and stays up long
 * enough for the exit animation to play.
 */
export function useSheetPresence(open: boolean) {
  const [visible, setVisible] = useState(open);
  const [presented, setPresented] = useState(false);
  if (open && !visible) setVisible(true);
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => { setVisible(false); setPresented(false); }, SHEET_EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);
  return { modal: { visible: open || visible, onShow: () => setPresented(true) }, open: open && presented };
}
