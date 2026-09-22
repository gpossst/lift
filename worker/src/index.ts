export interface Env {
  DB: D1Database;
  /** Clerk Dashboard → API keys → JWT public key (PEM). Keep this a Worker secret. */
  CLERK_JWT_KEY: string;
  /** Optional exact Clerk issuer, e.g. https://example.clerk.accounts.dev */
  CLERK_ISSUER?: string;
  /** Optional comma-separated allowed `azp` origins. */
  CLERK_AUTHORIZED_PARTIES?: string;
  /** Address shown on the public support and privacy pages. */
  SUPPORT_EMAIL?: string;
}

type SyncSet = { exerciseId: string; workoutId: string; setNumber: number; weight: number; reps: number; completedAt: number; muscles: string[]; updatedAt?: number };
type SyncWorkout = { id: string; split: 'push' | 'pull' | 'legs'; createdAt: number; endedAt: number | null; updatedAt?: number };
type SyncRating = { workoutId: string; muscle: string; exhaustion: number; createdAt: number; updatedAt?: number };
type FeedbackAction = 'accepted' | 'completed' | 'replaced' | 'removed' | 'skipped' | 'manual';
type SyncFeedback = { workoutId: string; exerciseId: string; action: FeedbackAction; relatedExerciseId?: string | null; createdAt: number; updatedAt?: number };
type Tombstone = { entity: 'workout' | 'set' | 'rating'; key: string; deletedAt: number };
type SyncPayload = { workouts: SyncWorkout[]; sets: SyncSet[]; muscleRatings: SyncRating[]; recommendationFeedback?: SyncFeedback[]; tombstones?: Tombstone[] };
type SyncEntity = 'workout' | 'set' | 'rating' | 'feedback';
type SyncMutation = { entity: SyncEntity; key: string; operation: 'upsert' | 'delete'; baseRevision: number; record?: Record<string, unknown> };
type SyncChunk = { batchId: string; changes: SyncMutation[] };
type ClerkClaims = { sub: string; exp: number; nbf?: number; iss?: string; azp?: string; username?: string; first_name?: string; last_name?: string; image_url?: string };
type AuthenticatedUser = { id: string; displayName: string; imageUrl: string | null };
type PreferenceGoal = 'Build muscle' | 'Get stronger' | 'Lose fat' | 'Feel healthier';
type Experience = 'new' | 'some' | 'experienced';
type TrainingLocation = 'gym' | 'home' | 'both';
type RecommendationPreferences = { goals: PreferenceGoal[] | null; weightLb: number | null; heightInches: number | null; experience: Experience | null; favoriteExerciseIds: string[] | null; trainingLocation: TrainingLocation | null; trainingDays: number | null; gymId: string | null; availableEquipment: string[] | null; sessionMinutes: number | null; optInSimilarUsers: boolean };
type UserProfile = { clerkUserId: string; displayName: string; imageUrl: string | null; recommendationPreferences: RecommendationPreferences };
type ProfileRow = Omit<UserProfile, 'recommendationPreferences'> & { goals: string | null; weightLb: number | null; heightInches: number | null; experience: Experience | null; favoriteExerciseIds: string | null; trainingLocation: TrainingLocation | null; trainingDays: number | null; gymId: string | null; availableEquipment: string | null; sessionMinutes: number | null; optInSimilarUsers: number };
type Onboarding = { displayName?: string; goals: string[]; weightLb: number; heightInches: number; experience: 'new' | 'some' | 'experienced'; favoriteExerciseIds?: string[]; trainingLocation: 'gym' | 'home' | 'both'; trainingDays: number };

const encoder = new TextEncoder();
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } });
const now = () => Math.floor(Date.now() / 1000);
const maxTimestamp = 4_102_444_800; // 2100-01-01; protects D1 from nonsense clocks.
const splitKey = (key: string) => key.split('\u001f');
const setKey = (set: Pick<SyncSet, 'workoutId' | 'exerciseId' | 'setNumber'>) => `${set.workoutId}\u001f${set.exerciseId}\u001f${set.setNumber}`;
const ratingKey = (rating: Pick<SyncRating, 'workoutId' | 'muscle'>) => `${rating.workoutId}\u001f${rating.muscle}`;
const feedbackKey = (feedback: Pick<SyncFeedback, 'workoutId' | 'exerciseId' | 'action'>) => `${feedback.workoutId}\u001f${feedback.exerciseId}\u001f${feedback.action}`;
const maxSyncChunk = 3; // Three eight-muscle sets use 40 batch statements (42 for the request with user setup).
const supportEmail = (env: Env) => env.SUPPORT_EMAIL?.trim() || 'support@liftfitness.app';

const page = (title: string, body: string) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Lift</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:720px;margin:auto;padding:32px 20px;color:#1b1c17;background:#f9f9f7}h1{font-size:2.4rem;line-height:1.05}h2{margin-top:2rem}a{color:#0969da}nav{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:40px}label{display:block;font-weight:700;margin:18px 0 6px}input,button{box-sizing:border-box;font:inherit;padding:12px;border:1px solid #aaa;border-radius:10px}input{width:100%}button{margin-top:16px;background:#1b1c17;color:white;cursor:pointer}.note{color:#5f635b}.error{color:#b42318}</style></head><body><nav><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a><a href="/delete-account">Delete account</a></nav>${body}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });

