import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const exercises = sqliteTable('exercise_catalog', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  area: text('area').notNull(),
  mark: text('mark').notNull(),
  color: text('color').notNull(),
  equipment: text('equipment').notNull(),
  isFeatured: integer('is_featured').notNull().default(0),
  detailsJson: text('details_json'),
});

export const workouts = sqliteTable('workouts', {
  id: text('id').primaryKey(),
  split: text('split').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const workoutSets = sqliteTable('workout_sets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  exerciseId: text('exercise_id').notNull().references(() => exercises.id),
  workoutId: text('workout_id').notNull().references(() => workouts.id),
  setNumber: integer('set_number').notNull(),
  weight: integer('weight').notNull(),
  reps: integer('reps').notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const workoutMuscleRatings = sqliteTable('workout_muscle_ratings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workoutId: text('workout_id').notNull().references(() => workouts.id),
  muscle: text('muscle').notNull(),
  exhaustion: integer('exhaustion').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const recommendationFeedback = sqliteTable('recommendation_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workoutId: text('workout_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  action: text('action').notNull(),
  relatedExerciseId: text('related_exercise_id'),
  rank: integer('rank'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
