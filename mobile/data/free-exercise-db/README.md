# free-exercise-db source data

This directory vendors the upstream `dist/exercises.json` dataset from
[yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db), retrieved on 2026-08-24.
It contains 873 exercises and is dedicated to the public domain under the Unlicense;
the full upstream notice is retained in [LICENSE.md](./LICENSE.md).

The app assigns imported records stable IDs of the form `free_exercise_db:<upstream-id>`.
Keep those IDs stable when editing the catalog: `workout_sets.exercise_id` refers to them.
Imported exercises are intentionally not featured in the home grid yet. They are present in
the local catalog and ready for a searchable exercise picker; the hand-curated entries remain featured.