function publicPage(pathname: string, env: Env) {
  const email = supportEmail(env);
  if (pathname === '/privacy') return page('Privacy policy', `<h1>Privacy policy</h1><p class="note">Effective September 22, 2026</p><h2>Data Lift handles</h2><p>Lift stores your Clerk account identifier and profile name; optional height, weight, goals, experience, training location, schedule, equipment, gym identifier, and favorite exercises; workout history including exercises, weights, repetitions, timestamps, muscle ratings, and recommendation feedback; and friend connections.</p><p>Weight and height are used only for your recommendations and, if you explicitly opt in, to match you into an anonymous comparison cohort. Cohorts require at least five matching people. Other people do not receive your height, weight, workout history, or cohort membership. Friends can see your display name, profile image, and latest personal record, but not your full workout history.</p><h2>Use and sharing</h2><p>We use this data to provide sync, progress, recommendations, friend features, security, and support. Clerk processes account identity and Cloudflare hosts synchronized app data. We do not sell personal data.</p><h2>Export and retention</h2><p>You can export your Lift data from Profile at any time. Active-account data is retained while your account exists. In-app deletion removes the live Clerk identity and synchronized app data immediately. A web request is processed after identity verification and within 30 days. Limited security records and encrypted backups may remain for up to 30 additional days unless law requires longer retention.</p><h2>Your choices</h2><p>Cohort participation is off by default and can be changed in Profile. You can delete your account in the app or <a href="/delete-account">request deletion on the web</a>. Contact <a href="mailto:${email}">${email}</a> for access, correction, privacy, or support requests.</p><h2>Fitness disclaimer</h2><p>Lift provides general fitness tracking and suggestions, not medical advice, diagnosis, or treatment. Consult a qualified health professional before beginning or changing an exercise program, especially if you have an injury, condition, or symptoms. Stop exercising and seek appropriate care if you feel pain, faintness, or other concerning symptoms.</p>`);
  if (pathname === '/terms') return page('Terms', `<h1>Terms of use</h1><p class="note">Effective September 22, 2026</p><p>Lift is a personal fitness tracking tool. You are responsible for your account, the accuracy of information you enter, and exercising within your abilities. Do not misuse the service, attempt unauthorized access, or use it to harm others.</p><h2>No medical advice</h2><p>Lift's tracking, comparisons, and recommendations are informational fitness features only. They are not medical advice, diagnosis, treatment, or a substitute for a qualified professional. Stop activity and seek care for pain or concerning symptoms.</p><h2>Your content and availability</h2><p>You keep ownership of data you enter and allow Lift to process it to operate the service. Features may change, and the service is provided without a guarantee that it will always be available or error-free. You can export or delete your data from Profile.</p><h2>Contact</h2><p>Questions: <a href="mailto:${email}">${email}</a>.</p>`);
  if (pathname === '/support') return page('Support', `<h1>Lift support</h1><p>For account, privacy, export, or technical help, email <a href="mailto:${email}">${email}</a>.</p><p>Include the email address on your Lift account, but never send your password or verification codes.</p><p>You can also <a href="/delete-account">request account deletion</a>.</p>`);
  if (pathname === '/delete-account') return page('Delete account', `<h1>Delete your Lift account</h1><p>The fastest option is <strong>Lift → Settings → Profile → Delete account</strong>. It deletes your Clerk identity, synchronized profile, height, weight, workouts, recommendation feedback, friend connections, and cohort preferences, and clears the app's local account cache.</p><p>If you cannot access the app, submit this request. We will verify ownership using the account email and complete deletion within 30 days.</p><form id="request"><label for="email">Lift account email</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254"><label><input name="confirm" type="checkbox" required style="width:auto"> I request permanent deletion of my Lift account and data.</label><button type="submit">Request deletion</button><p id="result" role="status"></p></form><script>document.querySelector('#request').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.currentTarget,r=document.querySelector('#result');r.textContent='Submitting…';r.className='';try{const x=await fetch('/v1/deletion-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value,confirm:f.confirm.checked})}),j=await x.json();if(!x.ok)throw Error(j.error||'Request failed.');r.textContent='Request received. Reference: '+j.requestId+'. Check your email for follow-up.';f.reset()}catch(x){r.textContent=x.message;r.className='error'}})</script><p>Need help? <a href="mailto:${email}">${email}</a>.</p>`);
  return null;
}

function bearer(request: Request) {
  const value = request.headers.get('Authorization');
  return value?.startsWith('Bearer ') ? value.slice(7).trim() || null : null;
}

function base64UrlBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson<T>(value: string): T | null {
  try { return JSON.parse(new TextDecoder().decode(base64UrlBytes(value))) as T; }
  catch { return null; }
}

function pemBytes(pem: string) {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  return base64UrlBytes(base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));
}

async function authenticate(request: Request, env: Env): Promise<AuthenticatedUser | null> {
  const token = bearer(request);
  if (!token || !env.CLERK_JWT_KEY) return null;
  const [encodedHeader, encodedClaims, encodedSignature, extra] = token.split('.');
  if (!encodedHeader || !encodedClaims || !encodedSignature || extra) return null;
  const header = decodeJson<{ alg?: string; typ?: string }>(encodedHeader);
  const claims = decodeJson<ClerkClaims>(encodedClaims);
  if (header?.alg !== 'RS256' || header.typ !== 'JWT' || !claims || typeof claims.sub !== 'string' || !claims.sub.startsWith('user_') || !Number.isFinite(claims.exp)) return null;
  const timestamp = now();
  if (claims.exp <= timestamp || (typeof claims.nbf === 'number' && claims.nbf > timestamp + 5)) return null;
  if (env.CLERK_ISSUER && claims.iss !== env.CLERK_ISSUER) return null;
  const allowedParties = env.CLERK_AUTHORIZED_PARTIES?.split(',').map((part) => part.trim()).filter(Boolean);
  if (allowedParties?.length && (!claims.azp || !allowedParties.includes(claims.azp))) return null;
  try {
    const publicKey = await crypto.subtle.importKey('spki', pemBytes(env.CLERK_JWT_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, base64UrlBytes(encodedSignature), encoder.encode(`${encodedHeader}.${encodedClaims}`));
    if (!valid) return null;
  } catch { return null; }
  const displayName = [claims.first_name, claims.last_name].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' ') || (typeof claims.username === 'string' && claims.username.trim() ? claims.username.trim() : 'Lifter');
  return { id: claims.sub, displayName, imageUrl: typeof claims.image_url === 'string' ? claims.image_url : null };
}

async function ensureUser(env: Env, user: AuthenticatedUser) {
  const stamp = now();
  // `id` is intentionally the Clerk subject, keeping foreign keys, friend
  // relationships, and authorization anchored to one immutable identity.
  await env.DB.prepare(`
    INSERT INTO users (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING
  `).bind(user.id, stamp).run();
  await env.DB.prepare(`
    INSERT INTO user_info (user_id, clerk_user_id, display_name, image_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING
  `).bind(user.id, user.id, user.displayName, user.imageUrl, stamp, stamp).run();
}

const isString = (value: unknown, max = 200): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const isTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maxTimestamp;
const isVersion = (value: unknown, fallback: number) => value === undefined || (isTimestamp(value) && value >= fallback);

function validTombstoneKey(tombstone: Tombstone) {
  const pieces = splitKey(tombstone.key);
  return (tombstone.entity === 'workout' && pieces.length === 1 && isString(pieces[0]))
    || (tombstone.entity === 'set' && pieces.length === 3 && isString(pieces[0]) && isString(pieces[1]) && /^\d+$/.test(pieces[2]!))
    || (tombstone.entity === 'rating' && pieces.length === 2 && isString(pieces[0]) && isString(pieces[1], 80));
}

