# Exercise recommendations

The local planner works without a profile or network connection. It uses logged
training to balance session and weekly muscle work, rewards progress, accounts
for recent fatigue, and returns a lightweight sets/reps/rest prescription that
fits the requested session length. These remain heuristics, not medical advice
or a claim that one number of sets is optimal for every user.

## Recommendation-first workout flow

The workout exercise screen leads with a short set of recommended movements.
The full searchable, filterable, sortable catalog remains available from the
exercise-library sheet, so choosing a suggestion is fast without hiding manual
selection.

## Implicit routine learning

The planner learns from workout history without requiring a routine builder:

- Completed sessions build recency-weighted exercise continuity; extra sets in
  the same session affect volume and muscle dose, not preference.
- Progression from sessions within 90 days and recent manual selections add
  recency-weighted preference evidence. Saved favorites are a prior that fades
  as recency-weighted session and manual-selection evidence accumulates.
- Recent replacements or removals are strong negative evidence. A skip
  only counts after the recommendation remains displayed for 10 seconds.
- Exercises that repeatedly appear in the same completed workout receive a
  recency-weighted co-training bonus when one of their usual partners is already
  in the session. Featured catalog bonuses recover as past use or rejection ages.

Explicit feedback events are stored locally in SQLite on native platforms and
local storage on the web, then travel with the authenticated workout snapshot.
Impressions include their rank and timestamp. Session and feedback evidence use
a 30-day half-life, and only recent sessions or feedback events affect a
movement's preference score.
Completed workouts and co-training are derived from the existing synced set
history. Feedback from one signed-in account is cleared from the device cache
on account switch.

## Progressive overload

The active exercise screen can apply a load-and-rep recommendation built from
the goal-derived prescription and completed sessions for that exercise. It
adds 5 lb to a load tier after every set at that load reaches the top of the range in a full session, reduces the
load after two sessions below the bottom, otherwise retains the corresponding previous set’s weight and reps, and suggests a lighter, one-set-shorter session when three-session decline
coincides with high recent muscle exhaustion. With no exercise history it fills
only the conservative bottom of the rep range and asks the lifter to choose a
comfortable weight.

The screen matches the current set number to the latest completed session, so
ramping weights and back-off sets keep their previous sequence instead of
starting every set at the heaviest or final load. Both initial input values and
the next set's input values use this recommendation. Sets beyond the previous
session repeat its final set. Manual weight adjustments carry forward through
the sequence; repeated loads preserve the exact entered weight, including
fractional loads and lighter bars. Historical weighted reps are clamped to the current goal's rep range when holding
the load. Reps above a new ceiling do not earn a load increase: weighted sets
must meet the current ceiling exactly before progressing. This conservative
transition policy keeps the previous load sequence, requires fresh evidence in
the new range, and still applies repeated-miss and fatigue reductions. Explicit
rep adjustments logged in the current workout continue to carry forward.
Bodyweight progression remains an exception that can exceed the ceiling. Each load tier progresses independently, using the latest session's number
of sets at that weight as its target. The session must contain at least the
prescribed total number of sets before any tier increases.

Recommended exercise entry preserves the planner's trimmed set count as a cap.
The logger still resolves goals, rep range, rest, and recovery through the same
prescription function as manual entry. The cap belongs to that exercise and
survives switching away and back within a superset.

At zero added weight, a full session reaching the rep ceiling progresses by
recommending one rep above the lowest completed rep count at that tier. This
continues beyond the original ceiling (for example, 3×10 → 3×11 → 3×12),
and the screen labels it “ADD REPS.” Added resistance uses the normal load
progression; fatigue limits still override either progression path.

Reps at other loads cannot satisfy a tier's rep target or determine whether it
missed the rep range. With no explicit warm-up roles, all logged load tiers are
evaluated this way. Session performance comparisons use the heaviest logged
load and its sets.

Weight recommendations explicitly read sets from completed workouts; active and
orphaned sessions cannot drive progression. Only valid sets from the last 90 days
are used, with future timestamps ignored. After 14 days without this exercise,
the return session targets roughly 90% of the previous load; after 28 days it
targets 85%. Both use the bottom of the rep range and at most two sets, respecting
available loads and minimum weights. Bodyweight movements keep zero added load
with the same reduced reps/volume. Older history supplies no suggested weight.
Misses and declines do not carry across a gap of 14 days between sessions.
These time windows and reductions are conservative planner heuristics.

## Shared exercise prescriptions

`resolveExercisePrescription` supplies the planner and workout logger with the
same goal, experience, training-frequency, and effective-recovery rules for
sets, reps, and rest. Both screens use `useRecommendationContext` to load saved
profile preferences with pending onboarding as the offline fallback. Recommended,
manual, reopened, directly linked, and superset exercises all resolve their own
prescription; navigation parameters no longer override it. Initial workout inputs
wait until context has loaded so generic defaults do not seed the recommendation.

