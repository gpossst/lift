const day = 86_400_000;
const epoch = Date.parse('2026-06-01T12:00:00Z');
const id = (source) => `free_exercise_db:${source}`;
const iso = (milliseconds) => new Date(milliseconds).toISOString();
const bench = 'Barbell_Bench_Press_-_Medium_Grip';
const press = 'Seated_Dumbbell_Press';
const triceps = 'Triceps_Pushdown';
const squat = 'Barbell_Squat';
const hinge = 'Romanian_Deadlift';
const chin = 'Chin-Up';
const row = 'Bent_Over_Barbell_Row';

function session(person, index, offset, split, movements, context, ratings = {}) {
  const startedAt = epoch + offset * day;
  let sequence = 0;
  const sets = movements.flatMap(([source, weight, reps, count = 3]) => Array.from({ length: count }, (_, set) => ({
    exerciseId: id(source), setNumber: set + 1, weight: Array.isArray(weight) ? weight[set] : weight,
    reps: Array.isArray(reps) ? reps[set] : reps, completedAt: iso(startedAt + ++sequence * 4 * 60_000),
  })));
  return { id: `${person}-${index}`, split, startedAt: iso(startedAt), endedAt: iso(startedAt + (sequence * 4 + 2) * 60_000), context, sets, ratings, feedback: [] };
}

/** Synthetic observed histories, independent of recommendation outputs and wall clock. */
export function buildReplayFixture() {
  const ppl = [];
  for (let week = 0; week < 4; week++) {
    const context = { goals: ['Build muscle'], experience: 'some', trainingDays: 3, sessionMinutes: 60,
      routineExerciseIdsBySplit: { push: [id(bench), id(press), id(triceps)], pull: [id(chin), id(row)], legs: [id(squat), id(hinge)] } };
    ppl.push(session('ppl', week * 3, week * 7, 'push', [[bench, 100 + week * 5, [12, 10, 8]], [press, 25, 10], [triceps, 30, 12]], context, { chest: 3, shoulders: 3, triceps: 3 }));
    ppl.push(session('ppl', week * 3 + 1, week * 7 + 2, 'pull', [[chin, 0, 8 + week], [row, 95, 10]], context, { lats: 3 }));
    ppl.push(session('ppl', week * 3 + 2, week * 7 + 4, 'legs', [[squat, 135 + week * 5, 10], [hinge, 95, 12]], context, { quadriceps: 3, hamstrings: 3 }));
  }
  const fullBody = Array.from({ length: 6 }, (_, index) => ({
    ...session('full-body', index, index * 3, 'custom:full', [[squat, 115, 8], [bench, 95, 10], [chin, 0, 10]],
      { goals: ['Feel healthier'], experience: 'some', trainingDays: 2, sessionMinutes: 60 }),
    definition: { id: 'custom:full', name: 'Full body', muscles: ['quadriceps', 'chest', 'lats'] },
  }));
  const shortStrength = Array.from({ length: 6 }, (_, index) => session('short-strength', index, index * 4, 'push',
    [[bench, [100 + index * 5, 95 + index * 5, 90 + index * 5], [6, 6, 6]], [triceps, 25, 12, 1]],
    { goals: [index < 3 ? 'Get stronger' : 'Build muscle'], experience: 'experienced', trainingDays: 3, sessionMinutes: 15 }));
  const returning = [0, 7, 14, 49, 56, 63].map((offset, index) => session('return', index, offset, 'push',
    [[bench, index < 3 ? 100 : 85, index === 1 || index === 2 ? 5 : 8], [press, 2.5, 10]],
    { goals: ['Get stronger'], experience: 'some', trainingDays: 3, sessionMinutes: 45 }));
  const fatigue = [0, .5, 1, 9, 16, 23].map((offset, index) => session('fatigue', index, offset, 'push',
    [[bench, 100, index < 2 ? 5 : 8], [press, 25, 8]], { experience: 'some', trainingDays: 3, sessionMinutes: 45 },
    index === 0 ? { triceps: 10 } : index === 1 ? { chest: 0 } : { chest: 3, triceps: 3 }));
  fatigue[3].feedback = [{ exerciseId: id(bench), action: 'impression', rank: 1, createdAt: fatigue[3].startedAt },
    { exerciseId: id(bench), action: 'removed', createdAt: fatigue[3].endedAt }];
  // An unfinished session with a large load must never become historical evidence.
  returning.push({ ...session('return', 6, 60, 'push', [[bench, 400, 10]], {}), endedAt: null });
  const bodyweight = Array.from({ length: 6 }, (_, index) => session('bodyweight', index, index * 4, 'pull',
    [[chin, 0, [10 + index, 10 + index, index === 2 ? 9 : 10 + index]]],
    { experience: 'experienced', trainingDays: 3, sessionMinutes: 30 }));
  return { version: 1, people: [
    { id: 'ppl', sessions: ppl }, { id: 'full-body', sessions: fullBody },
    { id: 'short-strength', sessions: shortStrength }, { id: 'return', sessions: returning },
    { id: 'fatigue', sessions: fatigue }, { id: 'bodyweight', sessions: bodyweight },
  ] };
}