function validPayload(value: unknown): value is SyncPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SyncPayload>;
  if (!Array.isArray(payload.workouts) || !Array.isArray(payload.sets) || !Array.isArray(payload.muscleRatings) || (payload.recommendationFeedback !== undefined && !Array.isArray(payload.recommendationFeedback)) || (payload.tombstones !== undefined && !Array.isArray(payload.tombstones))) return false;
  if (payload.workouts.length > 2_000 || payload.sets.length > 10_000 || payload.muscleRatings.length > 10_000 || (payload.recommendationFeedback?.length ?? 0) > 10_000 || (payload.tombstones?.length ?? 0) > 10_000) return false;
  if (!payload.workouts.every((workout) => workout && typeof workout === 'object' && isString(workout.id) && ['push', 'pull', 'legs'].includes(workout.split) && isTimestamp(workout.createdAt) && (workout.endedAt === null || isTimestamp(workout.endedAt)) && (workout.endedAt === null || workout.endedAt >= workout.createdAt) && isVersion(workout.updatedAt, Math.max(workout.createdAt, workout.endedAt ?? 0)))) return false;
  const workoutIds = new Set(payload.workouts.map((workout) => workout.id));
  if (workoutIds.size !== payload.workouts.length) return false;
  const seenSets = new Set<string>();
  if (!payload.sets.every((set) => {
    const key = set && typeof set === 'object' ? setKey(set) : '';
    const okay = !!set && typeof set === 'object' && workoutIds.has(set.workoutId) && isString(set.workoutId) && isString(set.exerciseId) && Number.isInteger(set.setNumber) && set.setNumber > 0 && set.setNumber <= 100 && typeof set.weight === 'number' && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 10_000 && Number.isInteger(set.reps) && set.reps > 0 && set.reps <= 10_000 && isTimestamp(set.completedAt) && Array.isArray(set.muscles) && set.muscles.length <= 8 && set.muscles.every((muscle) => isString(muscle, 80)) && isVersion(set.updatedAt, set.completedAt) && !seenSets.has(key);
    seenSets.add(key); return okay;
  })) return false;
  const seenRatings = new Set<string>();
  if (!payload.muscleRatings.every((rating) => {
    const key = rating && typeof rating === 'object' ? ratingKey(rating) : '';
    const okay = !!rating && typeof rating === 'object' && workoutIds.has(rating.workoutId) && isString(rating.workoutId) && isString(rating.muscle, 80) && Number.isInteger(rating.exhaustion) && rating.exhaustion >= 1 && rating.exhaustion <= 5 && isTimestamp(rating.createdAt) && isVersion(rating.updatedAt, rating.createdAt) && !seenRatings.has(key);
    seenRatings.add(key); return okay;
  })) return false;
  const feedbackActions = new Set<FeedbackAction>(['accepted', 'completed', 'replaced', 'removed', 'skipped', 'manual']);
  const seenFeedback = new Set<string>();
  if (!(payload.recommendationFeedback ?? []).every((item) => {
    const key = item && typeof item === 'object' ? `${item.workoutId}\u001f${item.exerciseId}\u001f${item.action}` : '';
    const okay = !!item && typeof item === 'object' && workoutIds.has(item.workoutId) && isString(item.exerciseId) && feedbackActions.has(item.action)
      && (item.relatedExerciseId == null || isString(item.relatedExerciseId)) && isTimestamp(item.createdAt)
      && isVersion(item.updatedAt, item.createdAt) && !seenFeedback.has(key);
    seenFeedback.add(key); return okay;
  })) return false;
  return (payload.tombstones ?? []).every((tombstone) => tombstone && typeof tombstone === 'object' && ['workout', 'set', 'rating'].includes(tombstone.entity) && isString(tombstone.key, 500) && !tombstone.key.includes('\u0000') && isTimestamp(tombstone.deletedAt) && validTombstoneKey(tombstone));
}

function validMutation(value: unknown): value is SyncMutation {
  if (!value || typeof value !== 'object') return false;
  const mutation = value as Partial<SyncMutation>;
  if (!['workout', 'set', 'rating', 'feedback'].includes(mutation.entity ?? '') || !isString(mutation.key, 500)
    || mutation.key!.includes('\u0000') || !['upsert', 'delete'].includes(mutation.operation ?? '')
    || !Number.isInteger(mutation.baseRevision) || mutation.baseRevision! < 0) return false;
  if (mutation.operation === 'delete') return mutation.entity !== 'feedback' && mutation.record === undefined
    && validTombstoneKey({ entity: mutation.entity, key: mutation.key!, deletedAt: 0 } as Tombstone);
  const record = mutation.record as Record<string, unknown> | undefined;
  if (!record) return false;
  if (mutation.entity === 'workout') return validPayload({ workouts: [record], sets: [], muscleRatings: [], tombstones: [] }) && mutation.key === record.id;
  if (mutation.entity === 'set') {
    const workout = { id: record.workoutId, split: 'push', createdAt: 0, endedAt: null };
    return validPayload({ workouts: [workout], sets: [record], muscleRatings: [], tombstones: [] }) && mutation.key === setKey(record as SyncSet);
  }
  if (mutation.entity === 'rating') {
    const workout = { id: record.workoutId, split: 'push', createdAt: 0, endedAt: null };
    return validPayload({ workouts: [workout], sets: [], muscleRatings: [record], tombstones: [] }) && mutation.key === ratingKey(record as SyncRating);
  }
  const workout = { id: record.workoutId, split: 'push', createdAt: 0, endedAt: null };
  return validPayload({ workouts: [workout], sets: [], muscleRatings: [], recommendationFeedback: [record], tombstones: [] })
    && mutation.key === feedbackKey(record as SyncFeedback);
}