## Optional personalization

`getExerciseRecommendations(workoutId, split, limit, context)` in the mobile DB
adapters accepts optional context. Existing three-argument calls remain valid.
The pure function in `src/lib/exercise-recommendations.ts` accepts context after
its existing `now` argument, which makes deterministic scenarios possible.

The profile API can save individual preferences with a partial update:

```json
{
  "recommendationPreferences": {
    "goals": ["Get stronger"],
    "favoriteExerciseIds": ["Barbell_Bench_Press_-_Medium_Grip"],
    "sessionMinutes": 45,
    "optInSimilarUsers": false
  }
}
```

Send this to `PATCH /v1/profile` using the existing authenticated mobile
`updateProfile` helper. The existing display-name string overload still works.
`GET /v1/profile` returns `recommendationPreferences` for the signed-in user.

| Preference | Meaning |
| --- | --- |
| `goals` | Existing onboarding vocabulary: Build muscle, Get stronger, Lose fat, Feel healthier |
| `experience` | new, some, experienced |
| `trainingDays`, `sessionMinutes` | Optional schedule context |
| `availableEquipment` | Reserved for a future equipment feature; currently ignored |
| `trainingLocation` | gym, home, both; a setting, not GPS coordinates |
| `gymId` | Optional cohort metadata; the local planner does not use it |
| `weightLb`, `heightInches` | Optional body measurements for cohort matching |
| `optInSimilarUsers` | Defaults to false; controls participation in peer comparisons |

Omitted properties preserve saved values. `null` clears nullable preferences.
Set `optInSimilarUsers` to `false` to turn comparisons off. The new API does not
require completing onboarding or supplying body measurements.

## Personalization wiring

The workout recommendation screen fetches saved goals, experience, favorites,
and schedule when cloud access is available, translating nullable values to
omitted local context and preserving the local fallback. Equipment familiarity
is inferred from equipment used in the user's own completed workouts during the
last 90 days. Familiar equipment receives a small bonus; unseen equipment stays
eligible. The local planner does not use location or gym data.
Peer hints are not yet wired into the screen; pass them only with the user's
opt-in, and do not translate peer set counts directly into individual targets.

Peer aggregates require consent from the requester and every included peer.
They remain unavailable until at least five people match every supplied cohort
field; the service does not broaden a sparse cohort by silently dropping gym,
goal, experience, schedule, height, or weight criteria.

`getRankedExercises(workoutId, split, context)` in the mobile DB adapters ranks
every eligible visible catalog movement against the logged session, including
movements already used. It does not reserve planned muscle work or stop at the
remaining session time. `getExerciseRecommendations` uses the same scoring
inputs to choose a small plan within the time budget, updating planned dose and
diversity after each suggestion. Scores credit only marginal coverage: for each
muscle, the smaller of its remaining session or weekly deficit and the planned
sets multiplied by that muscle's dose (1 for primary, 0.15 for secondary).
The summed contribution is divided by total muscle dose, so extra catalog tags
do not inflate coverage scores. Actual logged and planned dose remains per muscle.
Session coverage carries weight 18 and weekly coverage weight 2. The score,
including preference, diversity, and recovery adjustments, is divided by the
prescription's estimated minutes so shorter useful work can outrank longer work.
Coverage is recalculated after every selected prescription; surplus sets earn no
coverage credit. Hidden equipment or search results do not
affect the visible catalog ranking. Ineligible movements remain available for
manual selection in the library.

Peer comparisons are fetched separately when needed; workout synchronization
does not request them or depend on their availability.

Before releasing the updated Worker, apply all pending migrations in
`worker/migrations/` using the normal migration process. This includes
`0008_favorite_exercises.sql`, which adds the saved exercise preferences used by
the exercise browser. This change does not apply remote migrations or publish
the Worker.

## Routine baseline prompt

Home asks “What’s your normal push day look like?” for splits without a baseline.
Users can switch between splits and search/select up to 20 exercises, then save
that split's routine. Enabled custom splits are supported. Closing or saving the
prompt snoozes further prompts on that device for seven days. Users with exercise
ranking disabled are not prompted. A completed, non-demo workout with logged
sets also establishes a baseline; an empty or active workout does not.

`recommendationPreferences.routineExerciseIdsBySplit` stores a map of split IDs to
exercise IDs in the profile. It is separate from legacy favorites and needs
migration `0019_split_routines.sql`. Only the current split's routine contributes
to ranking, using the same 20-point fading prior as favorites (without double-counting an
exercise). Logged behavior and recovery constraints continue to guide the plan.

## Scenario validation and historical replay

Run from `mobile/`:

