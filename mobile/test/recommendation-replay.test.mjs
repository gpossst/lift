import assert from 'node:assert/strict';
import * as engine from '../src/lib/exercise-recommendations.ts';
import { replayHistory, compareReports, parseHistory, historyFromAccountExport } from '../scripts/recommendation-replay.mjs';
import { buildReplayFixture } from './fixtures/recommendation-history.mjs';

const input = buildReplayFixture();
const parsed = parseHistory(input);
const report = replayHistory(input);
assert.equal(report.metrics.violations, 0, 'fixture must obey recommendation constraints');
assert.equal(report.people.length, 6);
assert(report.metrics.exerciseDecisions > 60 && report.metrics.loadDecisions > 200);
assert(report.metrics.coldStarts > 0 && report.metrics.weightedPredictions > 0);
assert(report.metrics.actions.increase > 0 && report.metrics.actions.deload > 0 && report.metrics.actions.reduce > 0);
assert(report.people.every((person) => person.metrics.exerciseDecisions > 0));
assert.deepEqual(replayHistory(input), report, 'replay must be deterministic');
assert.equal(compareReports(report, report).changedDecisions, 0);
assert(Object.values(compareReports(report, report).deltas).every((delta) => delta === null || delta === 0));

// Assert the clock and evidence boundary at every production call, not just aggregate metrics.
let checked = 0;
const observedEngine = { ...engine,
  getProgressiveOverloadRecommendation(history, prescription, options) {
    for (const set of history) {
      assert(set.completedAt <= options.now);
      const person = parsed.people.find((person) => person.sessions.some((session) => session.id === options.currentWorkoutId));
      const source = person.sessions.find((session) => session.id === set.workoutId);
      assert(source);
      if (set.workoutId === options.currentWorkoutId) assert(set.setNumber < options.setNumber, 'target/later sets cannot leak into prediction');
      else assert(source.endedAt && source.endedAt <= options.now, 'unfinished sessions cannot become evidence');
    }
    checked++;
    return engine.getProgressiveOverloadRecommendation(history, prescription, options);
  },
};
assert.deepEqual(replayHistory(input, observedEngine), report);
assert.equal(checked, report.metrics.loadDecisions);

// Mutating future observations, future feedback, or another person leaves earlier decisions untouched.
const mutated = structuredClone(input);
const boundary = Date.parse('2026-06-20T00:00:00Z');
for (const person of mutated.people) for (const session of person.sessions) {
  if (Date.parse(session.startedAt) >= boundary) {
    for (const set of session.sets) { set.weight += 500; set.reps = 1; }
    session.ratings = { chest: 5, triceps: 5 };
    session.feedback.push({ exerciseId: session.sets[0].exerciseId, action: 'removed', createdAt: session.startedAt });
  }
}
const earlier = (result) => result.decisions.filter((decision) => Date.parse(decision.at) < boundary);
assert.deepEqual(earlier(replayHistory(mutated)), earlier(report));
const otherPerson = structuredClone(input);
otherPerson.people[1].sessions.forEach((session) => session.sets.forEach((set) => { set.weight = 999; }));
assert.deepEqual(replayHistory(otherPerson).decisions.filter((decision) => decision.personId === 'ppl'), report.decisions.filter((decision) => decision.personId === 'ppl'));
const unfinished = structuredClone(input);
unfinished.people.find((person) => person.id === 'return').sessions.find((session) => session.endedAt === null).sets.forEach((set) => { set.weight = 999; });
assert.deepEqual(replayHistory(unfinished).decisions, report.decisions);

// Candidate comparison must detect tuning changes and refuse mismatched populations.
const reversed = { ...engine, getRankedExercises: (...args) => engine.getRankedExercises(...args).reverse() };
const candidate = replayHistory(input, reversed);
const comparison = compareReports(report, candidate);
assert(comparison.changedDecisions > 0);
assert(comparison.deltas.meanReciprocalRank < 0);
assert.throws(() => compareReports(report, replayHistory(mutated)), /different dataset/);
const broken = { ...engine, getProgressiveOverloadRecommendation: (...args) => ({ ...engine.getProgressiveOverloadRecommendation(...args), weight: -1 }) };
assert(replayHistory(input, broken).metrics.violations > 0, 'invalid candidates must be reported');
const brokenPlan = { ...engine, getExerciseRecommendations: (...args) => engine.getExerciseRecommendations(...args).map((item) => ({ ...item, reps: { min: 10, max: 1 } })) };
assert(replayHistory(input, brokenPlan).metrics.violations > 0, 'invalid exercise prescriptions must be reported');

// Exercise the real export shape: Unix seconds, nullable ranks, and delayed check-ins.
const source = input.people.find((person) => person.id === 'fatigue');
const seconds = (timestamp) => Date.parse(timestamp) / 1000;
const exported = {
  profile: { goals: '["Get stronger"]', trainingDays: 5 }, // Current preferences are deliberately ignored.
  workouts: source.sessions.map((session) => ({ id: session.id, split: session.split, createdAt: seconds(session.startedAt), endedAt: seconds(session.endedAt) })),
  sets: source.sessions.flatMap((session) => session.sets.map((set) => ({ ...set, workoutId: session.id, completedAt: seconds(set.completedAt) }))),
  muscleRatings: [{ workoutId: source.sessions[0].id, muscle: 'triceps', exhaustion: 10, createdAt: seconds(source.sessions[3].endedAt) }],
  recommendationFeedback: [{ workoutId: source.sessions[0].id, exerciseId: source.sessions[0].sets[0].exerciseId, action: 'manual', rank: null, createdAt: seconds(source.sessions[0].startedAt) }],
};
const imported = historyFromAccountExport(exported);
assert.deepEqual(imported.people[0].sessions[0].context, {});
const noRatings = structuredClone(imported);
noRatings.people[0].sessions[0].ratingEvents = [];
const beforeCheckIn = (result) => result.decisions.filter((decision) => Date.parse(decision.at) < Date.parse(source.sessions[3].endedAt));
assert.deepEqual(beforeCheckIn(replayHistory(imported)), beforeCheckIn(replayHistory(noRatings)), 'late ratings cannot change earlier decisions');
const importWithoutCurrentProfile = historyFromAccountExport({ ...exported, profile: null });
assert.deepEqual(imported, importWithoutCurrentProfile);

for (const change of [
  (data) => { data.version = 99; },
  (data) => { data.people.push(data.people[0]); },
  (data) => { data.people[0].sessions[0].sets[0].exerciseId = 'missing'; },
  (data) => { data.people[0].sessions[0].sets[0].completedAt = '2020-01-01T00:00:00Z'; },
  (data) => { data.people[0].sessions[0].sets[0].weight = -1; },
]) {
  const invalid = structuredClone(input);
  change(invalid);
  assert.throws(() => parseHistory(invalid));
}
console.log(`Recommendation replay passed: ${report.metrics.exerciseDecisions} exercise decisions, ${report.metrics.loadDecisions} set decisions; leakage, determinism, isolation, comparison, and constraint detection checked.`);