function validChunk(value: unknown): value is SyncChunk {
  if (!value || typeof value !== 'object') return false;
  const chunk = value as Partial<SyncChunk>;
  return isString(chunk.batchId, 100) && Array.isArray(chunk.changes) && chunk.changes.length > 0
    && chunk.changes.length <= maxSyncChunk && chunk.changes.every(validMutation)
    && new Set(chunk.changes.map((change) => `${change.entity}\u0000${change.key}`)).size === chunk.changes.length;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function recommendations(env: Env, userId: string) {
  const since = now() - 28 * 86_400;
  const timestamp = now();
  const ownTotal = (await env.DB.prepare('SELECT COUNT(*) AS total FROM workout_sets WHERE user_id = ? AND completed_at BETWEEN ? AND ?').bind(userId, since, timestamp).first<{ total: number }>())?.total ?? 0;
  const rows = await env.DB.prepare(`
    WITH muscles(muscle) AS (VALUES
      ('abdominals'), ('abductors'), ('adductors'), ('biceps'), ('calves'), ('chest'),
      ('forearms'), ('glutes'), ('hamstrings'), ('lats'), ('lower back'), ('middle back'),
      ('neck'), ('obliques'), ('quadriceps'), ('shoulders'), ('traps'), ('triceps')
    ), user_totals AS (
      SELECT user_id, COUNT(*) AS set_count FROM workout_sets WHERE completed_at BETWEEN ? AND ? GROUP BY user_id
    ), me AS (
      SELECT goals, weight_lb, height_inches, experience, training_location, training_days, gym_id, similar_users_opt_in
      FROM user_info WHERE user_id = ?
    ), candidates AS (
      SELECT totals.user_id FROM user_totals totals JOIN user_info peer ON peer.user_id = totals.user_id CROSS JOIN me
      WHERE totals.user_id != ? AND peer.similar_users_opt_in = 1 AND me.similar_users_opt_in = 1
        AND ABS(totals.set_count - ?) <= MAX(3, ? * 0.30)
        -- A supplied gym is an explicit cohort boundary.
        AND (me.gym_id IS NULL OR peer.gym_id = me.gym_id)
    ), matched_candidates AS (
      SELECT candidate.user_id FROM candidates candidate JOIN user_info peer ON peer.user_id = candidate.user_id CROSS JOIN me
      WHERE (me.goals IS NULL OR json_array_length(me.goals) = 0 OR EXISTS (SELECT 1 FROM json_each(me.goals) mine_goal JOIN json_each(peer.goals) peer_goal ON mine_goal.value = peer_goal.value))
        AND (me.experience IS NULL OR peer.experience = me.experience)
        AND (me.training_days IS NULL OR ABS(peer.training_days - me.training_days) <= 1)
        AND (me.height_inches IS NULL OR ABS(peer.height_inches - me.height_inches) <= 3)
        AND (me.weight_lb IS NULL OR ABS(peer.weight_lb - me.weight_lb) <= MAX(10, me.weight_lb * 0.10))
    ), cohort AS (
      SELECT user_id FROM matched_candidates WHERE (SELECT COUNT(*) FROM matched_candidates) >= 5
    ), peer_sets AS (
      SELECT cohort.user_id, muscles.muscle, COUNT(sm.muscle) AS sets
      FROM cohort CROSS JOIN muscles
      LEFT JOIN workout_sets ws ON ws.user_id = cohort.user_id AND ws.completed_at BETWEEN ? AND ?
      LEFT JOIN set_muscles sm ON sm.user_id = ws.user_id AND sm.workout_local_id = ws.workout_local_id AND sm.exercise_id = ws.exercise_id AND sm.set_number = ws.set_number AND sm.muscle = muscles.muscle
      GROUP BY cohort.user_id, muscles.muscle
    ), mine AS (
      SELECT muscles.muscle, COUNT(sm.muscle) AS sets
      FROM muscles
      LEFT JOIN workout_sets ws ON ws.user_id = ? AND ws.completed_at BETWEEN ? AND ?
      LEFT JOIN set_muscles sm ON sm.user_id = ws.user_id AND sm.workout_local_id = ws.workout_local_id AND sm.exercise_id = ws.exercise_id AND sm.set_number = ws.set_number AND sm.muscle = muscles.muscle
      GROUP BY muscles.muscle
    )
    SELECT mine.muscle AS muscle, mine.sets AS mySets, ROUND(AVG(peer_sets.sets), 1) AS peerSets, COUNT(peer_sets.user_id) AS peerCount
    FROM mine JOIN peer_sets ON peer_sets.muscle = mine.muscle
    GROUP BY mine.muscle, mine.sets
    HAVING COUNT(peer_sets.user_id) >= 5
    ORDER BY (mine.sets - AVG(peer_sets.sets)) ASC, mine.muscle ASC
  `).bind(since, timestamp, userId, userId, ownTotal, ownTotal, since, timestamp, userId, since, timestamp).all<{ muscle: string; mySets: number; peerSets: number; peerCount: number }>();
  return rows.results.map((row) => ({ ...row, direction: row.mySets < row.peerSets * 0.7 ? 'below_peer_range' : row.mySets > row.peerSets * 1.3 ? 'above_peer_range' : 'within_peer_range' }));
}

const batchRevision = `(SELECT revision FROM sync_batches WHERE user_id = ? AND batch_id = ?)`;
const batchMatches = `(SELECT request_hash FROM sync_batches WHERE user_id = ? AND batch_id = ?) = ?`;

function mutationStatements(env: Env, userId: string, batchId: string, hash: string, change: SyncMutation) {
  const statements: D1PreparedStatement[] = [];
  const revisionArgs = [userId, batchId];
  const gateArgs = [userId, batchId, hash];
  const payload = change.record ? JSON.stringify(change.record) : null;
  const pieces = splitKey(change.key);
  if (change.operation === 'delete') {
    const liveRevision = change.entity === 'workout'
      ? `(SELECT sync_revision FROM workouts WHERE user_id = ? AND local_id = ?)`
      : change.entity === 'set'
        ? `(SELECT sync_revision FROM workout_sets WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND set_number = ?)`
        : `(SELECT sync_revision FROM workout_muscle_ratings WHERE user_id = ? AND workout_local_id = ? AND muscle = ?)`;
    const liveArgs = change.entity === 'workout' ? [userId, pieces[0]]
      : change.entity === 'set' ? [userId, pieces[0], pieces[1], Number(pieces[2])]
        : [userId, pieces[0], pieces[1]];
    statements.push(env.DB.prepare(`
      INSERT INTO sync_tombstones (user_id, entity, record_key, deleted_at, sync_revision)
      SELECT ?, ?, ?, unixepoch(), ${batchRevision}
      WHERE ${batchMatches} AND (MAX(COALESCE(${liveRevision}, 0), COALESCE((SELECT sync_revision FROM sync_tombstones WHERE user_id = ? AND entity = ? AND record_key = ?), 0)) = ?
        OR COALESCE((SELECT sync_revision FROM sync_tombstones WHERE user_id = ? AND entity = ? AND record_key = ?), 0) = ${batchRevision})
      ON CONFLICT(user_id, entity, record_key) DO UPDATE SET deleted_at = excluded.deleted_at, sync_revision = excluded.sync_revision
    `).bind(userId, change.entity, change.key, ...revisionArgs, ...gateArgs, ...liveArgs, userId, change.entity, change.key, change.baseRevision, userId, change.entity, change.key, ...revisionArgs));
    const accepted = `EXISTS (SELECT 1 FROM sync_tombstones WHERE user_id = ? AND entity = ? AND record_key = ? AND sync_revision = ${batchRevision})`;
    const acceptedArgs = [userId, change.entity, change.key, ...revisionArgs];
    if (change.entity === 'workout') statements.push(env.DB.prepare(`DELETE FROM workouts WHERE user_id = ? AND local_id = ? AND sync_revision <= ? AND ${accepted}`).bind(userId, pieces[0], change.baseRevision, ...acceptedArgs));
    if (change.entity === 'set') statements.push(env.DB.prepare(`DELETE FROM workout_sets WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND set_number = ? AND sync_revision <= ? AND ${accepted}`).bind(userId, pieces[0], pieces[1], Number(pieces[2]), change.baseRevision, ...acceptedArgs));
    if (change.entity === 'rating') statements.push(env.DB.prepare(`DELETE FROM workout_muscle_ratings WHERE user_id = ? AND workout_local_id = ? AND muscle = ? AND sync_revision <= ? AND ${accepted}`).bind(userId, pieces[0], pieces[1], change.baseRevision, ...acceptedArgs));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
      SELECT ?, ${batchRevision}, ?, ?, 1, NULL WHERE ${accepted}`).bind(userId, ...revisionArgs, change.entity, change.key, ...acceptedArgs));
    return statements;
  }

  const record = change.record!;
  if (change.entity === 'workout') {
    statements.push(env.DB.prepare(`INSERT INTO workouts (user_id, local_id, split, created_at, ended_at, updated_at, sync_revision)
      SELECT ?, ?, ?, ?, ?, ?, ${batchRevision} WHERE ${batchMatches}
        AND (MAX(COALESCE((SELECT sync_revision FROM workouts WHERE user_id = ? AND local_id = ?), 0), COALESCE((SELECT sync_revision FROM sync_tombstones WHERE user_id = ? AND entity = 'workout' AND record_key = ?), 0)) = ?
          OR COALESCE((SELECT sync_revision FROM workouts WHERE user_id = ? AND local_id = ?), 0) = ${batchRevision})
      ON CONFLICT(user_id, local_id) DO UPDATE SET split = excluded.split, created_at = excluded.created_at, ended_at = excluded.ended_at, updated_at = excluded.updated_at, sync_revision = excluded.sync_revision
    `).bind(userId, record.id, record.split, record.createdAt, record.endedAt, now(), ...revisionArgs, ...gateArgs, userId, change.key, userId, change.key, change.baseRevision, userId, change.key, ...revisionArgs));
    statements.push(env.DB.prepare(`DELETE FROM sync_tombstones WHERE user_id = ? AND entity = 'workout' AND record_key = ? AND sync_revision <= ? AND EXISTS (SELECT 1 FROM workouts WHERE user_id = ? AND local_id = ? AND sync_revision = ${batchRevision})`).bind(userId, change.key, change.baseRevision, userId, change.key, ...revisionArgs));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
      SELECT ?, ${batchRevision}, 'workout', ?, 0, ? WHERE EXISTS (SELECT 1 FROM workouts WHERE user_id = ? AND local_id = ? AND sync_revision = ${batchRevision})`).bind(userId, ...revisionArgs, change.key, payload, userId, change.key, ...revisionArgs));
  }
  if (change.entity === 'set') {
    const set = record as SyncSet;
    statements.push(env.DB.prepare(`INSERT INTO workout_sets (user_id, workout_local_id, exercise_id, set_number, weight, reps, completed_at, updated_at, sync_revision)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ${batchRevision} WHERE ${batchMatches}
        AND EXISTS (SELECT 1 FROM workouts WHERE user_id = ? AND local_id = ?)
        AND (MAX(COALESCE((SELECT sync_revision FROM workout_sets WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND set_number = ?), 0), COALESCE((SELECT sync_revision FROM sync_tombstones WHERE user_id = ? AND entity = 'set' AND record_key = ?), 0)) = ?
          OR COALESCE((SELECT sync_revision FROM workout_sets WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND set_number = ?), 0) = ${batchRevision})
      ON CONFLICT(user_id, workout_local_id, exercise_id, set_number) DO UPDATE SET weight = excluded.weight, reps = excluded.reps, completed_at = excluded.completed_at, updated_at = excluded.updated_at, sync_revision = excluded.sync_revision
    `).bind(userId, set.workoutId, set.exerciseId, set.setNumber, set.weight, set.reps, set.completedAt, now(), ...revisionArgs, ...gateArgs, userId, set.workoutId, userId, set.workoutId, set.exerciseId, set.setNumber, userId, change.key, change.baseRevision, userId, set.workoutId, set.exerciseId, set.setNumber, ...revisionArgs));
    const accepted = `EXISTS (SELECT 1 FROM workout_sets WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND set_number = ? AND sync_revision = ${batchRevision})`;
    const acceptedArgs = [userId, set.workoutId, set.exerciseId, set.setNumber, ...revisionArgs];
    statements.push(env.DB.prepare(`DELETE FROM sync_tombstones WHERE user_id = ? AND entity = 'set' AND record_key = ? AND sync_revision <= ? AND ${accepted}`).bind(userId, change.key, change.baseRevision, ...acceptedArgs));
    statements.push(env.DB.prepare(`DELETE FROM set_muscles WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND set_number = ? AND ${accepted}`).bind(userId, set.workoutId, set.exerciseId, set.setNumber, ...acceptedArgs));
    for (const muscle of [...new Set(set.muscles)]) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO set_muscles (user_id, workout_local_id, exercise_id, set_number, muscle) SELECT ?, ?, ?, ?, ? WHERE ${accepted}`).bind(userId, set.workoutId, set.exerciseId, set.setNumber, muscle, ...acceptedArgs));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO sync_changes (user_id, revision, entity, record_key, deleted, payload) SELECT ?, ${batchRevision}, 'set', ?, 0, ? WHERE ${accepted}`).bind(userId, ...revisionArgs, change.key, payload, ...acceptedArgs));
  }
  if (change.entity === 'rating') {
    const rating = record as SyncRating;
    statements.push(env.DB.prepare(`INSERT INTO workout_muscle_ratings (user_id, workout_local_id, muscle, exhaustion, created_at, updated_at, sync_revision)
      SELECT ?, ?, ?, ?, ?, ?, ${batchRevision} WHERE ${batchMatches} AND EXISTS (SELECT 1 FROM workouts WHERE user_id = ? AND local_id = ?)
        AND (MAX(COALESCE((SELECT sync_revision FROM workout_muscle_ratings WHERE user_id = ? AND workout_local_id = ? AND muscle = ?), 0), COALESCE((SELECT sync_revision FROM sync_tombstones WHERE user_id = ? AND entity = 'rating' AND record_key = ?), 0)) = ?
          OR COALESCE((SELECT sync_revision FROM workout_muscle_ratings WHERE user_id = ? AND workout_local_id = ? AND muscle = ?), 0) = ${batchRevision})
      ON CONFLICT(user_id, workout_local_id, muscle) DO UPDATE SET exhaustion = excluded.exhaustion, created_at = excluded.created_at, updated_at = excluded.updated_at, sync_revision = excluded.sync_revision
    `).bind(userId, rating.workoutId, rating.muscle, rating.exhaustion, rating.createdAt, now(), ...revisionArgs, ...gateArgs, userId, rating.workoutId, userId, rating.workoutId, rating.muscle, userId, change.key, change.baseRevision, userId, rating.workoutId, rating.muscle, ...revisionArgs));
    const accepted = `EXISTS (SELECT 1 FROM workout_muscle_ratings WHERE user_id = ? AND workout_local_id = ? AND muscle = ? AND sync_revision = ${batchRevision})`;
    const acceptedArgs = [userId, rating.workoutId, rating.muscle, ...revisionArgs];
    statements.push(env.DB.prepare(`DELETE FROM sync_tombstones WHERE user_id = ? AND entity = 'rating' AND record_key = ? AND sync_revision <= ? AND ${accepted}`).bind(userId, change.key, change.baseRevision, ...acceptedArgs));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO sync_changes (user_id, revision, entity, record_key, deleted, payload) SELECT ?, ${batchRevision}, 'rating', ?, 0, ? WHERE ${accepted}`).bind(userId, ...revisionArgs, change.key, payload, ...acceptedArgs));
  }
  if (change.entity === 'feedback') {
    const feedback = record as SyncFeedback;
    statements.push(env.DB.prepare(`INSERT INTO recommendation_feedback (user_id, workout_local_id, exercise_id, action, related_exercise_id, created_at, updated_at, sync_revision)
      SELECT ?, ?, ?, ?, ?, ?, ?, ${batchRevision} WHERE ${batchMatches} AND EXISTS (SELECT 1 FROM workouts WHERE user_id = ? AND local_id = ?)
        AND (COALESCE((SELECT sync_revision FROM recommendation_feedback WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND action = ?), 0) = ?
          OR COALESCE((SELECT sync_revision FROM recommendation_feedback WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND action = ?), 0) = ${batchRevision})
      ON CONFLICT(user_id, workout_local_id, exercise_id, action) DO UPDATE SET related_exercise_id = excluded.related_exercise_id, created_at = excluded.created_at, updated_at = excluded.updated_at, sync_revision = excluded.sync_revision
    `).bind(userId, feedback.workoutId, feedback.exerciseId, feedback.action, feedback.relatedExerciseId ?? null, feedback.createdAt, now(), ...revisionArgs, ...gateArgs, userId, feedback.workoutId, userId, feedback.workoutId, feedback.exerciseId, feedback.action, change.baseRevision, userId, feedback.workoutId, feedback.exerciseId, feedback.action, ...revisionArgs));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
      SELECT ?, ${batchRevision}, 'feedback', ?, 0, ? WHERE EXISTS (SELECT 1 FROM recommendation_feedback WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND action = ? AND sync_revision = ${batchRevision})`).bind(userId, ...revisionArgs, change.key, payload, userId, feedback.workoutId, feedback.exerciseId, feedback.action, ...revisionArgs));
  }
  return statements;
}

