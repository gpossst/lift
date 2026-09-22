import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import { colorsFor, defaultAppearance, normalizeRestTimerSeconds, systemMode, type AccentId, type AppearanceMode, type AppearancePreferences } from '@/lib/appearance';
import { readAppearance, writeAppearance } from '@/lib/appearance-storage';

type AppearanceContextValue = AppearancePreferences & {
  colors: ReturnType<typeof colorsFor>;
  setMode: (mode: AppearanceMode) => void;
  setAccent: (accent: AccentId) => void;
  setShowWorkoutRecommendations: (show: boolean) => void;
  setRestTimerEnabled: (enabled: boolean) => void;
  setUseRecommendedRestTimer: (enabled: boolean) => void;
  setRestTimerSeconds: (seconds: number) => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(() => {
    try { return readAppearance(); } catch { return { ...defaultAppearance, mode: systemMode() }; }
  });
  const update = (next: AppearancePreferences) => {
    setPreferences(next);
    writeAppearance(next);
  };
  const value = useMemo(() => ({
    ...defaultAppearance,
    ...preferences,
    restTimerSeconds: normalizeRestTimerSeconds(preferences.restTimerSeconds),
    colors: colorsFor(preferences),
    setMode: (mode: AppearanceMode) => update({ ...preferences, mode }),
    setAccent: (accent: AccentId) => update({ ...preferences, accent }),
    setShowWorkoutRecommendations: (showWorkoutRecommendations: boolean) => update({ ...preferences, showWorkoutRecommendations }),
    setRestTimerEnabled: (restTimerEnabled: boolean) => update({ ...preferences, restTimerEnabled }),
    setUseRecommendedRestTimer: (useRecommendedRestTimer: boolean) => update({ ...preferences, useRecommendedRestTimer }),
    setRestTimerSeconds: (restTimerSeconds: number) => update({ ...preferences, restTimerSeconds }),
  }), [preferences]);

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance must be used inside AppearanceProvider');
  return value;
}
