import * as SQLite from 'expo-sqlite';

import { defaultAppearance, normalizeRestTimerSeconds, systemMode, type AppearancePreferences } from './appearance';

const database = SQLite.openDatabaseSync('lift-settings.db');
database.execSync('CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');

export function readAppearance(): AppearancePreferences {
  const mode = database.getFirstSync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', ['appearance-mode'])?.value;
  const accent = database.getFirstSync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', ['appearance-accent'])?.value;
  const recommendations = database.getFirstSync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', ['show-workout-recommendations'])?.value;
  const restTimerEnabled = database.getFirstSync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', ['rest-timer-enabled'])?.value;
  const useRecommendedRestTimer = database.getFirstSync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', ['use-recommended-rest-timer'])?.value;
  const restTimerSeconds = database.getFirstSync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', ['rest-timer-seconds'])?.value;
  return {
    mode: mode === 'dark' ? 'dark' : mode === 'light' ? 'light' : systemMode(),
    accent: accent === 'red' || accent === 'blue' || accent === 'yellow' ? accent : defaultAppearance.accent,
    showWorkoutRecommendations: recommendations === 'false' ? false : defaultAppearance.showWorkoutRecommendations,
    restTimerEnabled: restTimerEnabled === 'false' ? false : defaultAppearance.restTimerEnabled,
    useRecommendedRestTimer: useRecommendedRestTimer === 'true',
    restTimerSeconds: normalizeRestTimerSeconds(restTimerSeconds),
  };
}

export function writeAppearance(value: AppearancePreferences) {
  database.runSync('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['appearance-mode', value.mode]);
  database.runSync('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['appearance-accent', value.accent]);
  database.runSync('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['show-workout-recommendations', String(value.showWorkoutRecommendations)]);
  database.runSync('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['rest-timer-enabled', String(value.restTimerEnabled)]);
  database.runSync('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['use-recommended-rest-timer', String(value.useRecommendedRestTimer)]);
  database.runSync('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', ['rest-timer-seconds', String(value.restTimerSeconds)]);
}