```bash
bun run test:recommendations
bun run replay:recommendations --out /tmp/lift-baseline.json
# After changing tuning, compare against the saved decisions on the same dataset:
bun run replay:recommendations --baseline /tmp/lift-baseline.json --out /tmp/lift-candidate.json
# Or load another implementation exporting the same recommendation functions:
bun run replay:recommendations --engine /absolute/path/to/exercise-recommendations.ts --baseline /tmp/lift-baseline.json
```

The 16 named scenarios cover the audited failures and combinations of fatigue,
misses, ramps, fractional/discrete loads, bodyweight progression, current-session
adjustments, goal changes, volume caps, muscle frequency, coverage, preferences,
movement patterns, evidence age, timing, and filtering a cached ranking. These
run in the normal test suite alongside the existing native/web adapter tests.

The default replay uses six fixed synthetic observed histories, spanning P/P/L,
full-body custom splits, short strength sessions and a goal transition, a return
after a break, cross-muscle fatigue, and bodyweight progression. They are not
generated by the recommender. At each recorded set timestamp, replay predicts
the set using only sessions already completed and earlier observed sets in the
current session. It ranks exercises and creates a plan before each exercise's
first observed set. Future feedback, late check-ins, other people's history,
and unfinished workouts cannot become historical evidence. Predictions never
replace the observed history. Equal set timestamps retain input order.

Reports contain all individual decisions, per-person metrics, a dataset/catalog
fingerprint, and the entry module's fingerprint. Comparisons reject different
datasets and list changed ranks, plans, loads, reps, actions, and constraints.
The module fingerprint is not a hash of its transitive dependencies; preserve
the source revision with reports when comparing changes outside that module.

| Metric | Interpretation |
| --- | --- |
| `rankingHitAt3`, `meanReciprocalRank` | Agreement with the next observed exercise, among exercises eligible for ranking; the eligible denominator is reported separately |
| `planHitAt3` | Fraction of observed exercise choices present in the up-to-three-item plan, including choices ineligible for ranking or made after the time budget |
| `weightedLoadMaeLb`, `repMae` | Absolute error against logged values across all predicted sets; unknown starting loads are excluded from weight error |
| `firstSetWeightedLoadMaeLb`, `firstSetRepMae` | Error before any set of that exercise is logged in the session; less influenced by carrying today's adjustments forward |
| `coldStarts`, `weightedPredictions`, `actions` | Prediction coverage and progression-action counts |
| `violations` | Time budget, muscle dose, duplicate/already-logged suggestions, severe fatigue, plan/logger cap mismatch, or invalid outputs; any violation makes the CLI exit nonzero |

Lower prediction error or higher exercise agreement measures fit to recorded
behavior, not whether a prescription improves future training outcomes. Review
per-person results and changed decisions, keep constraints as gates, and use
unseen histories to evaluate tuning rather than repeatedly optimizing the sample.
The replay tests verify determinism, absence of future-label leakage, person
isolation, delayed check-ins, unfinished-session exclusion, comparison behavior,
and detection of deliberately invalid candidate outputs.

An existing **Export my data** JSON can be evaluated locally:

```bash
bun run replay:recommendations --input /path/to/lift-export.json --out /tmp/lift-history-report.json
```

The importer reads Unix-second workout/set/feedback/check-in timestamps and
ignores today's profile, identity, and friend data. Preferences were not saved
historically, so exported sessions use default context. Custom split definitions
are used only if their saved update predates the session. Exports contain the
latest edited records, not an event log: replay cannot reconstruct original
set values, deleted records, or old custom-split definitions. Unknown exercise
IDs fail validation instead of silently disappearing from evaluation.

For timestamped preference history or a fixed evaluation catalog, pass a replay
JSON with `version: 1`, optional `catalog` (the `Exercise` objects), and `people`:

```json
{
  "version": 1,
  "people": [{
    "id": "anonymous-lifter",
    "sessions": [{
      "id": "session-1", "split": "push",
      "startedAt": "2026-06-01T12:00:00Z",
      "endedAt": "2026-06-01T12:30:00Z",
      "context": { "goals": ["Build muscle"], "trainingDays": 3, "sessionMinutes": 45 },
      "sets": [{
        "exerciseId": "free_exercise_db:Barbell_Bench_Press_-_Medium_Grip",
        "setNumber": 1, "weight": 100, "reps": 8,
        "completedAt": "2026-06-01T12:04:00Z"
      }],
      "ratingEvents": [{ "muscle": "chest", "exhaustion": 2, "createdAt": "2026-06-01T12:31:00Z" }],
      "feedback": []
    }]
  }]
}
```

`context` is the preference snapshot known at session start. `endedAt: null`
marks unfinished sessions. Optional `definition` supplies a custom split's
`id`, `name`, and `muscles` known at session start. Feedback events contain
`exerciseId`, `action`, `createdAt`, and optional positive `rank`. A shorthand
`ratings` muscle-to-exhaustion map is available at session end; use
`ratingEvents` with `createdAt` for delayed check-ins. Keep input catalogs and
contexts fixed across a tuning comparison.
