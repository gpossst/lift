import { defaultAppearance, normalizeRestTimerSeconds, systemMode, type AppearancePreferences } from './appearance';

const key = 'lift-appearance';

export function readAppearance(): AppearancePreferences {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(key) ?? '{}');
    return {
      mode: value.mode === 'dark' ? 'dark' : value.mode === 'light' ? 'light' : systemMode(),
      accent: value.accent === 'red' || value.accent === 'blue' || value.accent === 'yellow' ? value.accent : defaultAppearance.accent,
      showWorkoutRecommendations: typeof value.showWorkoutRecommendations === 'boolean'
        ? value.showWorkoutRecommendations
        : defaultAppearance.showWorkoutRecommendations,
      restTimerEnabled: typeof value.restTimerEnabled === 'boolean' ? value.restTimerEnabled : defaultAppearance.restTimerEnabled,
      useRecommendedRestTimer: typeof value.useRecommendedRestTimer === 'boolean' ? value.useRecommendedRestTimer : defaultAppearance.useRecommendedRestTimer,
      restTimerSeconds: normalizeRestTimerSeconds(value.restTimerSeconds),
    };
  } catch {
    return { ...defaultAppearance, mode: systemMode() };
  }
}

export function writeAppearance(value: AppearancePreferences) {
  globalThis.localStorage?.setItem(key, JSON.stringify(value));
}
