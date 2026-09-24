import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const quote = String.fromCharCode(39);
const sqlString = (value) => `${quote}${value}${quote}`;
const run = (db, sql) => execFileSync('sqlite3', [db, sql], { encoding: 'utf8' });
const rows = (db, sql) => JSON.parse(execFileSync('sqlite3', ['-json', db, sql], { encoding: 'utf8' }) || '[]');
const temp = mkdtempSync(join(tmpdir(), 'lift-worker-regression-'));
const db = join(temp, 'recommendations.sqlite');

for (const file of readdirSync('migrations').filter((file) => file.endsWith('.sql')).sort()) {
  execFileSync('sqlite3', [db], { input: readFileSync(join('migrations', file)) });
}

const timestamp = 10_000_000;
const since = timestamp - 28 * 86_400;
const goals = JSON.stringify(['Build muscle']);
let seed = `
  INSERT INTO users (id, created_at, clerk_user_id, display_name) VALUES ('own', 1, 'user_own', 'Own');
  INSERT INTO user_info (user_id, auth_user_id, display_name, created_at, updated_at, goals, weight_lb, height_inches, experience, training_location, training_days, similar_users_opt_in)
  VALUES ('own', 'user_own', 'Own', 1, 1, '${goals}', 180, 70, 'some', 'gym', 3, 1);
`;
for (let index = 1; index <= 5; index += 1) {
  const user = `peer${index}`;
  const workout = `w${index}`;
  seed += `
    INSERT INTO users (id, created_at, clerk_user_id, display_name) VALUES ('${user}', 1, 'user_${user}', '${user}');
    INSERT INTO user_info (user_id, auth_user_id, display_name, created_at, updated_at, goals, weight_lb, height_inches, experience, training_location, training_days, similar_users_opt_in)
    VALUES ('${user}', 'user_${user}', '${user}', 1, 1, '${goals}', 180, 70, 'some', 'gym', 3, 1);
    INSERT INTO workouts (user_id, local_id, split, created_at, ended_at, updated_at) VALUES ('${user}', '${workout}', 'push', ${timestamp - 1}, ${timestamp - 1}, ${timestamp - 1});
    INSERT INTO workout_sets (user_id, workout_local_id, exercise_id, set_number, weight, reps, completed_at, updated_at) VALUES ('${user}', '${workout}', 'e', 1, 10, 10, ${timestamp - 1}, ${timestamp - 1});
    INSERT INTO set_muscles VALUES ('${user}', '${workout}', 'e', 1, 'chest');
  `;
}
run(db, seed);

const source = readFileSync('src/index.ts', 'utf8');
const queryMatch = source.match(/const rows = await env\.DB\.prepare\(`([\s\S]*?)`\)\.bind\(since, timestamp, userId, userId, ownTotal, ownTotal, since, timestamp, userId, since, timestamp\)/);
if (!queryMatch) throw new Error('Recommendation query changed; update this regression.');
function recommendationRows() {
  const values = [since, timestamp, 'own', 'own', 0, 0, since, timestamp, 'own', since, timestamp];
  let index = 0;
  const query = queryMatch[1].replace(/\?/g, () => typeof values[index] === 'string' ? sqlString(values[index++]) : String(values[index++]));
  return rows(db, query);
}

let result = recommendationRows();
if (result.length !== 18 || result.find((row) => row.muscle === 'chest')?.peerSets !== 1 || result.find((row) => row.muscle === 'abdominals')?.mySets !== 0 || result.some((row) => row.peerCount !== 5)) throw new Error('Canonical muscle or zero-count denominator regression.');
run(db, "UPDATE user_info SET similar_users_opt_in = 0 WHERE user_id = 'own'");
if (recommendationRows().length) throw new Error('Requester opt-out leaked cohort data.');
run(db, "UPDATE user_info SET similar_users_opt_in = 1 WHERE user_id = 'own'; UPDATE user_info SET height_inches = 80 WHERE user_id = 'peer5'");
if (recommendationRows().length) throw new Error('Height mismatch was relaxed below five peers.');
run(db, "UPDATE user_info SET height_inches = 70, gym_id = 'other' WHERE user_id = 'peer5'; UPDATE user_info SET gym_id = 'home-gym' WHERE user_id != 'peer5'");
if (recommendationRows().length) throw new Error('Explicit gym mismatch was relaxed.');
run(db, "UPDATE user_info SET gym_id = NULL WHERE user_id != 'peer5'; UPDATE user_info SET goals = NULL WHERE user_id = 'own'");
if (recommendationRows().length !== 18) throw new Error('Clearing optional goals should remove the goal restriction.');