async function pushSyncChunk(request: Request, env: Env, userId: string) {
  const body: unknown = await request.json().catch(() => null);
  if (!validChunk(body)) return json({ error: `A sync batch must contain 1-${maxSyncChunk} valid changes.` }, 400);
  const hash = await sha256(JSON.stringify(body.changes));
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('INSERT OR IGNORE INTO sync_accounts (user_id, revision) VALUES (?, 0)').bind(userId),
    env.DB.prepare('UPDATE sync_accounts SET revision = revision + 1 WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM sync_batches WHERE user_id = ? AND batch_id = ?)').bind(userId, userId, body.batchId),
    env.DB.prepare('INSERT OR IGNORE INTO sync_batches (user_id, batch_id, request_hash, revision) SELECT ?, ?, ?, revision FROM sync_accounts WHERE user_id = ?').bind(userId, body.batchId, hash, userId),
  ];
  for (const change of body.changes) statements.push(...mutationStatements(env, userId, body.batchId, hash, change));
  statements.push(env.DB.prepare('SELECT revision, request_hash AS requestHash FROM sync_batches WHERE user_id = ? AND batch_id = ?').bind(userId, body.batchId));
  const results = await env.DB.batch<{ revision?: number; requestHash?: string }>(statements);
  const receipt = results.at(-1)?.results?.[0];
  if (!receipt || receipt.requestHash !== hash) return json({ error: 'Idempotency key was already used for another batch.' }, 409);
  return json({ batchId: body.batchId, revision: receipt.revision });
}

