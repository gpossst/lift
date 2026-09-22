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

- Logged sets and completed visits build exercise continuity.
- Accepting a recommendation or choosing an exercise manually adds a smaller
  preference signal.
- Replacing, removing, or skipping a recommendation lowers its future rank.
- Exercises that repeatedly appear in the same completed workout receive a
  co-training bonus when one of their usual partners is already in the session.

Explicit feedback events are stored locally in SQLite on native platforms and
local storage on the web, then travel with the authenticated workout snapshot.
Completed workouts and co-training are derived from the existing synced set
history. Feedback from one signed-in account is cleared from the device cache
on account switch.

## Progressive overload

The active exercise screen can apply a load-and-rep recommendation built from
the goal-derived prescription and completed sessions for that exercise. It
adds 5 lb after every prescribed set reaches the top of the range, reduces the
load after two sessions below the bottom, otherwise retains the latest working
load, and suggests a lighter, one-set-shorter session when three-session decline
coincides with high recent muscle exhaustion. With no exercise history it fills
only the conservative bottom of the rep range and asks the lifter to choose a
comfortable weight.

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
    "availableEquipment": ["barbell", "dumbbell"],
    "gymId": "a-stable-gym-identifier",
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
| `availableEquipment` | Reserved for future location-derived availability; currently ignored |
| `trainingLocation` | gym, home, both; a setting, not GPS coordinates |
| `gymId` | An explicitly selected gym; no location permission or automatic tracking |
| `weightLb`, `heightInches` | Optional body measurements for cohort matching |
| `optInSimilarUsers` | Defaults to false; controls participation in peer comparisons |

Omitted properties preserve saved values. `null` clears nullable preferences.
Set `optInSimilarUsers` to `false` to turn comparisons off. The new API does not
require completing onboarding or supplying body measurements.

## Personalization wiring

The workout recommendation screen fetches saved goals, experience, schedule,
equipment, and gym preferences when cloud access is available, translating
nullable values to omitted local context and preserving the local fallback.
Peer hints are not yet wired into the screen; pass them only with the user's
opt-in, and do not translate peer set counts directly into individual targets.

Peer aggregates require consent from the requester and every included peer.
They remain unavailable until at least five people match every supplied cohort
field; the service does not broaden a sparse cohort by silently dropping gym,
goal, experience, schedule, height, or weight criteria.

The exercise browser already limits ranking to its visible candidates, so hidden
equipment or search results cannot consume the diversity bonuses. Unranked
exercises remain available in the library.

Before releasing the updated Worker, apply all pending migrations through
`worker/migrations/0007_recommendation_feedback.sql` using the normal migration
process. This change does not apply remote migrations or publish the Worker.
