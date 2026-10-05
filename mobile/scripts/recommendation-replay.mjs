import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as defaultEngine from '../src/lib/exercise-recommendations.ts';
import { exerciseCatalog } from '../src/db/exercise-catalog.ts';
import { buildReplayFixture } from '../test/fixtures/recommendation-history.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const date = (value, label) => {
  assert.equal(typeof value, 'string', `${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  assert(Number.isFinite(parsed.getTime()), `${label} is invalid`);
  return parsed;
};
const unique = (items, label) => assert.equal(new Set(items).size, items.length, `${label} must be unique`);
const id = (value, label) => { assert(typeof value === 'string' && value.length > 0, `${label} is required`); return value; };

/** Accept the app's account export without using its current profile as historical context. */
export function historyFromAccountExport(data) {
  assert(Array.isArray(data.workouts) && Array.isArray(data.sets), 'Account export needs workouts and sets');
  const timestamp = (seconds) => {
    assert(Number.isFinite(seconds), 'Export timestamps must be Unix seconds');
    return new Date(seconds * 1000).toISOString();
  };
  const sessions = data.workouts.map((workout) => {
    const definition = (data.splits ?? []).find((split) => split.id === workout.split && split.updatedAt <= workout.createdAt);
    return {
      id: workout.id, split: workout.split, startedAt: timestamp(workout.createdAt), endedAt: workout.endedAt === null ? null : timestamp(workout.endedAt),
      context: {}, ...(definition && { definition: { id: definition.id, name: definition.name, muscles: definition.muscles } }),
      sets: data.sets.filter((set) => set.workoutId === workout.id).map((set) => ({ ...set, completedAt: timestamp(set.completedAt) })),
      ratingEvents: (data.muscleRatings ?? []).filter((rating) => rating.workoutId === workout.id).map((rating) => ({
        muscle: rating.muscle, exhaustion: rating.exhaustion, createdAt: timestamp(rating.createdAt),
      })),
      feedback: (data.recommendationFeedback ?? []).filter((event) => event.workoutId === workout.id).map((event) => ({
        exerciseId: event.exerciseId, action: event.action, ...(event.rank !== null && event.rank !== undefined && { rank: event.rank }), createdAt: timestamp(event.createdAt),
      })),
    };
  });
  const workoutIds = new Set(data.workouts.map((workout) => workout.id));
  assert(data.sets.every((set) => workoutIds.has(set.workoutId)), 'Export contains orphan sets');
  return { version: 1, people: [{ id: 'exported-history', sessions }] };
}

/** Replay input deliberately stores preferences at each session, not today's profile. */
export function parseHistory(input) {
  assert.equal(input.version, 1, 'Unsupported replay input version');
  assert(Array.isArray(input.people) && input.people.length > 0, 'people must be a nonempty array');
  const catalog = input.catalog ?? exerciseCatalog;
  assert(Array.isArray(catalog) && catalog.length > 0, 'catalog must be a nonempty array');
  unique(catalog.map((exercise) => id(exercise.id, 'exercise id')), 'exercise ids');
  const exerciseIds = new Set(catalog.map((exercise) => exercise.id));
  const people = input.people.map((person) => {
    id(person.id, 'person id');
    assert(Array.isArray(person.sessions), 'sessions must be an array');
    unique(person.sessions.map((session) => id(session.id, 'session id')), 'session ids');
    const sessions = person.sessions.map((session) => {
      const startedAt = date(session.startedAt, 'startedAt');
      const endedAt = session.endedAt === null ? null : date(session.endedAt, 'endedAt');
      assert(!endedAt || endedAt >= startedAt, 'session ends before it starts');
      id(session.split, 'split');
      const context = session.context ?? {};
      for (const key of ['trainingDays', 'sessionMinutes', 'weightLb']) {
        assert(context[key] === undefined || (Number.isFinite(context[key]) && context[key] > 0), `Invalid context.${key}`);
      }
      assert(Array.isArray(session.sets), 'sets must be an array');
      const sets = session.sets.map((set) => {
        assert(exerciseIds.has(set.exerciseId), `Unknown exercise: ${set.exerciseId}`);
        assert(Number.isInteger(set.setNumber) && set.setNumber > 0, 'Invalid setNumber');
        assert(Number.isFinite(set.weight) && set.weight >= 0, 'Invalid weight');
        assert(Number.isInteger(set.reps) && set.reps > 0, 'Invalid reps');
        const completedAt = date(set.completedAt, 'set completedAt');
        assert(completedAt >= startedAt && (!endedAt || completedAt <= endedAt), 'Set timestamp outside session');
        return { ...set, workoutId: session.id, completedAt };
      }).sort((a, b) => a.completedAt - b.completedAt); // Stable ties retain recorded input order.
      unique(sets.map((set) => JSON.stringify([set.exerciseId, set.setNumber])), 'exercise/set identities');
      const ratings = Object.entries(session.ratings ?? {}).map(([muscle, exhaustion]) => {
        assert(Number.isInteger(exhaustion) && exhaustion >= 0 && exhaustion <= 10, 'Invalid exhaustion');
        return { workoutId: session.id, split: session.split, muscle, exhaustion, completedAt: endedAt, availableAt: endedAt };
      });
      for (const event of session.ratingEvents ?? []) {
        assert(Number.isInteger(event.exhaustion) && event.exhaustion >= 0 && event.exhaustion <= 10, 'Invalid exhaustion');
        const availableAt = date(event.createdAt, 'rating createdAt');
        assert(availableAt >= startedAt, 'Rating predates its session');
        ratings.push({ workoutId: session.id, split: session.split, muscle: id(event.muscle, 'rating muscle'), exhaustion: event.exhaustion,
          completedAt: endedAt, availableAt: endedAt && endedAt > availableAt ? endedAt : availableAt });
      }
      const feedback = (session.feedback ?? []).map((event) => {
        assert(exerciseIds.has(event.exerciseId), 'Unknown feedback exercise');
        assert(['accepted', 'completed', 'impression', 'replaced', 'removed', 'skipped', 'manual'].includes(event.action), 'Invalid feedback action');
        assert(event.rank === undefined || (Number.isInteger(event.rank) && event.rank > 0), 'Invalid feedback rank');
        const createdAt = date(event.createdAt, 'feedback createdAt');
        assert(createdAt >= startedAt, 'Feedback predates its session');
        return { ...event, workoutId: session.id, createdAt };
      });
      return { ...session, context, startedAt, endedAt, sets, ratings, feedback };
    }).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
    return { id: person.id, sessions };
  });
  unique(people.map((person) => person.id), 'person ids');
  return { catalog, people };
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
function summarize(decisions) {
  const exercise = decisions.filter((decision) => decision.kind === 'exercise');
  const eligible = exercise.filter((decision) => decision.rank !== null);
  const loads = decisions.filter((decision) => decision.kind === 'load');
  const weighted = loads.filter((decision) => decision.actual.weight > 0 && decision.predicted.weight !== undefined);
  const firstSets = loads.filter((decision) => decision.firstSet);
  const weightedFirstSets = weighted.filter((decision) => decision.firstSet);
  return {
    exerciseDecisions: exercise.length,
    eligibleExerciseDecisions: eligible.length,
    rankingHitAt3: mean(eligible.map((decision) => Number(decision.rank <= 3))),
    meanReciprocalRank: mean(eligible.map((decision) => 1 / decision.rank)),
    planHitAt3: mean(exercise.map((decision) => Number(decision.plan.some((item) => item.exerciseId === decision.actual)))),
    loadDecisions: loads.length,
    weightedPredictions: weighted.length,
    weightedLoadMaeLb: mean(weighted.map((decision) => Math.abs(decision.predicted.weight - decision.actual.weight))),
    repMae: mean(loads.map((decision) => Math.abs(decision.predicted.reps - decision.actual.reps))),
    firstSetWeightedPredictions: weightedFirstSets.length,
    firstSetWeightedLoadMaeLb: mean(weightedFirstSets.map((decision) => Math.abs(decision.predicted.weight - decision.actual.weight))),
    firstSetRepMae: mean(firstSets.map((decision) => Math.abs(decision.predicted.reps - decision.actual.reps))),
    coldStarts: loads.filter((decision) => decision.predicted.weight === undefined).length,
    violations: decisions.reduce((total, decision) => total + decision.violations.length, 0),
    actions: Object.fromEntries(['start', 'increase', 'retain', 'reduce', 'deload'].map((action) => [action, loads.filter((decision) => decision.predicted.action === action).length])),
  };
}

/** Rolling, teacher-forced evaluation: predictions never become training data. */
export function replayHistory(input, engine = defaultEngine) {
  const { catalog, people } = parseHistory(input);
  const exercises = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const decisions = [];
  for (const person of people) {
    const events = person.sessions.flatMap((session) => session.feedback);
    for (const session of person.sessions) {
      // Active and empty sessions may supply feedback but are never evaluation labels.
      if (!session.endedAt || !session.sets.length) continue;
      const current = [];
      const seen = new Set();
      for (const actual of session.sets) {
        const now = actual.completedAt;
        // Use closure time, not individual set time, to admit historical sessions.
        const prior = person.sessions.filter((other) => other.id !== session.id && other.endedAt && other.endedAt <= now);
        const history = prior.flatMap((other) => other.sets);
        const ratings = prior.flatMap((other) => other.ratings).filter((rating) => rating.availableAt <= now);
        const feedback = events.filter((event) => event.createdAt < now);
        const exercise = exercises.get(actual.exerciseId);
        const key = JSON.stringify([person.id, session.id, actual.exerciseId, actual.setNumber]);
        if (!seen.has(actual.exerciseId)) {
          const ranking = engine.getRankedExercises(catalog, [...history, ...current], ratings, session.id, session.split, now, session.context, feedback, session.definition);
          const plan = engine.getExerciseRecommendations(catalog, [...history, ...current], ratings, session.id, session.split, 3, now, session.context, feedback, session.definition);
          const rank = ranking.findIndex((item) => item.exercise.id === actual.exerciseId);
          const violations = [];
          const loggedCounts = new Map();
          for (const set of current) loggedCounts.set(set.exerciseId, (loggedCounts.get(set.exerciseId) ?? 0) + 1);
          const loggedMinutes = [...loggedCounts].reduce((total, [exerciseId, count]) => {
            const rest = engine.resolveExercisePrescription(exercises.get(exerciseId), session.context).restSeconds;
            return total + Math.ceil(1.5 + count * (rest + 45) / 60);
          }, 0);
          const budget = Math.max(15, Math.min(session.context.sessionMinutes ?? 45, 120));
          if (plan.reduce((total, item) => total + item.estimatedMinutes, 0) > Math.max(0, budget - loggedMinutes)) violations.push('time-budget');
          // Audit actual per-muscle dose independently of candidate scoring.
          const targets = session.definition?.muscles ?? defaultEngine.defaultWorkoutSplits.find((split) => split.id === session.split)?.muscles ?? [];
          const muscles = new Set(session.split.startsWith('custom:') ? targets : [...targets, 'abdominals']);
          const baseDose = budget <= 30 ? 3 : budget < 60 ? 5 : budget < 90 ? 6 : 8;
          const sessionTarget = Math.max(2, baseDose + 3 - Math.max(1, Math.min(session.context.trainingDays ?? 3, 5)));
          const dose = new Map();
          const muscleDose = (movement) => {
            let details = {};
            try { details = JSON.parse(movement.detailsJson ?? '{}') ?? {}; } catch { /* An empty dose is evaluated by prescription validity. */ }
            const amounts = new Map();
            for (const muscle of details.primaryMuscles ?? []) if (muscles.has(muscle)) amounts.set(muscle, 1);
            for (const muscle of details.secondaryMuscles ?? []) if (muscles.has(muscle)) amounts.set(muscle, Math.max(amounts.get(muscle) ?? 0, .15));
            return amounts;
          };
          for (const set of current) for (const [muscle, amount] of muscleDose(exercises.get(set.exerciseId))) dose.set(muscle, (dose.get(muscle) ?? 0) + amount);
          if (new Set(plan.map((item) => item.exercise.id)).size !== plan.length) violations.push('duplicate-exercise');
          for (const item of plan) {
            if (seen.has(item.exercise.id)) violations.push('already-logged-exercise');
            const exhaustion = engine.getExerciseRecoveryExhaustion(item.exercise, ratings, now, session.id);
            if (exhaustion >= 3.5) violations.push('severe-fatigue-exercise');
            if (!(item.sets >= 1 && Number.isInteger(item.sets) && Number.isFinite(item.score)
              && Number.isInteger(item.reps.min) && item.reps.min > 0 && Number.isInteger(item.reps.max) && item.reps.max >= item.reps.min
              && Number.isFinite(item.restSeconds) && item.restSeconds > 0 && Number.isFinite(item.estimatedMinutes) && item.estimatedMinutes > 0)) violations.push('invalid-prescription');
            for (const [muscle, amount] of muscleDose(item.exercise)) {
              const before = dose.get(muscle) ?? 0;
              const limit = muscle === 'abdominals' ? 1 : sessionTarget;
              if (before + amount * item.sets > Math.max(before, limit) + 1e-8) violations.push(`session-dose:${muscle}`);
              dose.set(muscle, before + amount * item.sets);
            }
          }
          decisions.push({ key: `${key}:exercise`, personId: person.id, sessionId: session.id, at: now.toISOString(), kind: 'exercise', actual: actual.exerciseId,
            rank: rank < 0 ? null : rank + 1, top3: ranking.slice(0, 3).map((item) => item.exercise.id),
            plan: plan.map((item) => ({ exerciseId: item.exercise.id, sets: item.sets, estimatedMinutes: item.estimatedMinutes })), violations });
        }
        const exhaustion = engine.getExerciseRecoveryExhaustion(exercise, ratings, now, session.id);
        // The first exercise decision contains the displayed plan volume cap.
        const exerciseDecision = decisions.findLast((decision) => decision.personId === person.id && decision.sessionId === session.id && decision.kind === 'exercise' && decision.actual === actual.exerciseId);
        const maximumSets = exerciseDecision?.plan.find((item) => item.exerciseId === actual.exerciseId)?.sets;
        const prescription = engine.resolveExercisePrescription(exercise, session.context, exhaustion, maximumSets);
        const predicted = engine.getProgressiveOverloadRecommendation([...history, ...current].filter((set) => set.exerciseId === actual.exerciseId), prescription, {
          ...engine.getProgressiveOverloadLoadOptions(exercise), now, exhaustion, currentWorkoutId: session.id, setNumber: actual.setNumber,
        });
        const violations = [];
        if (exhaustion >= 3.5 && predicted.sets > 2) violations.push('severe-fatigue-volume');
        if (predicted.weight !== undefined && (!Number.isFinite(predicted.weight) || predicted.weight < 0)) violations.push('invalid-weight');
        if (!(Number.isInteger(predicted.reps) && predicted.reps > 0 && Number.isInteger(predicted.sets) && predicted.sets > 0)) violations.push('invalid-prescription');
        if (maximumSets !== undefined && predicted.sets > maximumSets) violations.push('plan-volume-cap');
        decisions.push({ key: `${key}:load`, personId: person.id, sessionId: session.id, at: now.toISOString(), kind: 'load', firstSet: !seen.has(actual.exerciseId), actual: { weight: actual.weight, reps: actual.reps }, predicted, violations });
        seen.add(actual.exerciseId);
        current.push(actual); // Only observed data, after making the prediction.
      }
    }
  }
  return { version: 1, datasetFingerprint: hash(JSON.stringify({ ...input, catalog })), metrics: summarize(decisions),
    people: people.map((person) => ({ id: person.id, metrics: summarize(decisions.filter((decision) => decision.personId === person.id)) })), decisions };
}

export function compareReports(baseline, candidate) {
  assert.equal(baseline.version, candidate.version, 'Replay report versions differ');
  assert.equal(baseline.datasetFingerprint, candidate.datasetFingerprint, 'Baseline uses a different dataset');
  const previous = new Map(baseline.decisions.map((decision) => [decision.key, decision]));
  assert.equal(previous.size, candidate.decisions.length, 'Decision populations differ');
  const changes = candidate.decisions.flatMap((decision) => {
    const before = previous.get(decision.key);
    assert(before, `Missing baseline decision ${decision.key}`);
    const projection = (item) => item.kind === 'exercise' ? { rank: item.rank, top3: item.top3, plan: item.plan, violations: item.violations }
      : { weight: item.predicted.weight, reps: item.predicted.reps, sets: item.predicted.sets, action: item.predicted.action, violations: item.violations };
    return JSON.stringify(projection(before)) === JSON.stringify(projection(decision)) ? [] : [{ key: decision.key, before: projection(before), after: projection(decision) }];
  });
  const deltas = Object.fromEntries(Object.entries(candidate.metrics).filter(([, value]) => typeof value === 'number' || value === null).map(([key, value]) =>
    [key, typeof value === 'number' && typeof baseline.metrics[key] === 'number' ? value - baseline.metrics[key] : null]));
  return { deltas, changedDecisions: changes.length, changes };
}

if (import.meta.main) {
  const options = {};
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('bun run replay:recommendations [--input history.json] [--engine module.ts] [--out report.json] [--baseline report.json]');
    process.exit(0);
  }
  for (let index = 0; index < args.length; index += 2) {
    assert(['--input', '--engine', '--out', '--baseline'].includes(args[index]) && args[index + 1] && !args[index + 1].startsWith('--'), `Invalid option ${args[index]}`);
    assert(!options[args[index]], `Repeated option ${args[index]}`);
    options[args[index]] = args[index + 1];
  }
  const raw = options['--input'] ? JSON.parse(await readFile(resolve(options['--input']), 'utf8')) : buildReplayFixture();
  const input = raw.version === undefined && raw.workouts ? historyFromAccountExport(raw) : raw;
  const enginePath = options['--engine'] ? resolve(options['--engine']) : new URL('../src/lib/exercise-recommendations.ts', import.meta.url);
  const engine = options['--engine'] ? await import(pathToFileURL(enginePath).href) : defaultEngine;
  const report = replayHistory(input, engine);
  report.engineFingerprint = hash(await readFile(enginePath));
  if (options['--baseline']) report.comparison = compareReports(JSON.parse(await readFile(resolve(options['--baseline']), 'utf8')), report);
  console.log(JSON.stringify({ metrics: report.metrics, people: report.people, ...(report.comparison && { comparison: { deltas: report.comparison.deltas, changedDecisions: report.comparison.changedDecisions } }) }, null, 2));
  if (options['--out']) await writeFile(resolve(options['--out']), `${JSON.stringify(report, null, 2)}\n`);
  if (report.metrics.violations) process.exitCode = 1;
}