async function pullSyncChanges(env: Env, userId: string, url: URL) {
  const cursor = Number(url.searchParams.get('cursor') ?? 0);
  const requestedLimit = Number(url.searchParams.get('limit') ?? 50);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) return json({ error: 'Invalid sync cursor or limit.' }, 400);
  const limit = Math.min(requestedLimit, 100);
  const [rows, account] = await Promise.all([
    env.DB.prepare('SELECT id, revision, entity, record_key AS key, deleted, payload FROM sync_changes WHERE user_id = ? AND id > ? ORDER BY id LIMIT ?').bind(userId, cursor, limit + 1).all<{ id: number; revision: number; entity: SyncEntity; key: string; deleted: number; payload: string | null }>(),
    env.DB.prepare('SELECT revision FROM sync_accounts WHERE user_id = ?').bind(userId).first<{ revision: number }>(),
  ]);
  const page = rows.results.slice(0, limit);
  return json({
    changes: page.map(({ id: _, payload, deleted, ...change }) => ({ ...change, operation: deleted ? 'delete' : 'upsert', record: payload ? JSON.parse(payload) : undefined })),
    cursor: page.at(-1)?.id ?? cursor,
    hasMore: rows.results.length > limit,
    revision: account?.revision ?? 0,
  });
}

function friendCode() { return crypto.getRandomValues(new Uint32Array(1))[0]!.toString(36).slice(-6).padStart(6, '0').toUpperCase(); }

async function codeFor(env: Env, userId: string) {
  const existing = await env.DB.prepare('SELECT friend_code AS code FROM users WHERE id = ?').bind(userId).first<{ code: string | null }>();
  if (existing?.code) return existing.code;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = friendCode();
    try { await env.DB.prepare('UPDATE users SET friend_code = ? WHERE id = ? AND friend_code IS NULL').bind(code, userId).run(); }
    catch { /* unique collision: read/retry below */ }
    const assigned = await env.DB.prepare('SELECT friend_code AS code FROM users WHERE id = ?').bind(userId).first<{ code: string | null }>();
    if (assigned?.code) return assigned.code;
  }
  throw new Error('Could not create friend code.');
}

async function friends(env: Env, userId: string) {
  const rows = await env.DB.prepare(`SELECT u.id, i.display_name AS displayName, i.image_url AS imageUrl FROM friendships f JOIN users u ON u.id = f.friend_id JOIN user_info i ON i.user_id = u.id WHERE f.user_id = ? ORDER BY f.created_at DESC`).bind(userId).all<{ id: string; displayName: string; imageUrl: string | null }>();
  return { count: rows.results.length, users: rows.results };
}

async function profile(env: Env, userId: string) {
  const row = await env.DB.prepare(`SELECT clerk_user_id AS clerkUserId, display_name AS displayName, image_url AS imageUrl,
    goals, weight_lb AS weightLb, height_inches AS heightInches, experience, favorite_exercise_ids AS favoriteExerciseIds, training_location AS trainingLocation,
    training_days AS trainingDays, gym_id AS gymId, available_equipment AS availableEquipment,
    session_minutes AS sessionMinutes, similar_users_opt_in AS optInSimilarUsers
    FROM user_info WHERE user_id = ?`).bind(userId).first<ProfileRow>();
  if (!row) throw new Error('Profile not found.');
  const { goals, favoriteExerciseIds, availableEquipment, optInSimilarUsers } = row;
  return { clerkUserId: row.clerkUserId, displayName: row.displayName, imageUrl: row.imageUrl, recommendationPreferences: {
    goals: parseStringArray(goals), weightLb: row.weightLb, heightInches: row.heightInches, experience: row.experience, favoriteExerciseIds: parseStringArray(favoriteExerciseIds),
    trainingLocation: row.trainingLocation, trainingDays: row.trainingDays, gymId: row.gymId,
    availableEquipment: parseStringArray(availableEquipment), sessionMinutes: row.sessionMinutes, optInSimilarUsers: optInSimilarUsers === 1,
  } };
}

