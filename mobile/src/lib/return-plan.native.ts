import * as SQLite from 'expo-sqlite';

const database = SQLite.openDatabaseSync('lift-settings.db');
database.execSync('CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');

export function getReturnPlan(userId: string): string | null {
  return database.getFirstSync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [`return-plan:${userId}`])?.value ?? null;
}

export function hasAskedReturnPlan(userId: string) {
  return database.getFirstSync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [`return-plan-asked:${userId}`])?.value === 'true';
}

export function saveReturnPlan(userId: string, value: string | null) {
  const key = `return-plan:${userId}`;
  if (value === null) database.runSync('DELETE FROM preferences WHERE key = ?', [key]);
  else database.runSync('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  database.runSync('INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [`return-plan-asked:${userId}`, 'true']);
}

export function clearReturnPlan(userId: string) {
  database.runSync('DELETE FROM preferences WHERE key IN (?, ?)', [`return-plan:${userId}`, `return-plan-asked:${userId}`]);
}
