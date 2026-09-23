import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';
import { exerciseCatalog, type Exercise, workoutSplitForExercise } from './exercise-catalog';
import { buildDemoWorkoutSets, demoWorkoutIdPrefix, isDemoDataEnabled } from './demo-data';
import { getEffectiveExhaustion, getExerciseRecommendations as rankExerciseRecommendations, getRecommendedWorkoutSplit as recommendWorkoutSplit, type ExerciseRecommendation, type MuscleExhaustionRating, type RecommendationContext, type RecommendationFeedbackAction } from '@/lib/exercise-recommendations';

export type { RecommendationContext, RecommendationFeedback, RecommendationFeedbackAction } from '@/lib/exercise-recommendations';

const sqlite = SQLite.openDatabaseSync('lift.db');
sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
const DATABASE_SCHEMA_VERSION = 14;
const workoutTimeoutSeconds = 2 * 60 * 60;

function migrateDatabase() {
  const databaseVersion = sqlite.getFirstSync<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
  if (databaseVersion < 3) {
    // v3 deliberately starts from the vendored source catalog only. Clearing both
    // tables removes manually-curated duplicates and their associated set history.
    sqlite.execSync(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS workout_sets;
      DROP TABLE IF EXISTS exercise_catalog;
      PRAGMA user_version = ${DATABASE_SCHEMA_VERSION};
      PRAGMA foreign_keys = ON;
    `);
  }
  if (databaseVersion >= 3 && databaseVersion < 4) {
    // Keep historical sets intact; they remain available under one legacy visit.
    sqlite.execSync(`
      ALTER TABLE workout_sets ADD COLUMN workout_id TEXT NOT NULL DEFAULT 'legacy-workout';
    `);
  }
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY NOT NULL,
      split TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      ended_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS exercise_catalog (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      area TEXT NOT NULL,
      mark TEXT NOT NULL,
      color TEXT NOT NULL,
      equipment TEXT NOT NULL,
      is_featured INTEGER NOT NULL DEFAULT 0,
      details_json TEXT
    );
  `);
  const catalogColumns = sqlite.getAllSync<{ name: string }>('PRAGMA table_info(exercise_catalog)');
  const workoutColumns = sqlite.getAllSync<{ name: string }>('PRAGMA table_info(workouts)');
  if (!workoutColumns.some((column) => column.name === 'ended_at')) {
    sqlite.execSync('ALTER TABLE workouts ADD COLUMN ended_at INTEGER;');
  }
  if (!workoutColumns.some((column) => column.name === 'updated_at')) {
    sqlite.execSync('ALTER TABLE workouts ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;');
    sqlite.execSync('UPDATE workouts SET updated_at = MAX(created_at, COALESCE(ended_at, created_at));');
  }
  if (!catalogColumns.some((column) => column.name === 'is_featured')) {
    sqlite.execSync('ALTER TABLE exercise_catalog ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;');
  }
  if (!catalogColumns.some((column) => column.name === 'details_json')) {
    sqlite.execSync('ALTER TABLE exercise_catalog ADD COLUMN details_json TEXT;');
  }
  for (const exercise of exerciseCatalog) {
    sqlite.runSync(
      `INSERT INTO exercise_catalog (id, name, area, mark, color, equipment, is_featured, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, area = excluded.area, mark = excluded.mark,
         color = excluded.color, equipment = excluded.equipment, is_featured = excluded.is_featured,
         details_json = excluded.details_json`,
      [exercise.id, exercise.name, exercise.area, exercise.mark, exercise.color, exercise.equipment, exercise.isFeatured, exercise.detailsJson],
    );
  }

  sqlite.execSync(`
      CREATE TABLE IF NOT EXISTS workout_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        exercise_id TEXT NOT NULL REFERENCES exercise_catalog(id),
        workout_id TEXT NOT NULL REFERENCES workouts(id),
        set_number INTEGER NOT NULL,
        weight INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS workout_sets_exercise_completed_at
        ON workout_sets(exercise_id, completed_at);
      CREATE INDEX IF NOT EXISTS workout_sets_workout_exercise
        ON workout_sets(workout_id, exercise_id);
      CREATE TABLE IF NOT EXISTS workout_muscle_ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        workout_id TEXT NOT NULL REFERENCES workouts(id),
        muscle TEXT NOT NULL,
        exhaustion INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(workout_id, muscle)
      );
      CREATE TABLE IF NOT EXISTS recommendation_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        workout_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        action TEXT NOT NULL,
        related_exercise_id TEXT,
        rank INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS recommendation_feedback_exercise_created_at
        ON recommendation_feedback(exercise_id, created_at);
      CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sync_tombstones (
        entity TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        deleted_at INTEGER NOT NULL,
        PRIMARY KEY (entity, entity_key)
      );
      CREATE TABLE IF NOT EXISTS sync_versions (
        entity TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        revision INTEGER NOT NULL,
        PRIMARY KEY (entity, entity_key)
      );
      CREATE TABLE IF NOT EXISTS sync_outbox (
        entity TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        operation TEXT NOT NULL,
        record_json TEXT,
        base_revision INTEGER NOT NULL,
        mutation_id TEXT NOT NULL,
        batch_id TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (mutation_id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS sync_outbox_unbatched_key
        ON sync_outbox(entity, entity_key) WHERE batch_id IS NULL;
  `);

  const setColumns = sqlite.getAllSync<{ name: string }>('PRAGMA table_info(workout_sets)');
  if (!setColumns.some((column) => column.name === 'updated_at')) {
    sqlite.execSync('ALTER TABLE workout_sets ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;');
    sqlite.execSync('UPDATE workout_sets SET updated_at = completed_at;');
  }
  // Set number is the stable identity inside an exercise/workout. Retain the
  // latest accidental legacy duplicate before enforcing conflict-safe upserts.
  sqlite.execSync('DELETE FROM workout_sets WHERE id NOT IN (SELECT MAX(id) FROM workout_sets GROUP BY workout_id, exercise_id, set_number);');
  sqlite.execSync('CREATE UNIQUE INDEX IF NOT EXISTS workout_sets_sync_identity ON workout_sets(workout_id, exercise_id, set_number);');
  const feedbackColumns = sqlite.getAllSync<{ name: string }>('PRAGMA table_info(recommendation_feedback)');
  if (!feedbackColumns.some((column) => column.name === 'rank')) {
    sqlite.execSync('ALTER TABLE recommendation_feedback ADD COLUMN rank INTEGER;');
  }
  if (!feedbackColumns.some((column) => column.name === 'updated_at')) {
    sqlite.execSync('ALTER TABLE recommendation_feedback ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0; UPDATE recommendation_feedback SET updated_at = created_at;');
  }
  sqlite.execSync('DELETE FROM recommendation_feedback WHERE id NOT IN (SELECT MIN(id) FROM recommendation_feedback GROUP BY workout_id, exercise_id, action);');
  sqlite.execSync('CREATE UNIQUE INDEX IF NOT EXISTS recommendation_feedback_identity ON recommendation_feedback(workout_id, exercise_id, action);');

  if (databaseVersion < DATABASE_SCHEMA_VERSION) {
    sqlite.runSync("INSERT INTO sync_state (key, value) VALUES ('cloud_sync_needs_seed', '1') ON CONFLICT(key) DO UPDATE SET value = '1'");
    sqlite.execSync(`PRAGMA user_version = ${DATABASE_SCHEMA_VERSION};`);
  }

  syncDemoWorkoutData();
}

function syncDemoWorkoutData() {
  // Demo rows have a dedicated prefix, making the switch safe around real data.
  // Ratings reference workouts, so clear them before removing their parent
  // demo workouts. SQLite foreign-key enforcement is enabled for this database.
  sqlite.runSync('DELETE FROM workout_muscle_ratings WHERE workout_id LIKE ?', [`${demoWorkoutIdPrefix}%`]);
  sqlite.runSync('DELETE FROM workout_sets WHERE workout_id LIKE ?', [`${demoWorkoutIdPrefix}%`]);
  sqlite.runSync('DELETE FROM workouts WHERE id LIKE ?', [`${demoWorkoutIdPrefix}%`]);
  if (!isDemoDataEnabled) return;

  const demoSets = buildDemoWorkoutSets(exerciseCatalog);
  const visits = new Map<string, number>();
  for (const set of demoSets) visits.set(set.workoutId, Math.min(visits.get(set.workoutId) ?? Infinity, set.completedAt.getTime()));
  for (const [id, createdAt] of visits) {
    const stamp = Math.floor(createdAt / 1000);
    sqlite.runSync('INSERT INTO workouts (id, split, created_at, ended_at, updated_at) VALUES (?, ?, ?, ?, ?)', [id, 'push', stamp, stamp, stamp]);
  }
  for (const set of demoSets) {
    sqlite.runSync(
      `INSERT INTO workout_sets (exercise_id, workout_id, set_number, weight, reps, completed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [set.exerciseId, set.workoutId, set.setNumber, set.weight, set.reps, Math.floor(set.completedAt.getTime() / 1000)],
    );
  }
}

migrateDatabase();
export const db = drizzle(sqlite, { schema });

type StoredWorkoutSet = { workoutId: string; setNumber: number; weight: number; reps: number; completedAt: number };
export type WorkoutHistoryPoint = { workoutId: string; setNumber: number; weight: number; reps: number; completedAt: Date };
export type WorkoutStats = { visits: number; sets: number; volume: number };
export type WorkoutActivity = { date: string; volume: number; sets: number; visits: number };
export type WorkoutSplitTrend = { split: 'ALL' | 'PUSH' | 'PULL' | 'LEGS'; points: { weekStart: string; volume: number }[] };
export type WorkoutSplit = 'push' | 'pull' | 'legs';
export type Workout = { id: string; split: WorkoutSplit; createdAt: Date; endedAt: Date | null };
export type WorkoutVisitSummary = { workout: Workout; sets: number; exercises: number; volume: number; reps: number };
export type WorkoutVisitExercise = { id: string; name: string; sets: number; volume: number };
export type WorkoutVisitExerciseDetail = { id: string; name: string; sets: { number: number; weight: number; reps: number }[] };
export type WorkoutAchievement = { exerciseId: string; name: string; level: 'silver' | 'gold'; metric: 'weight' | 'reps'; weight: number; reps?: number };
export type WorkoutProgressPoint = { workoutId: string; volume: number; completedAt: Date };
export type WorkoutMuscle = { id: string; name: string; area: string };
export type WorkoutMuscleRating = WorkoutMuscle & { exhaustion: number };
export type CloudSyncTombstone = { entity: 'workout' | 'set' | 'rating'; key: string; deletedAt: number };
export type CloudSyncEntity = 'workout' | 'set' | 'rating' | 'feedback';
export type CloudSyncChange = { entity: CloudSyncEntity; key: string; operation: 'upsert' | 'delete'; baseRevision: number; record?: Record<string, unknown> };
export type CloudSyncRemoteChange = Omit<CloudSyncChange, 'baseRevision'> & { revision: number };
export type CloudSyncBatch = { batchId: string; changes: CloudSyncChange[] };

function syncedWrite<T>(write: () => T, queue: (result: T) => void): T {
  sqlite.execSync('BEGIN IMMEDIATE');
  try {
    const result = write();
    queue(result);
    sqlite.execSync('COMMIT');
    return result;
  } catch (error) {
    sqlite.execSync('ROLLBACK');
    throw error;
  }
}

const exerciseColumns = 'id, name, area, mark, color, equipment, is_featured AS isFeatured, details_json AS detailsJson';

export function getExercises(): Exercise[] {
  return sqlite.getAllSync<Exercise>(`SELECT ${exerciseColumns} FROM exercise_catalog ORDER BY name`);
}

export function getFeaturedExercises(): Exercise[] {
  return sqlite.getAllSync<Exercise>(`SELECT ${exerciseColumns} FROM exercise_catalog WHERE is_featured = 1 ORDER BY name`);
}

export function getRecommendedWorkoutSplit(now = new Date()): WorkoutSplit {
  const muscleRatings: MuscleExhaustionRating[] = [];
  const history = getWorkoutVisits().map((visit) => {
    const ratings = getWorkoutMuscleRatings(visit.workout.id);
    const completedAt = visit.workout.endedAt ?? visit.workout.createdAt;
    muscleRatings.push(...ratings.map((rating) => ({ workoutId: visit.workout.id, split: visit.workout.split, muscle: rating.id, exhaustion: rating.exhaustion, completedAt })));
    return {
      split: visit.workout.split,
      completedAt,
      sets: visit.sets,
    };
  });
  return recommendWorkoutSplit(history, now, muscleRatings);
}

export function createWorkout(split: WorkoutSplit): Workout {
  const workout = { id: `workout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, split, createdAt: new Date(), endedAt: null };
  const stamp = Math.floor(workout.createdAt.getTime() / 1000);
  syncedWrite(
    () => sqlite.runSync('INSERT INTO workouts (id, split, created_at, updated_at) VALUES (?, ?, ?, ?)', [workout.id, workout.split, stamp, stamp]),
    () => markCloudSyncDirty('workout', workout.id),
  );
  return workout;
}

export function saveWorkoutSet(set: { exerciseId: string; workoutId: string; setNumber: number; weight: number; reps: number; completedAt: Date }) {
  const stamp = Math.floor(set.completedAt.getTime() / 1000);
  syncedWrite(
    () => sqlite.runSync('INSERT INTO workout_sets (exercise_id, workout_id, set_number, weight, reps, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [set.exerciseId, set.workoutId, set.setNumber, set.weight, set.reps, stamp, stamp]),
    () => markCloudSyncDirty('set', cloudSetKey(set.workoutId, set.exerciseId, set.setNumber)),
  );
}

/** Marks workouts that can no longer be resumed as finished at their timeout. */
export function closeExpiredWorkouts(now = new Date()): number {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const expired = sqlite.getAllSync<{ id: string }>('SELECT id FROM workouts WHERE ended_at IS NULL AND created_at + ? <= ?', [workoutTimeoutSeconds, nowSeconds]);
  const result = syncedWrite(
    () => sqlite.runSync(
      `UPDATE workouts
       SET ended_at = created_at + ?, updated_at = created_at + ?
       WHERE ended_at IS NULL AND created_at + ? <= ?`,
      [workoutTimeoutSeconds, workoutTimeoutSeconds, workoutTimeoutSeconds, nowSeconds],
    ),
    () => { for (const workout of expired) markCloudSyncDirty('workout', workout.id); },
  );
  return result.changes;
}

/** Returns the most recently started workout that has not been ended yet. */
export function getActiveWorkout(): Workout | null {
  closeExpiredWorkouts();
  const workout = sqlite.getFirstSync<{ id: string; split: WorkoutSplit; createdAt: number }>(
    'SELECT id, split, created_at AS createdAt FROM workouts WHERE ended_at IS NULL ORDER BY created_at DESC LIMIT 1',
  );
  return workout ? { ...workout, createdAt: new Date(workout.createdAt * 1000), endedAt: null } : null;
}

export function endWorkout(workoutId: string): Workout | null {
  const endedAt = new Date();
  const stamp = Math.floor(endedAt.getTime() / 1000);
  syncedWrite(
    () => sqlite.runSync('UPDATE workouts SET ended_at = ?, updated_at = ? WHERE id = ? AND ended_at IS NULL', [stamp, stamp, workoutId]),
    (write) => { if (write.changes) markCloudSyncDirty('workout', workoutId); },
  );
  const summary = getWorkoutVisitSummary(workoutId);
  return summary?.workout ?? null;
}

export function getWorkoutVisitSummary(workoutId: string): WorkoutVisitSummary | null {
  const workout = sqlite.getFirstSync<{ id: string; split: WorkoutSplit; createdAt: number; endedAt: number | null }>(
    'SELECT id, split, created_at AS createdAt, ended_at AS endedAt FROM workouts WHERE id = ?', [workoutId],
  );
  if (!workout) return null;
  const totals = sqlite.getFirstSync<{ sets: number; exercises: number; volume: number; reps: number }>(
    `SELECT COUNT(*) AS sets, COUNT(DISTINCT exercise_id) AS exercises,
      COALESCE(SUM(weight * reps), 0) AS volume, COALESCE(SUM(reps), 0) AS reps FROM workout_sets WHERE workout_id = ?`, [workoutId],
  ) ?? { sets: 0, exercises: 0, volume: 0, reps: 0 };
  return { workout: { ...workout, createdAt: new Date(workout.createdAt * 1000), endedAt: workout.endedAt ? new Date(workout.endedAt * 1000) : null }, ...totals };
}

export function getWorkoutVisitExercises(workoutId: string): WorkoutVisitExercise[] {
  return sqlite.getAllSync<WorkoutVisitExercise>(
    `SELECT exercise_catalog.id AS id, exercise_catalog.name AS name, COUNT(*) AS sets,
      COALESCE(SUM(workout_sets.weight * workout_sets.reps), 0) AS volume
     FROM workout_sets INNER JOIN exercise_catalog ON exercise_catalog.id = workout_sets.exercise_id
     WHERE workout_sets.workout_id = ? GROUP BY workout_sets.exercise_id ORDER BY volume DESC`, [workoutId],
  );
}

/** Completed workouts with at least one logged set, newest first. */
export function getWorkoutVisits(): WorkoutVisitSummary[] {
  const visits = sqlite.getAllSync<{ id: string; split: WorkoutSplit; createdAt: number; endedAt: number | null; sets: number; exercises: number; volume: number; reps: number }>(
    `SELECT workouts.id AS id, workouts.split AS split, workouts.created_at AS createdAt, workouts.ended_at AS endedAt,
      COUNT(workout_sets.id) AS sets, COUNT(DISTINCT workout_sets.exercise_id) AS exercises,
      COALESCE(SUM(workout_sets.weight * workout_sets.reps), 0) AS volume, COALESCE(SUM(workout_sets.reps), 0) AS reps
     FROM workouts INNER JOIN workout_sets ON workout_sets.workout_id = workouts.id
     GROUP BY workouts.id ORDER BY COALESCE(workouts.ended_at, workouts.created_at) DESC, workouts.id ASC`,
  );
  return visits.map((visit) => ({ ...visit, workout: { id: visit.id, split: visit.split, createdAt: new Date(visit.createdAt * 1000), endedAt: visit.endedAt ? new Date(visit.endedAt * 1000) : null } }));
}

export function getWorkoutVisitExerciseDetails(workoutId: string): WorkoutVisitExerciseDetail[] {
  const rows = sqlite.getAllSync<{ id: string; name: string; number: number; weight: number; reps: number }>(
    `SELECT exercise_catalog.id AS id, exercise_catalog.name AS name, workout_sets.set_number AS number,
      workout_sets.weight AS weight, workout_sets.reps AS reps
     FROM workout_sets INNER JOIN exercise_catalog ON exercise_catalog.id = workout_sets.exercise_id
     WHERE workout_sets.workout_id = ? ORDER BY exercise_catalog.name ASC, workout_sets.set_number ASC`,
    [workoutId],
  );
  const exercises = new Map<string, WorkoutVisitExerciseDetail>();
  for (const row of rows) {
    const exercise = exercises.get(row.id) ?? { id: row.id, name: row.name, sets: [] };
    exercise.sets.push({ number: row.number, weight: row.weight, reps: row.reps });
    exercises.set(row.id, exercise);
  }
  return [...exercises.values()];
}

export function getWorkoutAchievements(workoutId: string): WorkoutAchievement[] {
  return getWorkoutVisitExercises(workoutId).flatMap<WorkoutAchievement>((exercise) => {
    const history = getWorkoutHistory(exercise.id);
    const current = history.filter((set) => set.workoutId === workoutId);
    const previous = history.filter((set) => set.workoutId !== workoutId);
    if (!previous.length) return [];
    const maxCurrentWeight = Math.max(...current.map((set) => set.weight));
    const maxPreviousWeight = Math.max(...previous.map((set) => set.weight));
    if (maxCurrentWeight > 0 && maxCurrentWeight >= maxPreviousWeight) return [{ exerciseId: exercise.id, name: exercise.name, level: maxCurrentWeight > maxPreviousWeight ? 'gold' as const : 'silver' as const, metric: 'weight' as const, weight: maxCurrentWeight }];
    const repResult = current.flatMap((set) => {
      const priorReps = previous.filter((item) => item.weight === set.weight).map((item) => item.reps);
      if (!priorReps.length) return [];
      const bestPriorReps = Math.max(...priorReps);
      return set.reps >= bestPriorReps ? [{ level: set.reps > bestPriorReps ? 'gold' as const : 'silver' as const, weight: set.weight, reps: set.reps }] : [];
    }).sort((a, b) => (a.level === 'gold' ? -1 : 1) - (b.level === 'gold' ? -1 : 1) || b.reps - a.reps)[0];
    return repResult ? [{ exerciseId: exercise.id, name: exercise.name, ...repResult, metric: 'reps' as const }] : [];
  }).sort((a, b) => (a.level === 'gold' ? -1 : 1) - (b.level === 'gold' ? -1 : 1));
}

/** The most recent comparable sessions, including the workout being viewed. */
export function getWorkoutProgress(workoutId: string): WorkoutProgressPoint[] {
  const current = getWorkoutVisitSummary(workoutId);
  if (!current) return [];
  return sqlite.getAllSync<{ workoutId: string; volume: number; completedAt: number }>(
    `SELECT workouts.id AS workoutId, COALESCE(SUM(workout_sets.weight * workout_sets.reps), 0) AS volume,
      COALESCE(workouts.ended_at, workouts.created_at) AS completedAt
     FROM workouts
     INNER JOIN workout_sets ON workout_sets.workout_id = workouts.id
     WHERE workouts.split = ?
     GROUP BY workouts.id
     ORDER BY completedAt DESC, workoutId ASC
     LIMIT 6`, [current.workout.split],
  ).reverse().map((point) => ({ ...point, completedAt: new Date(point.completedAt * 1000) }));
}

const muscleNames: Record<string, string> = {
  abdominals: 'Abs', abductors: 'Abductors', adductors: 'Adductors', biceps: 'Biceps', calves: 'Calves', chest: 'Chest',
  forearms: 'Forearms', glutes: 'Glutes', hamstrings: 'Hamstrings', lats: 'Lats', 'lower back': 'Lower back',
  'middle back': 'Mid back', neck: 'Neck', quadriceps: 'Quads', shoulders: 'Shoulders', traps: 'Traps', triceps: 'Triceps',
};

export function getWorkoutMuscles(workoutId: string): WorkoutMuscle[] {
  const rows = sqlite.getAllSync<{ area: string; detailsJson: string | null }>(
    `SELECT DISTINCT exercise_catalog.area AS area, exercise_catalog.details_json AS detailsJson
     FROM workout_sets INNER JOIN exercise_catalog ON workout_sets.exercise_id = exercise_catalog.id
     WHERE workout_sets.workout_id = ?`, [workoutId],
  );
  const muscles = new Map<string, WorkoutMuscle>();
  for (const row of rows) {
    let primary: string[] = [];
    try { primary = JSON.parse(row.detailsJson ?? '{}').primaryMuscles ?? []; } catch { /* fall back to area */ }
    for (const muscle of primary) muscles.set(muscle, { id: muscle, name: muscleNames[muscle] ?? muscle, area: row.area });
    if (!primary.length) {
      const id = row.area.toLowerCase();
      muscles.set(id, { id, name: row.area.replace(/\b\w/g, (letter) => letter.toUpperCase()), area: row.area });
    }
  }
  return [...muscles.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function saveWorkoutMuscleRatings(workoutId: string, ratings: Record<string, number>) {
  const createdAt = Math.floor(Date.now() / 1000);
  syncedWrite(
    () => { for (const [muscle, exhaustion] of Object.entries(ratings)) sqlite.runSync(
      `INSERT INTO workout_muscle_ratings (workout_id, muscle, exhaustion, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(workout_id, muscle) DO UPDATE SET exhaustion = excluded.exhaustion, created_at = excluded.created_at`,
      [workoutId, muscle, exhaustion, createdAt],
    ); },
    () => { for (const muscle of Object.keys(ratings)) markCloudSyncDirty('rating', [workoutId, muscle].join('\u001F')); },
  );
}

export function getWorkoutMuscleRatings(workoutId: string): WorkoutMuscleRating[] {
  const ratings = new Map(sqlite.getAllSync<{ muscle: string; exhaustion: number }>(
    'SELECT muscle, exhaustion FROM workout_muscle_ratings WHERE workout_id = ?', [workoutId],
  ).map((rating) => [rating.muscle, rating.exhaustion]));
  return getWorkoutMuscles(workoutId).flatMap((muscle) => {
    const exhaustion = ratings.get(muscle.id);
    return exhaustion === undefined ? [] : [{ ...muscle, exhaustion }];
  });
}

export function getExerciseRecommendations(workoutId: string, split: WorkoutSplit, limit?: number, context?: RecommendationContext): ExerciseRecommendation[] {
  const sets = sqlite.getAllSync<{ exerciseId: string; workoutId: string; weight: number; reps: number; completedAt: number }>(
    `SELECT workout_sets.exercise_id AS exerciseId, workout_sets.workout_id AS workoutId, weight, reps, completed_at AS completedAt
     FROM workout_sets LEFT JOIN workouts ON workouts.id = workout_sets.workout_id
     WHERE workout_sets.workout_id = ? OR workouts.ended_at IS NOT NULL OR workouts.id IS NULL
     ORDER BY workout_sets.completed_at ASC, workout_sets.workout_id ASC, workout_sets.set_number ASC`,
    [workoutId],
  ).map((set) => ({ ...set, completedAt: new Date(set.completedAt * 1000) }));
  const muscleRatings = sqlite.getAllSync<{ workoutId: string; split: WorkoutSplit; muscle: string; exhaustion: number; completedAt: number }>(
    `SELECT workout_muscle_ratings.workout_id AS workoutId, workouts.split AS split, muscle, exhaustion,
      COALESCE(workouts.ended_at, workouts.created_at) AS completedAt
     FROM workout_muscle_ratings
     INNER JOIN workouts ON workouts.id = workout_muscle_ratings.workout_id
     ORDER BY completedAt ASC, workoutId ASC, muscle ASC`,
  ).map((rating) => ({ ...rating, completedAt: new Date(rating.completedAt * 1000) }));
  const feedback = sqlite.getAllSync<{ workoutId: string; exerciseId: string; action: RecommendationFeedbackAction; rank?: number; createdAt: number }>(
    `SELECT workout_id AS workoutId, exercise_id AS exerciseId, action, rank, created_at AS createdAt FROM recommendation_feedback
     ORDER BY created_at ASC, workout_id ASC, exercise_id ASC, action ASC`,
  ).map((item) => ({ ...item, createdAt: new Date(item.createdAt * 1000) }));
  return rankExerciseRecommendations(getExercises(), sets, muscleRatings, workoutId, split, limit, undefined, context, feedback);
}

export function recordRecommendationFeedback(
  workoutId: string, exerciseId: string, action: RecommendationFeedbackAction, rank?: number,
): void {
  const createdAt = Math.floor(Date.now() / 1000);
  syncedWrite(
    () => sqlite.runSync(
      `INSERT OR IGNORE INTO recommendation_feedback (workout_id, exercise_id, action, rank, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [workoutId, exerciseId, action, rank ?? null, createdAt, createdAt],
    ),
    (write) => { if (write.changes) markCloudSyncDirty('feedback', [workoutId, exerciseId, action].join('\u001F')); },
  );
}

export function getNextSetNumberForWorkout(exerciseId: string, workoutId: string) {
  const result = sqlite.getFirstSync<{ lastSet: number | null }>(
    'SELECT MAX(set_number) AS lastSet FROM workout_sets WHERE exercise_id = ? AND workout_id = ?',
    [exerciseId, workoutId],
  );

  return (result?.lastSet ?? 0) + 1;
}

export function getWorkoutHistory(exerciseId: string) {
  return sqlite
    .getAllSync<StoredWorkoutSet>(
      'SELECT workout_id AS workoutId, set_number AS setNumber, weight, reps, completed_at AS completedAt FROM workout_sets WHERE exercise_id = ? ORDER BY completed_at ASC, workout_id ASC, set_number ASC',
      [exerciseId],
    )
    .map((set) => ({ ...set, completedAt: new Date(set.completedAt * 1000) }));
}

export function getRecentExerciseExhaustion(exerciseId: string, excludingWorkoutId: string, now = new Date()): number | undefined {
  const exercise = getExercises().find((item) => item.id === exerciseId);
  let muscles: string[] = [];
  try { muscles = JSON.parse(exercise?.detailsJson ?? '{}').primaryMuscles ?? []; } catch { /* Missing catalog metadata means there is no safe fatigue match. */ }
  if (!muscles.length) return undefined;
  const rows = sqlite.getAllSync<{ workoutId: string; exhaustion: number; completedAt: number }>(
    `SELECT workout_muscle_ratings.workout_id AS workoutId, exhaustion,
       COALESCE(workouts.ended_at, workouts.created_at) AS completedAt
     FROM workout_muscle_ratings INNER JOIN workouts ON workouts.id = workout_muscle_ratings.workout_id
     WHERE workout_muscle_ratings.workout_id != ? AND muscle IN (${muscles.map(() => '?').join(',')})
       AND COALESCE(workouts.ended_at, workouts.created_at) >= ?
     ORDER BY completedAt DESC, workoutId ASC, muscle ASC`,
    [excludingWorkoutId, ...muscles, Math.floor((now.getTime() - 14 * 86_400_000) / 1000)],
  );
  if (!rows.length) return undefined;
  const latest = rows[0]!.workoutId;
  const ratings = rows.filter((row) => row.workoutId === latest).map((row) => getEffectiveExhaustion(row.exhaustion, new Date(row.completedAt * 1000), now));
  return Math.max(...ratings);
}

export function getWorkoutStats(): WorkoutStats {
  return sqlite.getFirstSync<WorkoutStats>(`
    SELECT COUNT(DISTINCT workout_id) AS visits, COUNT(*) AS sets,
      COALESCE(SUM(weight * reps), 0) AS volume
    FROM workout_sets
  `) ?? { visits: 0, sets: 0, volume: 0 };
}

export function getWorkoutActivity(days = 28): WorkoutActivity[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const rows = sqlite.getAllSync<{ completedAt: number; workoutId: string; weight: number; reps: number }>(
    'SELECT completed_at AS completedAt, workout_id AS workoutId, weight, reps FROM workout_sets WHERE completed_at >= ? ORDER BY completed_at ASC, workout_id ASC, set_number ASC',
    [Math.floor(start.getTime() / 1000)],
  );
  const byDate = new Map<string, WorkoutActivity>();
  for (let index = 0; index < days; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const date = day.toISOString().slice(0, 10);
    byDate.set(date, { date, volume: 0, sets: 0, visits: 0 });
  }
  const visitDays = new Set<string>();
  for (const row of rows) {
    const date = new Date(row.completedAt * 1000).toISOString().slice(0, 10);
    const item = byDate.get(date);
    if (!item) continue;
    item.volume += row.weight * row.reps;
    item.sets += 1;
    const visitKey = `${date}:${row.workoutId}`;
    if (!visitDays.has(visitKey)) {
      item.visits += 1;
      visitDays.add(visitKey);
    }
  }
  return [...byDate.values()];
}

export function getWorkoutSplitTrends(weeks = 8): WorkoutSplitTrend[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  const rows = sqlite.getAllSync<{ area: string; detailsJson: string | null; completedAt: number; workoutId: string; weight: number; reps: number }>(
    `SELECT exercise_catalog.area AS area, exercise_catalog.details_json AS detailsJson, workout_sets.completed_at AS completedAt,
      workout_sets.workout_id AS workoutId, workout_sets.weight AS weight, workout_sets.reps AS reps
     FROM workout_sets INNER JOIN exercise_catalog ON workout_sets.exercise_id = exercise_catalog.id
     WHERE workout_sets.completed_at >= ? ORDER BY workout_sets.completed_at ASC, workout_sets.workout_id ASC, workout_sets.set_number ASC`,
    [Math.floor(start.getTime() / 1000)],
  );
  const trends = new Map<WorkoutSplitTrend['split'], WorkoutSplitTrend>();
  const emptyPoints = () => Array.from({ length: weeks }, (_, index) => {
    const week = new Date(start);
    week.setDate(start.getDate() + index * 7);
    return { weekStart: week.toISOString().slice(0, 10), volume: 0 };
  });
  trends.set('ALL', { split: 'ALL', points: emptyPoints() });
  const workoutsBySplitWeek = new Map<WorkoutSplitTrend['split'], Set<string>[]>();
  for (const row of rows) {
    const index = Math.floor((new Date(row.completedAt * 1000).getTime() - start.getTime()) / 86_400_000 / 7);
    if (index < 0 || index >= weeks) continue;
    trends.get('ALL')!.points[index].volume += row.weight * row.reps;
    const split = workoutSplitForExercise({ area: row.area, detailsJson: row.detailsJson });
    if (!split) continue;
    if (!trends.has(split)) {
      trends.set(split, { split, points: emptyPoints() });
      workoutsBySplitWeek.set(split, Array.from({ length: weeks }, () => new Set<string>()));
    }
    trends.get(split)!.points[index].volume += row.weight * row.reps;
    workoutsBySplitWeek.get(split)![index].add(row.workoutId);
  }
  const order: WorkoutSplitTrend['split'][] = ['PUSH', 'PULL', 'LEGS', 'ALL'];
  return order.filter((split) => trends.has(split)).map((split) => {
    const trend = trends.get(split)!;
    if (split !== 'ALL') trend.points.forEach((point, index) => { point.volume /= workoutsBySplitWeek.get(split)![index].size || 1; });
    return trend;
  });
}

export function deleteWorkoutSet(exerciseId: string, set: WorkoutHistoryPoint) {
  syncedWrite(
    () => sqlite.runSync(
      'DELETE FROM workout_sets WHERE exercise_id = ? AND workout_id = ? AND set_number = ? AND weight = ? AND reps = ? AND completed_at = ?',
      [exerciseId, set.workoutId, set.setNumber, set.weight, set.reps, Math.floor(set.completedAt.getTime() / 1000)],
    ),
    (write) => { if (write.changes) queueCloudSyncTombstone('set', cloudSetKey(set.workoutId, exerciseId, set.setNumber)); },
  );
}

const cloudKeySeparator = '\u001F';
const cloudSetKey = (workoutId: string, exerciseId: string, setNumber: number) => [workoutId, exerciseId, setNumber].join(cloudKeySeparator);
const syncState = (key: string) => sqlite.getFirstSync<{ value: string }>('SELECT value FROM sync_state WHERE key = ?', [key])?.value ?? null;
const setSyncState = (key: string, value: string) => sqlite.runSync("INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, value]);

const mutationId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const syncVersion = (entity: CloudSyncEntity, key: string) => sqlite.getFirstSync<{ revision: number }>('SELECT revision FROM sync_versions WHERE entity = ? AND entity_key = ?', [entity, key])?.revision ?? 0;

function localSyncRecord(entity: CloudSyncEntity, key: string): Record<string, unknown> | null {
  if (entity === 'workout') return sqlite.getFirstSync<Record<string, unknown>>('SELECT id, split, created_at AS createdAt, ended_at AS endedAt FROM workouts WHERE id = ?', [key]);
  if (entity === 'set') {
    const [workoutId, exerciseId, setNumber] = key.split(cloudKeySeparator);
    const set = sqlite.getFirstSync<Record<string, unknown>>('SELECT exercise_id AS exerciseId, workout_id AS workoutId, set_number AS setNumber, weight, reps, completed_at AS completedAt FROM workout_sets WHERE workout_id = ? AND exercise_id = ? AND set_number = ?', [workoutId, exerciseId, Number(setNumber)]);
    if (!set) return null;
    const exercise = getExercises().find((item) => item.id === exerciseId);
    let muscles: string[] = [];
    try { muscles = JSON.parse(exercise?.detailsJson ?? '{}').primaryMuscles ?? [exercise?.area.toLowerCase()].filter(Boolean); } catch { muscles = exercise ? [exercise.area.toLowerCase()] : []; }
    return { ...set, muscles };
  }
  if (entity === 'rating') {
    const [workoutId, muscle] = key.split(cloudKeySeparator);
    return sqlite.getFirstSync<Record<string, unknown>>('SELECT workout_id AS workoutId, muscle, exhaustion, created_at AS createdAt FROM workout_muscle_ratings WHERE workout_id = ? AND muscle = ?', [workoutId, muscle]);
  }
  const [workoutId, exerciseId, action] = key.split(cloudKeySeparator);
  return sqlite.getFirstSync<Record<string, unknown>>('SELECT workout_id AS workoutId, exercise_id AS exerciseId, action, rank, created_at AS createdAt FROM recommendation_feedback WHERE workout_id = ? AND exercise_id = ? AND action = ?', [workoutId, exerciseId, action]);
}

function enqueueCloudSync(entity: CloudSyncEntity, key: string, operation: 'upsert' | 'delete') {
  const record = operation === 'upsert' ? localSyncRecord(entity, key) : null;
  if (operation === 'upsert' && !record) return;
  const id = mutationId();
  sqlite.runSync(`INSERT INTO sync_outbox (entity, entity_key, operation, record_json, base_revision, mutation_id, batch_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    ON CONFLICT(entity, entity_key) WHERE batch_id IS NULL DO UPDATE SET operation = excluded.operation, record_json = excluded.record_json,
      base_revision = excluded.base_revision, mutation_id = excluded.mutation_id, created_at = excluded.created_at`,
  [entity, key, operation, record ? JSON.stringify(record) : null, syncVersion(entity, key), id, Date.now()]);
}

function seedCloudSyncOutbox() {
  if (syncState('cloud_sync_needs_seed') !== '1' && syncState('cloud_sync_pending') !== '1') return;
  for (const { id } of sqlite.getAllSync<{ id: string }>('SELECT id FROM workouts WHERE id NOT LIKE ?', [`${demoWorkoutIdPrefix}%`])) enqueueCloudSync('workout', id, 'upsert');
  for (const set of sqlite.getAllSync<{ workoutId: string; exerciseId: string; setNumber: number }>('SELECT workout_id AS workoutId, exercise_id AS exerciseId, set_number AS setNumber FROM workout_sets WHERE workout_id NOT LIKE ?', [`${demoWorkoutIdPrefix}%`])) enqueueCloudSync('set', cloudSetKey(set.workoutId, set.exerciseId, set.setNumber), 'upsert');
  for (const rating of sqlite.getAllSync<{ workoutId: string; muscle: string }>('SELECT workout_id AS workoutId, muscle FROM workout_muscle_ratings WHERE workout_id NOT LIKE ?', [`${demoWorkoutIdPrefix}%`])) enqueueCloudSync('rating', [rating.workoutId, rating.muscle].join(cloudKeySeparator), 'upsert');
  for (const item of sqlite.getAllSync<{ workoutId: string; exerciseId: string; action: string }>('SELECT workout_id AS workoutId, exercise_id AS exerciseId, action FROM recommendation_feedback WHERE workout_id NOT LIKE ?', [`${demoWorkoutIdPrefix}%`])) enqueueCloudSync('feedback', [item.workoutId, item.exerciseId, item.action].join(cloudKeySeparator), 'upsert');
  for (const item of sqlite.getAllSync<{ entity: CloudSyncEntity; key: string }>('SELECT entity, entity_key AS key FROM sync_tombstones')) enqueueCloudSync(item.entity, item.key, 'delete');
  sqlite.execSync("DELETE FROM sync_state WHERE key IN ('cloud_sync_needs_seed', 'cloud_sync_pending')");
}

export function markCloudSyncDirty(entity?: CloudSyncEntity, key?: string) {
  if (entity && key) enqueueCloudSync(entity, key, 'upsert');
  else setSyncState('cloud_sync_needs_seed', '1');
}
export function hasPendingCloudSync() { seedCloudSyncOutbox(); return !!sqlite.getFirstSync('SELECT 1 FROM sync_outbox LIMIT 1'); }
export function recordCloudSyncFailure() { setSyncState('cloud_sync_failed_at', String(Math.floor(Date.now() / 1000))); }
export function getCloudSyncBatch(limit = 3): CloudSyncBatch | null {
  seedCloudSyncOutbox();
  const existing = sqlite.getFirstSync<{ batchId: string }>('SELECT batch_id AS batchId FROM sync_outbox WHERE batch_id IS NOT NULL ORDER BY created_at, rowid LIMIT 1');
  const batchId = existing?.batchId ?? mutationId();
  if (!existing) sqlite.runSync('UPDATE sync_outbox SET batch_id = ? WHERE mutation_id IN (SELECT mutation_id FROM sync_outbox WHERE batch_id IS NULL ORDER BY created_at, rowid LIMIT ?)', [batchId, Math.min(limit, 3)]);
  const rows = sqlite.getAllSync<{ entity: CloudSyncEntity; key: string; operation: 'upsert' | 'delete'; recordJson: string | null; baseRevision: number }>('SELECT entity, entity_key AS key, operation, record_json AS recordJson, base_revision AS baseRevision FROM sync_outbox WHERE batch_id = ? ORDER BY created_at, rowid', [batchId]);
  return rows.length ? { batchId, changes: rows.map(({ recordJson, ...row }) => ({ ...row, record: recordJson ? JSON.parse(recordJson) : undefined })) } : null;
}
export function acknowledgeCloudSyncBatch(batchId: string, revision: number) {
  const keys = sqlite.getAllSync<{ entity: CloudSyncEntity; key: string; operation: string }>('SELECT entity, entity_key AS key, operation FROM sync_outbox WHERE batch_id = ?', [batchId]);
  sqlite.runSync('DELETE FROM sync_outbox WHERE batch_id = ?', [batchId]);
  for (const item of keys) {
    sqlite.runSync('UPDATE sync_outbox SET base_revision = MAX(base_revision, ?) WHERE entity = ? AND entity_key = ?', [revision, item.entity, item.key]);
    if (item.operation === 'delete') sqlite.runSync('DELETE FROM sync_tombstones WHERE entity = ? AND entity_key = ?', [item.entity, item.key]);
  }
  sqlite.execSync("DELETE FROM sync_state WHERE key = 'cloud_sync_failed_at'");
}
export function getCloudSyncCursor() { return Number(syncState('cloud_sync_cursor') ?? 0); }
function queueCloudSyncTombstone(entity: CloudSyncTombstone['entity'], key: string) {
  sqlite.runSync('INSERT INTO sync_tombstones (entity, entity_key, deleted_at) VALUES (?, ?, 0) ON CONFLICT(entity, entity_key) DO UPDATE SET deleted_at = 0', [entity, key]);
  enqueueCloudSync(entity, key, 'delete');
}

/** Bind this device cache to the active account. On a real account switch,
 * old cached rows are discarded; the acknowledged account copy remains remote. */
export function prepareCloudSyncForUser(userId: string) {
  const activeUserId = syncState('active_user_id') ?? syncState('active_clerk_user_id');
  if (!activeUserId) {
    setSyncState('active_user_id', userId);
    if (sqlite.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM workouts WHERE id NOT LIKE ?', [`${demoWorkoutIdPrefix}%`])?.count) setSyncState('cloud_sync_needs_seed', '1');
    return;
  }
  if (activeUserId === userId) {
    sqlite.runSync("DELETE FROM sync_state WHERE key = 'active_clerk_user_id'");
    return;
  }
  sqlite.execSync(`DELETE FROM recommendation_feedback; DELETE FROM workout_muscle_ratings; DELETE FROM workout_sets; DELETE FROM workouts WHERE id NOT LIKE '${demoWorkoutIdPrefix}%'; DELETE FROM sync_tombstones; DELETE FROM sync_outbox; DELETE FROM sync_versions; DELETE FROM sync_state WHERE key LIKE 'cloud_sync_%';`);
  setSyncState('active_user_id', userId);
  sqlite.runSync("DELETE FROM sync_state WHERE key = 'active_clerk_user_id'");
}

/** Remove account-owned rows and sync metadata without touching the exercise catalog. */
export function clearLocalAccountData() {
  sqlite.execSync(`DELETE FROM recommendation_feedback; DELETE FROM workout_muscle_ratings; DELETE FROM workout_sets; DELETE FROM workouts; DELETE FROM sync_tombstones; DELETE FROM sync_outbox; DELETE FROM sync_versions; DELETE FROM sync_state;`);
  syncDemoWorkoutData();
}

/** Applies one cursor page. Pending local edits stay visible until the server
 * accepts or rejects their own batch. */
export function mergeCloudSyncChanges(changes: CloudSyncRemoteChange[], cursor: number) {
  sqlite.execSync('BEGIN IMMEDIATE');
  try {
    for (const change of changes) {
      const pending = sqlite.getFirstSync('SELECT 1 FROM sync_outbox WHERE entity = ? AND entity_key = ?', [change.entity, change.key]);
      if (!pending) {
        if (change.operation === 'delete') {
          const pieces = change.key.split(cloudKeySeparator);
          if (change.entity === 'workout') sqlite.runSync('DELETE FROM workouts WHERE id = ?', [change.key]);
          if (change.entity === 'set') sqlite.runSync('DELETE FROM workout_sets WHERE workout_id = ? AND exercise_id = ? AND set_number = ?', [pieces[0], pieces[1], Number(pieces[2])]);
          if (change.entity === 'rating') sqlite.runSync('DELETE FROM workout_muscle_ratings WHERE workout_id = ? AND muscle = ?', [pieces[0], pieces[1]]);
        } else if (change.record) {
          const record = change.record;
          if (change.entity === 'workout') sqlite.runSync(`INSERT INTO workouts (id, split, created_at, ended_at, updated_at) VALUES (?, ?, ?, ?, 0)
            ON CONFLICT(id) DO UPDATE SET split = excluded.split, created_at = excluded.created_at, ended_at = excluded.ended_at`, [String(record.id), String(record.split), Number(record.createdAt), record.endedAt == null ? null : Number(record.endedAt)]);
          if (change.entity === 'set' && sqlite.getFirstSync('SELECT 1 FROM workouts WHERE id = ?', [String(record.workoutId)])) sqlite.runSync(`INSERT INTO workout_sets (exercise_id, workout_id, set_number, weight, reps, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0)
            ON CONFLICT(workout_id, exercise_id, set_number) DO UPDATE SET weight = excluded.weight, reps = excluded.reps, completed_at = excluded.completed_at`, [String(record.exerciseId), String(record.workoutId), Number(record.setNumber), Number(record.weight), Number(record.reps), Number(record.completedAt)]);
          if (change.entity === 'rating' && sqlite.getFirstSync('SELECT 1 FROM workouts WHERE id = ?', [String(record.workoutId)])) sqlite.runSync(`INSERT INTO workout_muscle_ratings (workout_id, muscle, exhaustion, created_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(workout_id, muscle) DO UPDATE SET exhaustion = excluded.exhaustion, created_at = excluded.created_at`, [String(record.workoutId), String(record.muscle), Number(record.exhaustion), Number(record.createdAt)]);
          if (change.entity === 'feedback') sqlite.runSync(`INSERT INTO recommendation_feedback (workout_id, exercise_id, action, rank, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0)
            ON CONFLICT(workout_id, exercise_id, action) DO UPDATE SET rank = excluded.rank, created_at = excluded.created_at`, [String(record.workoutId), String(record.exerciseId), String(record.action), record.rank == null ? null : Number(record.rank), Number(record.createdAt)]);
        }
      }
      sqlite.runSync(`INSERT INTO sync_versions (entity, entity_key, revision) VALUES (?, ?, ?)
        ON CONFLICT(entity, entity_key) DO UPDATE SET revision = MAX(revision, excluded.revision)`, [change.entity, change.key, change.revision]);
    }
    setSyncState('cloud_sync_cursor', String(cursor));
    sqlite.execSync('COMMIT');
  } catch (error) {
    sqlite.execSync('ROLLBACK');
    throw error;
  }
}