function parseStringArray(value: string | null) { try { const parsed: unknown = value && JSON.parse(value); return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : null; } catch { return null; } }
const goalValues: PreferenceGoal[] = ['Build muscle', 'Get stronger', 'Lose fat', 'Feel healthier'];
function optionalStringArray(value: unknown, allowed?: readonly string[], maximum = allowed ? 4 : 20) { return value === undefined || value === null || (Array.isArray(value) && value.length <= maximum && value.every((item) => isString(item, 80) && (!allowed || allowed.includes(item)))); }
function optionalNumber(value: unknown, minimum: number, maximum: number, integer = false) { return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum && (!integer || Number.isInteger(value))); }

async function updateProfile(request: Request, env: Env, userId: string) {
  const body = await request.json().catch(() => null) as { displayName?: unknown; recommendationPreferences?: unknown } | null;
  if (!body || typeof body !== 'object') return json({ error: 'Invalid profile data.' }, 400);
  const displayName = body.displayName === undefined ? undefined : typeof body.displayName === 'string' ? body.displayName.trim().replace(/\s+/g, ' ') : '';
  if (displayName !== undefined && !isString(displayName, 40)) return json({ error: 'Display name must be between 1 and 40 characters.' }, 400);
  const preferences = body.recommendationPreferences;
  if (preferences !== undefined && (!preferences || typeof preferences !== 'object' || Array.isArray(preferences))) return json({ error: 'Invalid recommendation preferences.' }, 400);
  const data = preferences as Record<string, unknown> | undefined;
  const keys = ['goals', 'weightLb', 'heightInches', 'experience', 'favoriteExerciseIds', 'trainingLocation', 'trainingDays', 'gymId', 'availableEquipment', 'sessionMinutes', 'optInSimilarUsers'];
  if (data && Object.keys(data).some((key) => !keys.includes(key))) return json({ error: 'Invalid recommendation preferences.' }, 400);
  const validExperience = data?.experience === undefined || data.experience === null || ['new', 'some', 'experienced'].includes(data.experience as string);
  const validLocation = data?.trainingLocation === undefined || data.trainingLocation === null || ['gym', 'home', 'both'].includes(data.trainingLocation as string);
  const validGym = data?.gymId === undefined || data.gymId === null || isString(data.gymId, 80);
  const validOptIn = data?.optInSimilarUsers === undefined || typeof data.optInSimilarUsers === 'boolean';
  const validPreferences = !data || (optionalStringArray(data.goals, goalValues)
    && optionalNumber(data.weightLb, 50, 1_000)
    && optionalNumber(data.heightInches, 36, 108, true)
    && validExperience && optionalStringArray(data.favoriteExerciseIds, undefined, 5) && validLocation
    && optionalNumber(data.trainingDays, 1, 7, true)
    && validGym && optionalStringArray(data.availableEquipment)
    && optionalNumber(data.sessionMinutes, 5, 300, true) && validOptIn);
  if (!validPreferences) return json({ error: 'Invalid recommendation preferences.' }, 400);
  const columns: Record<string, string> = { goals: 'goals', weightLb: 'weight_lb', heightInches: 'height_inches', experience: 'experience', favoriteExerciseIds: 'favorite_exercise_ids', trainingLocation: 'training_location', trainingDays: 'training_days', gymId: 'gym_id', availableEquipment: 'available_equipment', sessionMinutes: 'session_minutes', optInSimilarUsers: 'similar_users_opt_in' };
  const assignments: string[] = [];
  const values: unknown[] = [];
  if (displayName !== undefined) { assignments.push('display_name = ?'); values.push(displayName); }
  for (const key of keys) if (data?.[key] !== undefined) {
    assignments.push(`${columns[key]} = ?`);
    const value = data[key];
    values.push(key === 'goals' || key === 'favoriteExerciseIds' || key === 'availableEquipment' ? value === null ? null : JSON.stringify(value) : key === 'optInSimilarUsers' ? value ? 1 : 0 : value);
  }
  if (!assignments.length) return json({ error: 'Provide a profile field to update.' }, 400);
  assignments.push('updated_at = ?'); values.push(now(), userId);
  await env.DB.prepare(`UPDATE user_info SET ${assignments.join(', ')} WHERE user_id = ?`).bind(...values).run();
  return json({ profile: await profile(env, userId) });
}

function validOnboarding(value: unknown): value is Onboarding {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Onboarding>;
  const { weightLb, heightInches, trainingDays } = data;
  return (data.displayName === undefined || (typeof data.displayName === 'string' && isString(data.displayName.trim().replace(/\s+/g, ' '), 40)))
    && Array.isArray(data.goals) && data.goals.length > 0 && data.goals.length <= 4 && data.goals.every((goal) => ['Build muscle', 'Get stronger', 'Lose fat', 'Feel healthier'].includes(goal))
    && typeof weightLb === 'number' && Number.isFinite(weightLb) && weightLb >= 50 && weightLb <= 1_000
    && typeof heightInches === 'number' && Number.isInteger(heightInches) && heightInches >= 36 && heightInches <= 108
    && (data.favoriteExerciseIds === undefined || (Array.isArray(data.favoriteExerciseIds) && data.favoriteExerciseIds.length <= 5 && data.favoriteExerciseIds.every((id) => isString(id, 80))))
    && ['new', 'some', 'experienced'].includes(data.experience ?? '') && ['gym', 'home', 'both'].includes(data.trainingLocation ?? '')
    && typeof trainingDays === 'number' && Number.isInteger(trainingDays) && trainingDays >= 1 && trainingDays <= 7;
}

async function saveOnboarding(request: Request, env: Env, userId: string) {
  const body: unknown = await request.json().catch(() => null);
  if (!validOnboarding(body)) return json({ error: 'Invalid onboarding data.' }, 400);
  await env.DB.prepare('UPDATE user_info SET display_name = COALESCE(?, display_name), goals = ?, weight_lb = ?, height_inches = ?, experience = ?, favorite_exercise_ids = ?, training_location = ?, training_days = ?, onboarded_at = ?, updated_at = ? WHERE user_id = ?').bind(body.displayName?.trim().replace(/\s+/g, ' ') ?? null, JSON.stringify(body.goals), body.weightLb, body.heightInches, body.experience, JSON.stringify(body.favoriteExerciseIds ?? []), body.trainingLocation, body.trainingDays, now(), now(), userId).run();
  return json({ ok: true }, 201);
}

