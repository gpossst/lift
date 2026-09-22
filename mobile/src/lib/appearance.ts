import { Appearance } from 'react-native';

export const accentOptions = [
  { id: 'yellow', name: 'Yellow', value: '#FFCC4A' },
  { id: 'red', name: 'Red', value: '#FF5151' },
  { id: 'blue', name: 'Blue', value: '#5194FF' },
] as const;

export type AppearanceMode = 'light' | 'dark';

export function systemMode(): AppearanceMode {
  return Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
}
export type AccentId = (typeof accentOptions)[number]['id'];
export type AppearancePreferences = {
  mode: AppearanceMode;
  accent: AccentId;
  showWorkoutRecommendations: boolean;
  restTimerEnabled: boolean;
  useRecommendedRestTimer: boolean;
  restTimerSeconds: number;
};

export const defaultAppearance: AppearancePreferences = {
  mode: 'light',
  accent: 'yellow',
  showWorkoutRecommendations: true,
  restTimerEnabled: true,
  useRecommendedRestTimer: false,
  restTimerSeconds: 90,
};

export function normalizeRestTimerSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(15, Math.min(600, Math.round(seconds / 15) * 15)) : defaultAppearance.restTimerSeconds;
}

export function colorsFor({ mode, accent }: AppearancePreferences) {
  const isDark = mode === 'dark';
  return {
    background: isDark ? '#151612' : '#F9F9F7',
    surface: isDark ? '#252720' : '#EDEEE9',
    surfaceStrong: isDark ? '#34372E' : '#E3E5DF',
    text: isDark ? '#F7F8F2' : '#11120F',
    mutedText: isDark ? '#A9AEA2' : '#72776D',
    subtleText: isDark ? '#747B70' : '#858980',
    inverse: isDark ? '#F7F8F2' : '#17180F',
    inverseText: isDark ? '#17180F' : '#FFFFFF',
    accent: accentOptions.find((option) => option.id === accent)?.value ?? defaultAppearance.accent,
    accentText: '#17180F',
  };
}

export type AppearanceColors = ReturnType<typeof colorsFor>;