const { __testUpdateProfile, __testValidOnboarding, __testValidPayload } = await import('../src/index.ts');
const syncPayload = {
  workouts: [{ id: 'feedback-workout', split: 'push', createdAt: 10, endedAt: 20, updatedAt: 20 }],
  sets: [], muscleRatings: [], tombstones: [],
  recommendationFeedback: [{ workoutId: 'feedback-workout', exerciseId: 'bench', action: 'impression', rank: 1, createdAt: 11, updatedAt: 11 }],
};
if (!__testValidPayload(syncPayload)) throw new Error('Valid recommendation feedback was rejected.');
if (__testValidPayload({ ...syncPayload, recommendationFeedback: [{ ...syncPayload.recommendationFeedback[0], rank: undefined }] })) throw new Error('Rankless impression was accepted.');
if (__testValidPayload({ ...syncPayload, recommendationFeedback: [{ ...syncPayload.recommendationFeedback[0], action: 'clicked' }] })) throw new Error('Unknown recommendation feedback action was accepted.');
if (__testValidPayload({ ...syncPayload, recommendationFeedback: [...syncPayload.recommendationFeedback, syncPayload.recommendationFeedback[0]] })) throw new Error('Duplicate recommendation feedback was accepted.');
const onboarding = { goals: ['Build muscle'], weightLb: 180, heightInches: 70, experience: 'experienced', favoriteExerciseIds: ['bench'], trainingLocation: 'gym', trainingDays: 3 };
if (!__testValidOnboarding(onboarding) || !__testValidOnboarding({ goals: ['Build muscle'], experience: 'new', trainingDays: 3 }) || __testValidOnboarding({ ...onboarding, favoriteExerciseIds: Array(6).fill('bench') })) throw new Error('Onboarding validation regressed.');
const profileRow = { userId: 'own', displayName: 'Own', imageUrl: null, goals, weightLb: 180, heightInches: 70, experience: 'some', favoriteExerciseIds: null, trainingLocation: 'gym', trainingDays: 3, gymId: 'home-gym', availableEquipment: '["barbell"]', sessionMinutes: 45, optInSimilarUsers: 1 };
const database = {
  prepare(sql) {
    return { bind(...values) {
      if (sql.startsWith('SELECT auth_user_id')) return { first: async () => profileRow };
      if (sql.startsWith('UPDATE user_info')) return { run: async () => {
        const names = [...sql.matchAll(/([a-z_]+) = \?/g)].map((match) => match[1]);
        for (const [index, name] of names.entries()) {
          const key = { favorite_exercise_ids: 'favoriteExerciseIds', gym_id: 'gymId', similar_users_opt_in: 'optInSimilarUsers' }[name] ?? name;
          profileRow[key] = values[index];
        }
      } };
      throw new Error(`Unexpected SQL: ${sql}`);
    } };
  },
};
const patch = async (body) => __testUpdateProfile(new Request('https://lift.test/v1/profile', { method: 'PATCH', body: JSON.stringify(body) }), { DB: database }, 'own');
const updated = await patch({ recommendationPreferences: { gymId: null, optInSimilarUsers: false } });
if (updated.status !== 200 || profileRow.goals !== goals || profileRow.gymId !== null || profileRow.optInSimilarUsers !== 0) throw new Error('Partial preference update did not preserve fields, clear gym, or persist opt-out.');
if ((await patch({ recommendationPreferences: { gymId: '' } })).status !== 400) throw new Error('Invalid optional preference accepted.');
const favorites = await patch({ recommendationPreferences: { favoriteExerciseIds: ['bench', 'squat'] } });
if (favorites.status !== 200 || profileRow.favoriteExerciseIds !== '["bench","squat"]') throw new Error('Favorite exercises were not persisted.');
if ((await patch({ recommendationPreferences: { favoriteExerciseIds: Array(21).fill('bench') } })).status !== 400) throw new Error('Too many favorite exercises were accepted.');

console.log('Worker recommendation and profile preference regressions passed.');