/** The latest new max-weight set for each friend. Workout details stay private. */
async function friendPersonalRecords(env: Env, userId: string) {
  const rows = await env.DB.prepare(`
    WITH ranked_sets AS (
      SELECT ws.user_id AS friendId, i.display_name AS displayName, i.image_url AS imageUrl,
        ws.exercise_id AS exerciseId, ws.weight, ws.reps, ws.completed_at AS completedAt,
        MAX(ws.weight) OVER (
          PARTITION BY ws.user_id, ws.exercise_id
          ORDER BY ws.completed_at, ws.workout_local_id, ws.set_number
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS previousBest
      FROM friendships f
      JOIN user_info i ON i.user_id = f.friend_id
      JOIN workout_sets ws ON ws.user_id = f.friend_id
      WHERE f.user_id = ?
    ), recent_records AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY friendId ORDER BY completedAt DESC, weight DESC) AS friendRank
      FROM ranked_sets WHERE previousBest IS NOT NULL AND weight > previousBest
    )
    SELECT friendId AS id, displayName, imageUrl, exerciseId, weight, reps, completedAt
    FROM recent_records WHERE friendRank = 1 ORDER BY completedAt DESC
  `).bind(userId).all<{ id: string; displayName: string; imageUrl: string | null; exerciseId: string; weight: number; reps: number; completedAt: number }>();
  return rows.results;
}

async function addFriend(request: Request, env: Env, userId: string) {
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: 'Enter a six-character friend code.' }, 400);
  const match = await env.DB.prepare('SELECT u.id FROM users u JOIN user_info i ON i.user_id = u.id WHERE u.friend_code = ?').bind(code).first<{ id: string }>();
  if (!match) return json({ error: 'That friend code was not found.' }, 404);
  if (match.id === userId) return json({ error: 'You cannot add your own code.' }, 400);
  const stamp = now();
  await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(userId, match.id, stamp), env.DB.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(match.id, userId, stamp)]);
  return json({ friends: await friends(env, userId) }, 201);
}

async function requestAccountDeletion(request: Request, env: Env) {
  const body = await request.json().catch(() => null) as { email?: unknown; confirm?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (body?.confirm !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'Enter your account email and confirm deletion.' }, 400);
  const id = crypto.randomUUID();
  const stamp = now();
  await env.DB.prepare(`INSERT INTO account_deletion_requests (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET updated_at = excluded.updated_at`).bind(id, email, stamp, stamp).run();
  const row = await env.DB.prepare("SELECT id FROM account_deletion_requests WHERE email = ? AND status IN ('pending', 'verified')").bind(email).first<{ id: string }>();
  return json({ requestId: row?.id ?? id }, 202);
}

async function deleteAccount(env: Env, userId: string) {
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return json({ deleted: true });
}

async function exportAccount(env: Env, userId: string) {
  const [profileRow, workouts, sets, muscles, ratings, feedback, connections] = await Promise.all([
    env.DB.prepare('SELECT clerk_user_id AS clerkUserId, display_name AS displayName, image_url AS imageUrl, goals, weight_lb AS weightLb, height_inches AS heightInches, experience, favorite_exercise_ids AS favoriteExerciseIds, training_location AS trainingLocation, training_days AS trainingDays, gym_id AS gymId, available_equipment AS availableEquipment, session_minutes AS sessionMinutes, similar_users_opt_in AS optInSimilarUsers, created_at AS createdAt, updated_at AS updatedAt FROM user_info WHERE user_id = ?').bind(userId).first(),
    env.DB.prepare('SELECT local_id AS id, split, created_at AS createdAt, ended_at AS endedAt FROM workouts WHERE user_id = ? ORDER BY created_at').bind(userId).all(),
    env.DB.prepare('SELECT workout_local_id AS workoutId, exercise_id AS exerciseId, set_number AS setNumber, weight, reps, completed_at AS completedAt FROM workout_sets WHERE user_id = ? ORDER BY completed_at').bind(userId).all(),
    env.DB.prepare('SELECT workout_local_id AS workoutId, exercise_id AS exerciseId, set_number AS setNumber, muscle FROM set_muscles WHERE user_id = ?').bind(userId).all(),
    env.DB.prepare('SELECT workout_local_id AS workoutId, muscle, exhaustion, created_at AS createdAt FROM workout_muscle_ratings WHERE user_id = ?').bind(userId).all(),
    env.DB.prepare('SELECT workout_local_id AS workoutId, exercise_id AS exerciseId, action, related_exercise_id AS relatedExerciseId, created_at AS createdAt FROM recommendation_feedback WHERE user_id = ? ORDER BY created_at').bind(userId).all(),
    env.DB.prepare('SELECT friend_id AS friendId, created_at AS createdAt FROM friendships WHERE user_id = ? ORDER BY created_at').bind(userId).all(),
  ]);
  return json({ exportedAt: new Date().toISOString(), profile: profileRow, workouts: workouts.results, sets: sets.results, setMuscles: muscles.results, muscleRatings: ratings.results, recommendationFeedback: feedback.results, friendConnections: connections.results });
}

export default {
  async fetch(request, env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' } });
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const response = publicPage(url.pathname, env);
      if (response) return response;
    }
    if (request.method === 'POST' && url.pathname === '/v1/deletion-requests') return requestAccountDeletion(request, env);
    // The old anonymous-session endpoint is intentionally removed. It could
    // create identities unrelated to Clerk and break cross-device ownership.
    const user = await authenticate(request, env);
    if (!user) return json({ error: 'Unauthorized.' }, 401);
    // This route intentionally precedes ensureUser: a retry after a partial
    // client failure must not recreate the row it is trying to remove.
    if (request.method === 'DELETE' && url.pathname === '/v1/account') return deleteAccount(env, user.id);
    try { await ensureUser(env, user); }
    catch { return json({ error: 'Could not establish account.' }, 500); }
    if (request.method === 'POST' && url.pathname === '/v1/sync') return pushSyncChunk(request, env, user.id);
    if (request.method === 'GET' && url.pathname === '/v1/sync') return pullSyncChanges(env, user.id, url);
    if (request.method === 'GET' && url.pathname === '/v1/recommendations') return json({ recommendations: await recommendations(env, user.id) });
    if (request.method === 'GET' && url.pathname === '/v1/friends') return json({ friends: await friends(env, user.id) });
    if (request.method === 'GET' && url.pathname === '/v1/friends/prs') return json({ prs: await friendPersonalRecords(env, user.id) });
    if (request.method === 'GET' && url.pathname === '/v1/friends/code') return json({ code: await codeFor(env, user.id) });
    if (request.method === 'POST' && url.pathname === '/v1/friends') return addFriend(request, env, user.id);
    if (request.method === 'GET' && url.pathname === '/v1/profile') return json({ profile: await profile(env, user.id) });
    if (request.method === 'PATCH' && url.pathname === '/v1/profile') return updateProfile(request, env, user.id);
    if (request.method === 'GET' && url.pathname === '/v1/export') return exportAccount(env, user.id);
    if (request.method === 'POST' && url.pathname === '/v1/onboarding') return saveOnboarding(request, env, user.id);
    return json({ error: 'Not found.' }, 404);
  },
} satisfies ExportedHandler<Env>;

// Kept as a named export solely for the dependency-free worker regression.
export {
  pullSyncChanges as __testPullSyncChanges,
  pushSyncChunk as __testPushSyncChunk,
  deleteAccount as __testDeleteAccount,
  updateProfile as __testUpdateProfile,
  validChunk as __testValidChunk,
  validOnboarding as __testValidOnboarding,
  validPayload as __testValidPayload,
};
