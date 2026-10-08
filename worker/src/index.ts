import { createAuth, sendEmail, type AuthEnv } from './auth';
import { emailLogoPngBase64 } from './email-logo';
import { wordmark } from './wordmark';

const emailLogoPng = Uint8Array.from(atob(emailLogoPngBase64), (character) => character.charCodeAt(0));

export interface Env extends AuthEnv {
  DB: D1Database;
  DELETION_RATE_LIMITER: RateLimit;
  SYNC_RATE_LIMITER: RateLimit;
  EXPENSIVE_RATE_LIMITER: RateLimit;
  /** Address shown on the public support and privacy pages. */
  SUPPORT_EMAIL: string;
}

type SyncSet = { exerciseId: string; workoutId: string; setNumber: number; weight: number; reps: number; completedAt: number; muscles: string[]; updatedAt?: number };
type SyncWorkout = { id: string; split: string; createdAt: number; endedAt: number | null; updatedAt?: number };
type SyncSplit = { id: string; name: string; muscles: string[]; archived?: boolean; updatedAt?: number };
type SyncRating = { workoutId: string; muscle: string; exhaustion: number; createdAt: number; updatedAt?: number };
type FeedbackAction = 'accepted' | 'completed' | 'impression' | 'replaced' | 'removed' | 'skipped' | 'manual';
type SyncFeedback = { workoutId: string; exerciseId: string; action: FeedbackAction; relatedExerciseId?: string | null; rank?: number | null; createdAt: number; updatedAt?: number };
type Tombstone = { entity: 'workout' | 'set' | 'rating' | 'split'; key: string; deletedAt: number };
type SyncPayload = { workouts: SyncWorkout[]; sets: SyncSet[]; muscleRatings: SyncRating[]; splits?: SyncSplit[]; recommendationFeedback?: SyncFeedback[]; tombstones?: Tombstone[] };
type SyncEntity = 'workout' | 'set' | 'rating' | 'feedback' | 'split';
type SyncMutation = { entity: SyncEntity; key: string; operation: 'upsert' | 'delete'; baseRevision: number; record?: Record<string, unknown> };
type SyncChunk = { batchId: string; changes: SyncMutation[] };
type AuthenticatedUser = { id: string; displayName: string; imageUrl: string | null };
type PreferenceGoal = 'Build muscle' | 'Get stronger' | 'Lose fat' | 'Feel healthier';
type Experience = 'new' | 'some' | 'experienced';
type TrainingLocation = 'gym' | 'home' | 'both';
type RecommendationPreferences = { goals: PreferenceGoal[] | null; weightLb: number | null; heightInches: number | null; experience: Experience | null; favoriteExerciseIds: string[] | null; routineExerciseIdsBySplit: Record<string, string[]> | null; trainingLocation: TrainingLocation | null; trainingDays: number | null; gymId: string | null; availableEquipment: string[] | null; sessionMinutes: number | null; optInSimilarUsers: boolean; useCustomSplits: boolean | null };
type UserProfile = { userId: string; displayName: string; hasChosenDisplayName: boolean; imageUrl: string | null; recommendationPreferences: RecommendationPreferences };
type ProfileRow = Omit<UserProfile, 'recommendationPreferences' | 'hasChosenDisplayName'> & { hasChosenDisplayName: number; goals: string | null; weightLb: number | null; heightInches: number | null; experience: Experience | null; favoriteExerciseIds: string | null; routineExerciseIdsBySplit: string | null; trainingLocation: TrainingLocation | null; trainingDays: number | null; gymId: string | null; availableEquipment: string | null; sessionMinutes: number | null; optInSimilarUsers: number; useCustomSplits: number | null };
type Onboarding = { displayName?: string; goals: string[]; weightLb?: number; heightInches?: number; experience: 'new' | 'some' | 'experienced'; favoriteExerciseIds?: string[]; trainingLocation?: 'gym' | 'home' | 'both'; trainingDays: number };

const json = (data: unknown, status = 200) => Response.json(data, { status });
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const maxTimestamp = 4_102_444_800; // 2100-01-01; protects D1 from nonsense clocks.
const splitKey = (key: string) => key.split('\u001f');
const setKey = (set: Pick<SyncSet, 'workoutId' | 'exerciseId' | 'setNumber'>) => `${set.workoutId}\u001f${set.exerciseId}\u001f${set.setNumber}`;
const ratingKey = (rating: Pick<SyncRating, 'workoutId' | 'muscle'>) => `${rating.workoutId}\u001f${rating.muscle}`;
const feedbackKey = (feedback: Pick<SyncFeedback, 'workoutId' | 'exerciseId' | 'action'>) => `${feedback.workoutId}\u001f${feedback.exerciseId}\u001f${feedback.action}`;
const customSplitId = (id: string) => /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const splitMuscles = new Set(['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps']);
const maxSyncChunk = 3; // Three eight-muscle sets use 41 batch statements (43 for the request with user setup).
const maxRequestBodyBytes = 64 * 1024;
const deletionVerificationSeconds = 24 * 60 * 60;
const deletionRetentionSeconds = 30 * 24 * 60 * 60;
const supportEmail = (env: Env) => env.SUPPORT_EMAIL.trim();

const page = (title: string, body: string) => {
  const nonce = crypto.randomUUID();
  const content = body.replaceAll('<script>', `<script nonce="${nonce}">`);
  const tokens = ':root{color-scheme:light dark;--bg:#F9F9F7;--surface:#EDEEE9;--surface-strong:#E3E5DF;--text:#11120F;--muted:#72776D;--subtle:#858980;--accent:#FFCC4A;--accent-text:#17180F;--danger:#E5484D}@media(prefers-color-scheme:dark){:root{--bg:#151612;--surface:#252720;--surface-strong:#34372E;--text:#F7F8F2;--muted:#A9AEA2;--subtle:#747B70}}';
  const layout = "*{box-sizing:border-box}body{font:16px/1.55 Spline Sans,Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:720px;margin:auto;padding:40px 20px;color:var(--text);background:var(--bg);-webkit-font-smoothing:antialiased}h1{font-size:clamp(2rem,7vw,2.75rem);line-height:1.02;letter-spacing:-.035em;font-weight:900}h2{margin-top:2rem;letter-spacing:-.02em;font-weight:900}p{color:var(--muted);font-weight:600}strong{color:var(--text)}a{color:var(--text);font-weight:800;text-decoration:underline;text-decoration-color:var(--accent);text-decoration-thickness:2px;text-underline-offset:3px}nav{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-bottom:40px;font-size:14px;font-weight:800}nav .brand{display:flex;margin-right:auto;color:var(--text);text-decoration:none}nav a{color:var(--muted);text-decoration:none}nav a:hover{color:var(--text)}label{display:block;margin:18px 0 6px;color:var(--muted);font-size:13px;font-weight:800}input{width:100%;height:56px;padding:0 18px;border:1.5px solid var(--surface-strong);border-radius:16px;background:var(--surface);color:var(--text);font:inherit;font-size:17px;font-weight:700}input::placeholder{color:var(--subtle)}label input[type=checkbox]{width:auto;height:auto;margin-right:8px}button{margin-top:20px;min-height:52px;padding:0 24px;border:0;border-radius:16px;background:var(--accent);color:var(--accent-text);font:inherit;font-size:16px;font-weight:900;cursor:pointer}button:disabled{cursor:default;opacity:.6}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.note{color:var(--muted)}.error{color:var(--danger);font-weight:700}";
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Lift</title><style nonce="${nonce}">${tokens}${layout}</style></head><body><nav><a class="brand" href="/" aria-label="Lift home">${wordmark}</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a><a href="/delete-account">Delete account</a></nav>${content}</body></html>`, { headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
    'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  } });
};

const noStorePage = (title: string, body: string) => {
  const response = page(title, body);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status: response.status, headers });
};

function passwordResetPage() {
  return noStorePage('Reset password', `<h1>Reset your password</h1><p>Choose a new password here, or open the link in Lift on your phone.</p><p><a id="open-app" href="#">Open in Lift</a></p><form id="reset"><label for="password">New password</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="12" required><button type="submit">Save password</button><p id="result" role="status"></p></form><script>const q=new URLSearchParams(location.search),token=q.get('token'),form=document.querySelector('#reset'),result=document.querySelector('#result'),open=document.querySelector('#open-app');if(!token||q.has('error')){form.remove();open.remove();result.textContent='This reset link is invalid or expired. Request another one in Lift.';document.body.append(result)}else{open.href='lift:///reset-password?token='+encodeURIComponent(token);form.addEventListener('submit',async(e)=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;result.textContent='Saving…';try{const response=await fetch('/api/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newPassword:document.querySelector('#password').value,token})});if(!response.ok){const data=await response.json();throw Error(data.message||'Could not reset password. Request another link if this one expired.')}history.replaceState(null,'','/reset-password');form.remove();open.remove();result.textContent='Password saved. Return to Lift and sign in with your new password.';document.body.append(result)}catch(error){result.textContent=error.message;result.className='error'}finally{button.disabled=false}})}</script>`);
}

function publicPage(pathname: string, env: Env) {
  const email = supportEmail(env);
  if (pathname === '/email-verified') return noStorePage('Email verification', '<h1>Email verified</h1><p>Your Lift email address is verified. You can return to the app.</p><p><a href="lift:///auth/verified">Open Lift</a></p>');
  if (pathname === '/privacy') return page('Privacy policy', `<h1>Privacy policy</h1><p class="note">Effective September 23, 2026</p><h2>Data Lift handles</h2><p>Lift stores account and profile information, password hashes, verification and MFA records, workout history, recommendation preferences and feedback, and friend connections.</p><h2>Use and sharing</h2><p>We use this data to provide authentication, sync, progress, recommendations, friend features, security, and support. Cloudflare hosts account and synchronized app data, and Resend delivers transactional account email. We do not sell personal data.</p><h2>Export and retention</h2><p>You can export or delete your Lift data from Profile. In-app deletion removes the identity and synchronized app data. Limited security records and encrypted backups may remain for up to 30 additional days unless law requires longer retention.</p><h2>Your choices</h2><p>Similar-user comparisons are off by default. Contact <a href="mailto:${email}">${email}</a> for access, correction, privacy, or support requests.</p><h2>Fitness disclaimer</h2><p>Lift provides general fitness tracking and suggestions, not medical advice, diagnosis, or treatment.</p>`);
  if (pathname === '/terms') return page('Terms', `<h1>Terms of use</h1><p class="note">Effective September 22, 2026</p><p>Lift is a personal fitness tracking tool. You are responsible for your account, the accuracy of information you enter, and exercising within your abilities. Do not misuse the service, attempt unauthorized access, or use it to harm others.</p><h2>No medical advice</h2><p>Lift's tracking, comparisons, and recommendations are informational fitness features only. They are not medical advice, diagnosis, treatment, or a substitute for a qualified professional. Stop activity and seek care for pain or concerning symptoms.</p><h2>Your content and availability</h2><p>You keep ownership of data you enter and allow Lift to process it to operate the service. Features may change, and the service is provided without a guarantee that it will always be available or error-free. You can export or delete your data from Profile.</p><h2>Contact</h2><p>Questions: <a href="mailto:${email}">${email}</a>.</p>`);
  if (pathname === '/support') return page('Support', `<h1>Lift support</h1><p>For account, privacy, export, or technical help, email <a href="mailto:${email}">${email}</a>.</p><p>Include the email address on your Lift account, but never send your password or verification codes.</p><p>You can also <a href="/delete-account">request account deletion</a>.</p>`);
  if (pathname === '/delete-account') return page('Delete account', `<h1>Delete your Lift account</h1><p>The fastest option is <strong>Lift → Settings → Profile → Delete account</strong>. It deletes your identity, profile, workouts, recommendation data, friend connections, and local account cache.</p><p>If you cannot access the app, submit this request. We will verify ownership using the account email and complete deletion within 30 days.</p><form id="request"><label for="email">Lift account email</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254"><label><input name="confirm" type="checkbox" required> I request permanent deletion of my Lift account and data.</label><button type="submit">Request deletion</button><p id="result" role="status"></p></form><script>document.querySelector('#request').addEventListener('submit',async(e)=>{e.preventDefault();const f=e.currentTarget,r=document.querySelector('#result');r.textContent='Submitting…';try{const x=await fetch('/v1/deletion-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value,confirm:f.confirm.checked})}),j=await x.json();if(!x.ok)throw Error(j.error||'Request failed.');r.textContent='Request received. Reference: '+j.requestId;f.reset()}catch(x){r.textContent=x.message;r.className='error'}})</script><p>Need help? <a href="mailto:${email}">${email}</a>.</p>`);
  return null;
}

function deletionVerificationPage(url: URL) {
  const token = url.searchParams.get('token') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) return noStorePage('Invalid deletion link', '<h1>Invalid deletion link</h1><p>This verification link is invalid. Submit a new deletion request.</p>');
  return noStorePage('Verify account deletion', `<h1>Verify account deletion</h1><p>Confirm that you want Lift to permanently delete the account associated with this email address.</p><form method="post" action="/v1/deletion-requests/verify"><input type="hidden" name="token" value="${token}"><button type="submit">Verify deletion request</button></form>`);
}

async function ensureUser(env: Env, user: AuthenticatedUser) {
  const stamp = now();
  // `id` is intentionally the Better Auth user ID, keeping foreign keys, friend
  // relationships, and authorization anchored to one immutable identity.
  await env.DB.prepare(`
    INSERT INTO users (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING
  `).bind(user.id, stamp).run();
  await env.DB.prepare(`
    INSERT INTO user_info (user_id, auth_user_id, display_name, image_url, created_at, updated_at)
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
    || (tombstone.entity === 'rating' && pieces.length === 2 && isString(pieces[0]) && isString(pieces[1], 80))
    || (tombstone.entity === 'split' && customSplitId(tombstone.key));
}

function validPayload(value: unknown): value is SyncPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SyncPayload>;
  if (!Array.isArray(payload.workouts) || !Array.isArray(payload.sets) || !Array.isArray(payload.muscleRatings) || (payload.splits !== undefined && !Array.isArray(payload.splits)) || (payload.recommendationFeedback !== undefined && !Array.isArray(payload.recommendationFeedback)) || (payload.tombstones !== undefined && !Array.isArray(payload.tombstones))) return false;
  if (payload.workouts.length > 2_000 || payload.sets.length > 10_000 || payload.muscleRatings.length > 10_000 || (payload.splits?.length ?? 0) > 100 || (payload.recommendationFeedback?.length ?? 0) > 10_000 || (payload.tombstones?.length ?? 0) > 10_000) return false;
  if (!payload.workouts.every((workout) => workout && typeof workout === 'object' && isString(workout.id) && (['push', 'pull', 'legs'].includes(workout.split) || customSplitId(workout.split)) && isTimestamp(workout.createdAt) && (workout.endedAt === null || isTimestamp(workout.endedAt)) && (workout.endedAt === null || workout.endedAt >= workout.createdAt) && isVersion(workout.updatedAt, Math.max(workout.createdAt, workout.endedAt ?? 0)))) return false;
  if (!(payload.splits ?? []).every((split) => split && typeof split === 'object' && customSplitId(split.id) && isString(split.name, 40) && Array.isArray(split.muscles) && split.muscles.length > 0 && split.muscles.length <= 12 && split.muscles.every((muscle) => splitMuscles.has(muscle)) && new Set(split.muscles).size === split.muscles.length && (split.archived === undefined || typeof split.archived === 'boolean') && isVersion(split.updatedAt, 0))) return false;
  if (new Set((payload.splits ?? []).map((split) => split.id)).size !== (payload.splits ?? []).length) return false;
  const workoutIds = new Set(payload.workouts.map((workout) => workout.id));
  if (workoutIds.size !== payload.workouts.length) return false;
  const seenSets = new Set<string>();
  if (!payload.sets.every((set) => {
    const key = set && typeof set === 'object' ? setKey(set) : '';
    const okay = !!set && typeof set === 'object' && workoutIds.has(set.workoutId) && isString(set.workoutId) && isString(set.exerciseId) && Number.isInteger(set.setNumber) && set.setNumber > 0 && set.setNumber <= 100 && typeof set.weight === 'number' && Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 10_000 && Math.abs(set.weight * 100 - Math.round(set.weight * 100)) < 1e-8 && Number.isInteger(set.reps) && set.reps > 0 && set.reps <= 10_000 && isTimestamp(set.completedAt) && Array.isArray(set.muscles) && set.muscles.length <= 8 && set.muscles.every((muscle) => isString(muscle, 80)) && isVersion(set.updatedAt, set.completedAt) && !seenSets.has(key);
    seenSets.add(key); return okay;
  })) return false;
  const seenRatings = new Set<string>();
  if (!payload.muscleRatings.every((rating) => {
    const key = rating && typeof rating === 'object' ? ratingKey(rating) : '';
    const okay = !!rating && typeof rating === 'object' && workoutIds.has(rating.workoutId) && isString(rating.workoutId) && isString(rating.muscle, 80) && Number.isInteger(rating.exhaustion) && rating.exhaustion >= 0 && rating.exhaustion <= 10 && isTimestamp(rating.createdAt) && isVersion(rating.updatedAt, rating.createdAt) && !seenRatings.has(key);
    seenRatings.add(key); return okay;
  })) return false;
  const feedbackActions = new Set<FeedbackAction>(['accepted', 'completed', 'impression', 'replaced', 'removed', 'skipped', 'manual']);
  const seenFeedback = new Set<string>();
  if (!(payload.recommendationFeedback ?? []).every((item) => {
    const key = item && typeof item === 'object' ? `${item.workoutId}\u001f${item.exerciseId}\u001f${item.action}` : '';
    const okay = !!item && typeof item === 'object' && workoutIds.has(item.workoutId) && isString(item.exerciseId) && feedbackActions.has(item.action)
      && (item.relatedExerciseId == null || isString(item.relatedExerciseId)) && isTimestamp(item.createdAt)
      && (item.rank == null || (Number.isInteger(item.rank) && item.rank >= 1 && item.rank <= 100))
      && (item.action !== 'impression' || item.rank != null)
      && isVersion(item.updatedAt, item.createdAt) && !seenFeedback.has(key);
    seenFeedback.add(key); return okay;
  })) return false;
  return (payload.tombstones ?? []).every((tombstone) => tombstone && typeof tombstone === 'object' && ['workout', 'set', 'rating', 'split'].includes(tombstone.entity) && isString(tombstone.key, 500) && !tombstone.key.includes('\u0000') && isTimestamp(tombstone.deletedAt) && validTombstoneKey(tombstone));
}

function validMutation(value: unknown): value is SyncMutation {
  if (!value || typeof value !== 'object') return false;
  const mutation = value as Partial<SyncMutation>;
  if (!['workout', 'set', 'rating', 'feedback', 'split'].includes(mutation.entity ?? '') || !isString(mutation.key, 500)
    || mutation.key!.includes('\u0000') || !['upsert', 'delete'].includes(mutation.operation ?? '')
    || !Number.isInteger(mutation.baseRevision) || mutation.baseRevision! < 0) return false;
  if (mutation.operation === 'delete') return mutation.entity !== 'feedback' && mutation.record === undefined
    && validTombstoneKey({ entity: mutation.entity, key: mutation.key!, deletedAt: 0 } as Tombstone);
  const record = mutation.record as Record<string, unknown> | undefined;
  if (!record) return false;
  if (mutation.entity === 'workout') return validPayload({ workouts: [record], sets: [], muscleRatings: [], tombstones: [] }) && mutation.key === record.id;
  if (mutation.entity === 'split') return validPayload({ workouts: [], sets: [], muscleRatings: [], splits: [record as unknown as SyncSplit] }) && mutation.key === record.id;
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
  // Only finished workouts count; an active session is not comparable history.
  const ownTotal = (await env.DB.prepare(`SELECT COUNT(*) AS total FROM workout_sets ws WHERE ws.user_id = ? AND ws.completed_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM workouts w WHERE w.user_id = ws.user_id AND w.local_id = ws.workout_local_id AND w.ended_at IS NOT NULL)`).bind(userId, since, timestamp).first<{ total: number }>())?.total ?? 0;
  const rows = await env.DB.prepare(`
    WITH muscles(muscle) AS (VALUES
      ('abdominals'), ('abductors'), ('adductors'), ('biceps'), ('calves'), ('chest'),
      ('forearms'), ('glutes'), ('hamstrings'), ('lats'), ('lower back'), ('middle back'),
      ('neck'), ('obliques'), ('quadriceps'), ('shoulders'), ('traps'), ('triceps')
    ), user_totals AS (
      SELECT user_id, COUNT(*) AS set_count FROM workout_sets ws WHERE completed_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM workouts w WHERE w.user_id = ws.user_id AND w.local_id = ws.workout_local_id AND w.ended_at IS NOT NULL) GROUP BY user_id
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
      LEFT JOIN workout_sets ws ON ws.user_id = cohort.user_id AND ws.completed_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM workouts w WHERE w.user_id = ws.user_id AND w.local_id = ws.workout_local_id AND w.ended_at IS NOT NULL)
      LEFT JOIN set_muscles sm ON sm.user_id = ws.user_id AND sm.workout_local_id = ws.workout_local_id AND sm.exercise_id = ws.exercise_id AND sm.set_number = ws.set_number AND sm.muscle = muscles.muscle
      GROUP BY cohort.user_id, muscles.muscle
    ), mine AS (
      SELECT muscles.muscle, COUNT(sm.muscle) AS sets
      FROM muscles
      LEFT JOIN workout_sets ws ON ws.user_id = ? AND ws.completed_at BETWEEN ? AND ? AND EXISTS (SELECT 1 FROM workouts w WHERE w.user_id = ws.user_id AND w.local_id = ws.workout_local_id AND w.ended_at IS NOT NULL)
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
        : change.entity === 'rating'
          ? `(SELECT sync_revision FROM workout_muscle_ratings WHERE user_id = ? AND workout_local_id = ? AND muscle = ?)`
          : `(SELECT sync_revision FROM user_splits WHERE user_id = ? AND id = ?)`;
    const liveArgs = change.entity === 'workout' ? [userId, pieces[0]]
      : change.entity === 'set' ? [userId, pieces[0], pieces[1], Number(pieces[2])]
        : change.entity === 'rating' ? [userId, pieces[0], pieces[1]] : [userId, change.key];
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
    if (change.entity === 'split') statements.push(env.DB.prepare(`DELETE FROM user_splits WHERE user_id = ? AND id = ? AND sync_revision <= ? AND ${accepted}`).bind(userId, change.key, change.baseRevision, ...acceptedArgs));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
      SELECT ?, ${batchRevision}, ?, ?, 1, NULL WHERE ${accepted}`).bind(userId, ...revisionArgs, change.entity, change.key, ...acceptedArgs));
    return statements;
  }

  const record = change.record!;
  if (change.entity === 'split') {
    const split = record as unknown as SyncSplit;
    statements.push(env.DB.prepare(`INSERT INTO user_splits (user_id, id, name, muscles, archived, updated_at, sync_revision)
      SELECT ?, ?, ?, ?, ?, ?, ${batchRevision} WHERE ${batchMatches}
        AND (MAX(COALESCE((SELECT sync_revision FROM user_splits WHERE user_id = ? AND id = ?), 0), COALESCE((SELECT sync_revision FROM sync_tombstones WHERE user_id = ? AND entity = 'split' AND record_key = ?), 0)) = ?
          OR COALESCE((SELECT sync_revision FROM user_splits WHERE user_id = ? AND id = ?), 0) = ${batchRevision})
      ON CONFLICT(user_id, id) DO UPDATE SET name = excluded.name, muscles = excluded.muscles, archived = excluded.archived, updated_at = excluded.updated_at, sync_revision = excluded.sync_revision
    `).bind(userId, split.id, split.name, JSON.stringify(split.muscles), split.archived ? 1 : 0, now(), ...revisionArgs, ...gateArgs, userId, change.key, userId, change.key, change.baseRevision, userId, change.key, ...revisionArgs));
    statements.push(env.DB.prepare(`DELETE FROM sync_tombstones WHERE user_id = ? AND entity = 'split' AND record_key = ? AND sync_revision <= ? AND EXISTS (SELECT 1 FROM user_splits WHERE user_id = ? AND id = ? AND sync_revision = ${batchRevision})`).bind(userId, change.key, change.baseRevision, userId, change.key, ...revisionArgs));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
      SELECT ?, ${batchRevision}, 'split', ?, 0, ? WHERE EXISTS (SELECT 1 FROM user_splits WHERE user_id = ? AND id = ? AND sync_revision = ${batchRevision})`).bind(userId, ...revisionArgs, change.key, payload, userId, change.key, ...revisionArgs));
    return statements;
  }
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
    statements.push(env.DB.prepare(`INSERT INTO recommendation_feedback (user_id, workout_local_id, exercise_id, action, related_exercise_id, rank, created_at, updated_at, sync_revision)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ${batchRevision} WHERE ${batchMatches} AND EXISTS (SELECT 1 FROM workouts WHERE user_id = ? AND local_id = ?)
        AND (COALESCE((SELECT sync_revision FROM recommendation_feedback WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND action = ?), 0) = ?
          OR COALESCE((SELECT sync_revision FROM recommendation_feedback WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND action = ?), 0) = ${batchRevision})
      ON CONFLICT(user_id, workout_local_id, exercise_id, action) DO UPDATE SET related_exercise_id = excluded.related_exercise_id, rank = excluded.rank, created_at = excluded.created_at, updated_at = excluded.updated_at, sync_revision = excluded.sync_revision
    `).bind(userId, feedback.workoutId, feedback.exerciseId, feedback.action, feedback.relatedExerciseId ?? null, feedback.rank ?? null, feedback.createdAt, now(), ...revisionArgs, ...gateArgs, userId, feedback.workoutId, userId, feedback.workoutId, feedback.exerciseId, feedback.action, change.baseRevision, userId, feedback.workoutId, feedback.exerciseId, feedback.action, ...revisionArgs));
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO sync_changes (user_id, revision, entity, record_key, deleted, payload)
      SELECT ?, ${batchRevision}, 'feedback', ?, 0, ? WHERE EXISTS (SELECT 1 FROM recommendation_feedback WHERE user_id = ? AND workout_local_id = ? AND exercise_id = ? AND action = ? AND sync_revision = ${batchRevision})`).bind(userId, ...revisionArgs, change.key, payload, userId, feedback.workoutId, feedback.exerciseId, feedback.action, ...revisionArgs));
  }
  return statements;
}

async function pushSyncChunk(request: Request, env: Env, userId: string) {
  const body: unknown = await request.json().catch(() => null);
  if (!validChunk(body)) {
    const changes = (body as { changes?: unknown[] } | null)?.changes;
    const invalidChanges = Array.isArray(changes) ? changes.filter((change) => !validMutation(change)).map((change) => ({ entity: (change as Partial<SyncMutation> | null)?.entity, key: (change as Partial<SyncMutation> | null)?.key })) : undefined;
    return json({ error: `A sync batch must contain 1-${maxSyncChunk} valid changes.`, invalidChanges }, 400);
  }
  const hash = await sha256(JSON.stringify(body.changes));
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('INSERT OR IGNORE INTO sync_accounts (user_id, revision) VALUES (?, 0)').bind(userId),
    env.DB.prepare('UPDATE sync_accounts SET revision = revision + 1 WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM sync_batches WHERE user_id = ? AND batch_id = ?)').bind(userId, userId, body.batchId),
    env.DB.prepare('INSERT OR IGNORE INTO sync_batches (user_id, batch_id, request_hash, revision) SELECT ?, ?, ?, revision FROM sync_accounts WHERE user_id = ?').bind(userId, body.batchId, hash, userId),
  ];
  for (const change of body.changes) statements.push(...mutationStatements(env, userId, body.batchId, hash, change));
  statements.push(env.DB.prepare('SELECT revision, request_hash AS requestHash FROM sync_batches WHERE user_id = ? AND batch_id = ?').bind(userId, body.batchId));
  // The durable change log reconstructs the same receipt after a lost response,
  // even if another device has subsequently changed the accepted record.
  statements.push(env.DB.prepare('SELECT entity, record_key AS key FROM sync_changes WHERE user_id = ? AND revision = (SELECT revision FROM sync_batches WHERE user_id = ? AND batch_id = ?)').bind(userId, userId, body.batchId));
  const results = await env.DB.batch<{ revision?: number; requestHash?: string; entity?: SyncEntity; key?: string }>(statements);
  const receipt = results.at(-2)?.results?.[0];
  if (!receipt || receipt.requestHash !== hash) return json({ error: 'Idempotency key was already used for another batch.' }, 409);
  const accepted = new Set(results.at(-1)?.results?.map((change) => `${change.entity}\u0000${change.key}`));
  const mutationResults = body.changes.map((change) => ({ entity: change.entity, key: change.key,
    status: accepted.has(`${change.entity}\u0000${change.key}`) ? 'accepted' : 'conflict',
    ...(accepted.has(`${change.entity}\u0000${change.key}`) ? { revision: receipt.revision } : {}),
  }));
  return json({ batchId: body.batchId, revision: receipt.revision, results: mutationResults });
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
  if (!await hasChosenDisplayName(env, userId)) return null;
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

async function hasChosenDisplayName(env: Env, userId: string) {
  const row = await env.DB.prepare('SELECT has_chosen_display_name AS chosen FROM user_info WHERE user_id = ?').bind(userId).first<{ chosen: number }>();
  return row?.chosen === 1;
}

async function friends(env: Env, userId: string) {
  const [rows, blocks] = await Promise.all([
    env.DB.prepare(`SELECT u.id, i.display_name AS displayName, i.image_url AS imageUrl FROM friendships f JOIN users u ON u.id = f.friend_id JOIN user_info i ON i.user_id = u.id WHERE f.user_id = ? ORDER BY f.created_at DESC`).bind(userId).all<{ id: string; displayName: string; imageUrl: string | null }>(),
    env.DB.prepare(`SELECT u.id, i.display_name AS displayName, i.image_url AS imageUrl FROM friend_blocks b JOIN users u ON u.id = b.blocked_id JOIN user_info i ON i.user_id = u.id WHERE b.blocker_id = ? ORDER BY b.created_at DESC`).bind(userId).all<{ id: string; displayName: string; imageUrl: string | null }>(),
  ]);
  return { count: rows.results.length, users: rows.results, blocked: blocks.results };
}

async function profile(env: Env, userId: string) {
  const row = await env.DB.prepare(`SELECT auth_user_id AS userId, display_name AS displayName, has_chosen_display_name AS hasChosenDisplayName, image_url AS imageUrl,
    goals, weight_lb AS weightLb, height_inches AS heightInches, experience, favorite_exercise_ids AS favoriteExerciseIds, routine_exercise_ids_by_split AS routineExerciseIdsBySplit, training_location AS trainingLocation,
    training_days AS trainingDays, gym_id AS gymId, available_equipment AS availableEquipment,
    session_minutes AS sessionMinutes, similar_users_opt_in AS optInSimilarUsers, use_custom_splits AS useCustomSplits
    FROM user_info WHERE user_id = ?`).bind(userId).first<ProfileRow>();
  if (!row) throw new Error('Profile not found.');
  const { goals, favoriteExerciseIds, routineExerciseIdsBySplit, availableEquipment, optInSimilarUsers } = row;
  return { userId: row.userId, displayName: row.displayName, hasChosenDisplayName: row.hasChosenDisplayName === 1, imageUrl: row.imageUrl, recommendationPreferences: {
    goals: parseStringArray(goals), weightLb: row.weightLb, heightInches: row.heightInches, experience: row.experience, favoriteExerciseIds: parseStringArray(favoriteExerciseIds), routineExerciseIdsBySplit: parseRoutines(routineExerciseIdsBySplit),
    trainingLocation: row.trainingLocation, trainingDays: row.trainingDays, gymId: row.gymId,
    availableEquipment: parseStringArray(availableEquipment), sessionMinutes: row.sessionMinutes, optInSimilarUsers: optInSimilarUsers === 1, useCustomSplits: row.useCustomSplits === null ? null : row.useCustomSplits === 1,
  } };
}

function validRoutines(value: unknown): value is Record<string, string[]> | null | undefined {
  return value === undefined || value === null || (typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length <= 30 && Object.entries(value).every(([split, ids]) =>
      /^(push|pull|legs|custom:[a-zA-Z0-9_-]{1,80})$/.test(split) && Array.isArray(ids)
      && ids.length > 0 && ids.length <= 20 && new Set(ids).size === ids.length && ids.every((id) => isString(id, 80))));
}
function parseRoutines(value: string | null) {
  try { const parsed: unknown = value && JSON.parse(value); return validRoutines(parsed) ? parsed ?? null : null; }
  catch { return null; }
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
  const keys = ['goals', 'weightLb', 'heightInches', 'experience', 'favoriteExerciseIds', 'routineExerciseIdsBySplit', 'trainingLocation', 'trainingDays', 'gymId', 'availableEquipment', 'sessionMinutes', 'optInSimilarUsers', 'useCustomSplits'];
  if (data && Object.keys(data).some((key) => !keys.includes(key))) return json({ error: 'Invalid recommendation preferences.' }, 400);
  const validExperience = data?.experience === undefined || data.experience === null || ['new', 'some', 'experienced'].includes(data.experience as string);
  const validLocation = data?.trainingLocation === undefined || data.trainingLocation === null || ['gym', 'home', 'both'].includes(data.trainingLocation as string);
  const validGym = data?.gymId === undefined || data.gymId === null || isString(data.gymId, 80);
  const validOptIn = data?.optInSimilarUsers === undefined || typeof data.optInSimilarUsers === 'boolean';
  const validCustomSplits = data?.useCustomSplits === undefined || typeof data.useCustomSplits === 'boolean';
  const validPreferences = !data || (optionalStringArray(data.goals, goalValues)
    && optionalNumber(data.weightLb, 50, 1_000)
    && optionalNumber(data.heightInches, 36, 108, true)
    && validRoutines(data.routineExerciseIdsBySplit) && validExperience && optionalStringArray(data.favoriteExerciseIds, undefined, 20) && validLocation
    && optionalNumber(data.trainingDays, 1, 7, true)
    && validGym && optionalStringArray(data.availableEquipment)
    && optionalNumber(data.sessionMinutes, 5, 300, true) && validOptIn && validCustomSplits);
  if (!validPreferences) return json({ error: 'Invalid recommendation preferences.' }, 400);
  const columns: Record<string, string> = { goals: 'goals', weightLb: 'weight_lb', heightInches: 'height_inches', experience: 'experience', favoriteExerciseIds: 'favorite_exercise_ids', routineExerciseIdsBySplit: 'routine_exercise_ids_by_split', trainingLocation: 'training_location', trainingDays: 'training_days', gymId: 'gym_id', availableEquipment: 'available_equipment', sessionMinutes: 'session_minutes', optInSimilarUsers: 'similar_users_opt_in', useCustomSplits: 'use_custom_splits' };
  const assignments: string[] = [];
  const values: unknown[] = [];
  if (displayName !== undefined) { assignments.push('display_name = ?', 'has_chosen_display_name = 1'); values.push(displayName); }
  for (const key of keys) if (data?.[key] !== undefined) {
    assignments.push(`${columns[key]} = ?`);
    const value = data[key];
    values.push(key === 'routineExerciseIdsBySplit' || key === 'goals' || key === 'favoriteExerciseIds' || key === 'availableEquipment' ? value === null ? null : JSON.stringify(value) : key === 'optInSimilarUsers' || key === 'useCustomSplits' ? value ? 1 : 0 : value);
  }
  if (!assignments.length) return json({ error: 'Provide a profile field to update.' }, 400);
  assignments.push('updated_at = ?'); values.push(now(), userId);
  const appProfile = env.DB.prepare(`UPDATE user_info SET ${assignments.join(', ')} WHERE user_id = ?`).bind(...values);
  if (displayName === undefined) await appProfile.run();
  else await env.DB.batch([
    appProfile,
    env.DB.prepare('UPDATE user SET name = ?, updatedAt = ? WHERE id = ?').bind(displayName, Date.now(), userId),
  ]);
  return json({ profile: await profile(env, userId) });
}

function validOnboarding(value: unknown): value is Onboarding {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<Onboarding>;
  const { weightLb, heightInches, trainingDays } = data;
  return (data.displayName === undefined || (typeof data.displayName === 'string' && isString(data.displayName.trim().replace(/\s+/g, ' '), 40)))
    && Array.isArray(data.goals) && data.goals.length > 0 && data.goals.length <= 4 && data.goals.every((goal) => ['Build muscle', 'Get stronger', 'Lose fat', 'Feel healthier'].includes(goal))
    && (weightLb === undefined || (typeof weightLb === 'number' && Number.isFinite(weightLb) && weightLb >= 50 && weightLb <= 1_000))
    && (heightInches === undefined || (typeof heightInches === 'number' && Number.isInteger(heightInches) && heightInches >= 36 && heightInches <= 108))
    && (data.favoriteExerciseIds === undefined || (Array.isArray(data.favoriteExerciseIds) && data.favoriteExerciseIds.length <= 5 && data.favoriteExerciseIds.every((id) => isString(id, 80))))
    && ['new', 'some', 'experienced'].includes(data.experience ?? '') && (data.trainingLocation === undefined || ['gym', 'home', 'both'].includes(data.trainingLocation))
    && typeof trainingDays === 'number' && Number.isInteger(trainingDays) && trainingDays >= 1 && trainingDays <= 7;
}

async function saveOnboarding(request: Request, env: Env, userId: string) {
  const body: unknown = await request.json().catch(() => null);
  if (!validOnboarding(body)) return json({ error: 'Invalid onboarding data.' }, 400);
  await env.DB.prepare('UPDATE user_info SET display_name = COALESCE(?, display_name), has_chosen_display_name = CASE WHEN ? IS NULL THEN has_chosen_display_name ELSE 1 END, goals = ?, weight_lb = ?, height_inches = ?, experience = ?, favorite_exercise_ids = ?, training_location = ?, training_days = ?, onboarded_at = ?, updated_at = ? WHERE user_id = ?').bind(body.displayName?.trim().replace(/\s+/g, ' ') ?? null, body.displayName ?? null, JSON.stringify(body.goals), body.weightLb ?? null, body.heightInches ?? null, body.experience, JSON.stringify(body.favoriteExerciseIds ?? []), body.trainingLocation ?? null, body.trainingDays, now(), now(), userId).run();
  return json({ ok: true }, 201);
}

/** Recent new max-weight sets from friends. Workout details stay private. */
async function friendPersonalRecords(env: Env, userId: string) {
  const rows = await env.DB.prepare(`
    WITH ranked_sets AS (
      SELECT ws.user_id AS friendId, i.display_name AS displayName, i.image_url AS imageUrl,
        ws.workout_local_id AS workoutId, ws.set_number AS setNumber, ws.exercise_id AS exerciseId, ws.weight, ws.reps, ws.completed_at AS completedAt,
        MAX(ws.weight) OVER (
          PARTITION BY ws.user_id, ws.exercise_id
          ORDER BY ws.completed_at, ws.workout_local_id, ws.set_number
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS previousBest
      FROM friendships f
      JOIN user_info i ON i.user_id = f.friend_id
      JOIN workout_sets ws ON ws.user_id = f.friend_id
      WHERE f.user_id = ?
    )
    SELECT friendId AS id, displayName, imageUrl, workoutId, setNumber, exerciseId, weight, reps, completedAt,
      (SELECT COUNT(*) FROM friend_workout_likes l WHERE l.author_id = friendId AND l.workout_local_id = workoutId) AS likeCount,
      (SELECT COUNT(*) FROM friend_workout_comments c WHERE c.author_id = friendId AND c.workout_local_id = workoutId) AS commentCount,
      EXISTS(SELECT 1 FROM friend_workout_likes l WHERE l.author_id = friendId AND l.workout_local_id = workoutId AND l.user_id = ?) AS liked
    FROM ranked_sets WHERE previousBest IS NOT NULL AND weight > previousBest
    ORDER BY completedAt DESC, weight DESC LIMIT 50
  `).bind(userId, userId).all();
  return rows.results.map((row) => ({ ...row, liked: row.liked === 1 }));
}

type FriendWorkout = { id: string; workoutId: string };

function friendWorkout(value: unknown): FriendWorkout | null {
  if (!value || typeof value !== 'object') return null;
  const workout = value as Partial<FriendWorkout>;
  return isString(workout.id, 100) && isString(workout.workoutId, 100) ? workout as FriendWorkout : null;
}

async function visibleFriendWorkout(env: Env, userId: string, workout: FriendWorkout) {
  return env.DB.prepare(`SELECT 1 FROM friendships f JOIN workout_sets ws ON ws.user_id = f.friend_id
    WHERE f.user_id = ? AND f.friend_id = ? AND ws.workout_local_id = ?
    AND EXISTS (SELECT 1 FROM workout_sets earlier WHERE earlier.user_id = ws.user_id AND earlier.exercise_id = ws.exercise_id
      AND (earlier.completed_at < ws.completed_at OR (earlier.completed_at = ws.completed_at AND (earlier.workout_local_id < ws.workout_local_id OR (earlier.workout_local_id = ws.workout_local_id AND earlier.set_number < ws.set_number)))))
    AND ws.weight > (SELECT MAX(earlier.weight) FROM workout_sets earlier WHERE earlier.user_id = ws.user_id AND earlier.exercise_id = ws.exercise_id
      AND (earlier.completed_at < ws.completed_at OR (earlier.completed_at = ws.completed_at AND (earlier.workout_local_id < ws.workout_local_id OR (earlier.workout_local_id = ws.workout_local_id AND earlier.set_number < ws.set_number)))))
    LIMIT 1`).bind(userId, workout.id, workout.workoutId).first();
}

async function friendActivity(request: Request, env: Env, userId: string, kind: 'likes' | 'comments') {
  const url = new URL(request.url);
  const data = request.method === 'GET' ? Object.fromEntries(url.searchParams) : await request.json().catch(() => null);
  const workout = friendWorkout(data);
  if (!workout) return json({ error: 'Invalid workout.' }, 400);
  if (!await visibleFriendWorkout(env, userId, workout)) return json({ error: 'Workout not found.' }, 404);
  const args = [workout.id, workout.workoutId];
  if (kind === 'likes') {
    if (request.method === 'POST') await env.DB.prepare('INSERT OR IGNORE INTO friend_workout_likes (author_id, workout_local_id, user_id, created_at) VALUES (?, ?, ?, ?)').bind(...args, userId, now()).run();
    else if (request.method === 'DELETE') await env.DB.prepare('DELETE FROM friend_workout_likes WHERE author_id = ? AND workout_local_id = ? AND user_id = ?').bind(...args, userId).run();
    else return json({ error: 'Not found.' }, 404);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM friend_workout_likes WHERE author_id = ? AND workout_local_id = ?').bind(...args).first<{ count: number }>();
    return json({ liked: request.method === 'POST', likeCount: count?.count ?? 0 });
  }
  if (request.method === 'POST') {
    const body = typeof (data as { body?: unknown })?.body === 'string' ? (data as { body: string }).body.trim() : '';
    if (!body || body.length > 280) return json({ error: 'Comment must be 1 to 280 characters.' }, 400);
    await env.DB.prepare('INSERT INTO friend_workout_comments (id, author_id, workout_local_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), ...args, userId, body, now()).run();
  } else if (request.method !== 'GET') return json({ error: 'Not found.' }, 404);
  const comments = await env.DB.prepare(`SELECT c.id, c.body, c.created_at AS createdAt, i.display_name AS displayName, i.image_url AS imageUrl, c.user_id = ? AS mine
    FROM friend_workout_comments c JOIN user_info i ON i.user_id = c.user_id
    WHERE c.author_id = ? AND c.workout_local_id = ? ORDER BY c.created_at ASC, c.id ASC LIMIT 100`).bind(userId, ...args).all();
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM friend_workout_comments WHERE author_id = ? AND workout_local_id = ?').bind(...args).first<{ count: number }>();
  return json({ comments: comments.results.map((comment) => ({ ...comment, mine: comment.mine === 1 })), commentCount: count?.count ?? 0 });
}

async function addFriend(request: Request, env: Env, userId: string) {
  if (!await hasChosenDisplayName(env, userId)) return json({ error: 'Set a display name before adding friends.' }, 409);
  const body = await request.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6}$/.test(code)) return json({ error: 'Enter a six-character friend code.' }, 400);
  const match = await env.DB.prepare('SELECT u.id FROM users u JOIN user_info i ON i.user_id = u.id WHERE u.friend_code = ?').bind(code).first<{ id: string }>();
  if (!match) return json({ error: 'That friend code was not found.' }, 404);
  if (match.id === userId) return json({ error: 'You cannot add your own code.' }, 400);
  const blocked = await env.DB.prepare('SELECT 1 FROM friend_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').bind(userId, match.id, match.id, userId).first();
  if (blocked) return json({ error: 'This connection cannot be added.' }, 409);
  const stamp = now();
  await env.DB.batch([env.DB.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(userId, match.id, stamp), env.DB.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES (?, ?, ?)').bind(match.id, userId, stamp)]);
  return json({ friends: await friends(env, userId) }, 201);
}

async function removeFriend(env: Env, userId: string, friendId: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').bind(userId, friendId),
    env.DB.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').bind(friendId, userId),
  ]);
  return json({ friends: await friends(env, userId) });
}

async function blockFriend(env: Env, userId: string, friendId: string) {
  const connection = await env.DB.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').bind(userId, friendId).first();
  if (!connection) return json({ error: 'Friend not found.' }, 404);
  const stamp = now();
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO friend_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').bind(userId, friendId, stamp),
    env.DB.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').bind(userId, friendId),
    env.DB.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').bind(friendId, userId),
  ]);
  return json({ friends: await friends(env, userId) });
}

async function unblockFriend(env: Env, userId: string, friendId: string) {
  await env.DB.prepare('DELETE FROM friend_blocks WHERE blocker_id = ? AND blocked_id = ?').bind(userId, friendId).run();
  return json({ friends: await friends(env, userId) });
}

const feedbackKinds = ['bug', 'feature', 'other'];

// ponytail: score is aggregated on every read; add a cached score column if the list grows large.
async function listFeedback(env: Env, userId: string | null) {
  const rows = await env.DB.prepare(`SELECT f.id, f.kind, f.body, f.created_at AS createdAt,
    CASE WHEN i.has_chosen_display_name = 1 THEN i.display_name ELSE 'Lifter' END AS author,
    COALESCE(SUM(v.value), 0) AS score, COALESCE(MAX(CASE WHEN v.user_id = ? THEN v.value END), 0) AS myVote
    FROM site_feedback f JOIN user_info i ON i.user_id = f.user_id LEFT JOIN site_feedback_votes v ON v.feedback_id = f.id
    GROUP BY f.id ORDER BY score DESC, f.created_at DESC LIMIT 200`).bind(userId).all();
  return json({ feedback: rows.results });
}

async function createFeedback(request: Request, env: Env, userId: string) {
  const body = await request.json().catch(() => null) as { kind?: unknown; body?: unknown } | null;
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!feedbackKinds.includes(body?.kind as string)) return json({ error: 'Choose bug, feature, or other.' }, 400);
  if (!isString(text, 2000)) return json({ error: 'Feedback must be between 1 and 2000 characters.' }, 400);
  await env.DB.prepare('INSERT INTO site_feedback (id, user_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), userId, body!.kind, text, now()).run();
  return listFeedback(env, userId);
}

async function voteFeedback(request: Request, env: Env, userId: string, feedbackId: string) {
  const body = await request.json().catch(() => null) as { value?: unknown } | null;
  const value = body?.value;
  if (value !== 1 && value !== -1 && value !== 0) return json({ error: 'Vote must be 1, -1, or 0.' }, 400);
  if (!await env.DB.prepare('SELECT 1 FROM site_feedback WHERE id = ?').bind(feedbackId).first()) return json({ error: 'Feedback not found.' }, 404);
  if (value === 0) await env.DB.prepare('DELETE FROM site_feedback_votes WHERE feedback_id = ? AND user_id = ?').bind(feedbackId, userId).run();
  else await env.DB.prepare('INSERT INTO site_feedback_votes (feedback_id, user_id, value) VALUES (?, ?, ?) ON CONFLICT(feedback_id, user_id) DO UPDATE SET value = excluded.value').bind(feedbackId, userId, value).run();
  return listFeedback(env, userId);
}

async function requestAccountDeletion(request: Request, env: Env) {
  const rateLimit = await env.DELETION_RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  if (!rateLimit.success) return json({ error: 'Too many deletion requests. Try again later.' }, 429);
  const body = await request.json().catch(() => null) as { email?: unknown; confirm?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (body?.confirm !== true || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'Enter your account email and confirm deletion.' }, 400);
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const tokenHash = await sha256(token);
  const stamp = now();
  const row = await env.DB.prepare(`INSERT INTO account_deletion_requests
      (id, email, verification_token_hash, verification_expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET verification_token_hash = excluded.verification_token_hash,
      verification_expires_at = excluded.verification_expires_at, updated_at = excluded.updated_at
      WHERE account_deletion_requests.status = 'pending'
    RETURNING id, status`).bind(id, email, tokenHash, stamp + deletionVerificationSeconds, stamp, stamp).first<{ id: string; status: 'pending' | 'verified' }>();
  const active = row ?? await env.DB.prepare("SELECT id, status FROM account_deletion_requests WHERE email = ? AND status IN ('pending', 'verified')").bind(email).first<{ id: string; status: 'pending' | 'verified' }>();
  const requestId = active?.id ?? id;
  await env.DB.prepare(`INSERT OR IGNORE INTO account_deletion_request_events
    (id, request_id, from_status, to_status, actor, reason, created_at) VALUES (?, ?, NULL, 'pending', 'requester', 'request_submitted', ?)`)
    .bind(crypto.randomUUID(), requestId, stamp).run();
  if (active?.status === 'pending') {
    const baseUrl = env.BETTER_AUTH_URL?.trim() || new URL(request.url).origin;
    const verificationUrl = `${baseUrl}/delete-account/verify?token=${encodeURIComponent(token)}`;
    await sendEmail(env, email, 'Verify your Lift account deletion request', 'Confirm ownership of this email address and your request to permanently delete the associated Lift account. This link expires in 24 hours.', { label: 'Verify deletion request', url: verificationUrl });
  }
  return json({ requestId }, 202);
}

async function verifyAccountDeletion(request: Request, env: Env) {
  const contentType = request.headers.get('Content-Type') ?? '';
  const body = contentType.includes('application/json')
    ? await request.json().catch(() => null) as { token?: unknown } | null
    : Object.fromEntries(new URLSearchParams(await request.text()));
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!/^[0-9a-f-]{36}$/i.test(token)) return noStorePage('Invalid deletion link', '<h1>Invalid deletion link</h1><p>This verification link is invalid or expired. Submit a new deletion request.</p>');
  const stamp = now();
  const row = await env.DB.prepare(`SELECT id FROM account_deletion_requests
    WHERE status = 'pending' AND verification_token_hash = ? AND verification_expires_at > ?`)
    .bind(await sha256(token), stamp).first<{ id: string }>();
  if (!row) return noStorePage('Expired deletion link', '<h1>Deletion link expired</h1><p>This link is invalid or expired. Submit a new deletion request.</p>');
  await env.DB.batch([
    env.DB.prepare("UPDATE account_deletion_requests SET status = 'verified', verification_token_hash = NULL, verification_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'pending'").bind(stamp, row.id),
    env.DB.prepare(`INSERT OR IGNORE INTO account_deletion_request_events
      (id, request_id, from_status, to_status, actor, reason, created_at) VALUES (?, ?, 'pending', 'verified', 'requester', 'email_verified', ?)`)
      .bind(crypto.randomUUID(), row.id, stamp),
  ]);
  return noStorePage('Deletion request verified', '<h1>Deletion request verified</h1><p>Your request is queued for processing. Lift will remove the account and associated data.</p>');
}

async function transitionDeletionRequest(env: Env, id: string, from: 'pending' | 'verified', to: 'completed' | 'rejected', actor: string, reason: string, stamp: number, deleteUserId?: string) {
  const statements = [];
  if (deleteUserId) statements.push(env.DB.prepare('DELETE FROM user WHERE id = ?').bind(deleteUserId));
  statements.push(
    env.DB.prepare('UPDATE account_deletion_requests SET status = ?, terminal_at = ?, updated_at = ?, verification_token_hash = NULL, verification_expires_at = NULL WHERE id = ? AND status = ?').bind(to, stamp, stamp, id, from),
    env.DB.prepare(`INSERT OR IGNORE INTO account_deletion_request_events
      (id, request_id, from_status, to_status, actor, reason, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM account_deletion_requests WHERE id = ? AND status = ? AND terminal_at = ?
      )`).bind(crypto.randomUUID(), id, from, to, actor, reason, stamp, id, to, stamp),
  );
  await env.DB.batch(statements);
}

async function processDeletionRequests(env: Env, stamp = now()) {
  const expired = await env.DB.prepare("SELECT id FROM account_deletion_requests WHERE status = 'pending' AND verification_expires_at <= ? LIMIT 100").bind(stamp).all<{ id: string }>();
  for (const request of expired.results) await transitionDeletionRequest(env, request.id, 'pending', 'rejected', 'scheduler', 'verification_expired', stamp);

  const verified = await env.DB.prepare("SELECT id, email FROM account_deletion_requests WHERE status = 'verified' ORDER BY updated_at LIMIT 100").all<{ id: string; email: string }>();
  for (const request of verified.results) {
    const user = await env.DB.prepare('SELECT id FROM user WHERE lower(email) = ?').bind(request.email.toLowerCase()).first<{ id: string }>();
    if (user) await transitionDeletionRequest(env, request.id, 'verified', 'completed', 'scheduler', 'account_deleted', stamp, user.id);
    else await transitionDeletionRequest(env, request.id, 'verified', 'rejected', 'scheduler', 'account_not_found', stamp);
  }

  await env.DB.prepare(`UPDATE account_deletion_requests SET email = NULL
    WHERE email IS NOT NULL AND terminal_at <= ?`).bind(stamp - deletionRetentionSeconds).run();
}

async function deleteAccount(env: Env, userId: string) {
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return json({ deleted: true });
}

async function exportAccount(env: Env, userId: string) {
  const [profileRow, workouts, sets, muscles, ratings, feedback, splits, connections, blocks] = await Promise.all([
    env.DB.prepare('SELECT auth_user_id AS userId, display_name AS displayName, image_url AS imageUrl, goals, weight_lb AS weightLb, height_inches AS heightInches, experience, favorite_exercise_ids AS favoriteExerciseIds, routine_exercise_ids_by_split AS routineExerciseIdsBySplit, training_location AS trainingLocation, training_days AS trainingDays, gym_id AS gymId, available_equipment AS availableEquipment, session_minutes AS sessionMinutes, similar_users_opt_in AS optInSimilarUsers, use_custom_splits AS useCustomSplits, created_at AS createdAt, updated_at AS updatedAt FROM user_info WHERE user_id = ?').bind(userId).first(),
    env.DB.prepare('SELECT local_id AS id, split, created_at AS createdAt, ended_at AS endedAt FROM workouts WHERE user_id = ? ORDER BY created_at, local_id').bind(userId).all(),
    env.DB.prepare('SELECT workout_local_id AS workoutId, exercise_id AS exerciseId, set_number AS setNumber, weight, reps, completed_at AS completedAt FROM workout_sets WHERE user_id = ? ORDER BY completed_at, workout_local_id, exercise_id, set_number').bind(userId).all(),
    env.DB.prepare('SELECT workout_local_id AS workoutId, exercise_id AS exerciseId, set_number AS setNumber, muscle FROM set_muscles WHERE user_id = ? ORDER BY workout_local_id, exercise_id, set_number, muscle').bind(userId).all(),
    env.DB.prepare('SELECT workout_local_id AS workoutId, muscle, exhaustion, created_at AS createdAt FROM workout_muscle_ratings WHERE user_id = ? ORDER BY created_at, workout_local_id, muscle').bind(userId).all(),
    env.DB.prepare('SELECT workout_local_id AS workoutId, exercise_id AS exerciseId, action, related_exercise_id AS relatedExerciseId, rank, created_at AS createdAt FROM recommendation_feedback WHERE user_id = ? ORDER BY created_at, workout_local_id, exercise_id, action').bind(userId).all(),
    env.DB.prepare('SELECT id, name, json(muscles) AS muscles, archived, updated_at AS updatedAt FROM user_splits WHERE user_id = ? ORDER BY name, id').bind(userId).all(),
    env.DB.prepare('SELECT friend_id AS friendId, created_at AS createdAt FROM friendships WHERE user_id = ? ORDER BY created_at').bind(userId).all(),
    env.DB.prepare('SELECT blocked_id AS blockedId, created_at AS createdAt FROM friend_blocks WHERE blocker_id = ? ORDER BY created_at').bind(userId).all(),
  ]);
  return json({ exportedAt: new Date().toISOString(), profile: profileRow, workouts: workouts.results, sets: sets.results, setMuscles: muscles.results, muscleRatings: ratings.results, recommendationFeedback: feedback.results, splits: splits.results.map((split) => ({ ...split, archived: split.archived === 1, muscles: JSON.parse(split.muscles as string) })), friendConnections: connections.results, friendBlocks: blocks.results });
}

async function boundedRequest(request: Request) {
  if (!request.body) return request;
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxRequestBodyBytes) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxRequestBodyBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new Request(request, { body });
}

function configurationErrors(env: Env) {
  const missing: string[] = [];
  if (!env.DB) missing.push('DB');
  if (!env.DELETION_RATE_LIMITER) missing.push('DELETION_RATE_LIMITER');
  if (!env.SYNC_RATE_LIMITER) missing.push('SYNC_RATE_LIMITER');
  if (!env.EXPENSIVE_RATE_LIMITER) missing.push('EXPENSIVE_RATE_LIMITER');
  if (!env.BETTER_AUTH_SECRET?.trim() && !env.BETTER_AUTH_SECRETS?.trim()) missing.push('BETTER_AUTH_SECRET or BETTER_AUTH_SECRETS');
  for (const name of ['BETTER_AUTH_URL', 'TRUSTED_ORIGINS', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'SUPPORT_EMAIL'] as const) if (!env[name]?.trim()) missing.push(name);
  return missing;
}

async function readiness(env: Env) {
  if (configurationErrors(env).length) return json({ ok: false }, 503);
  try {
    const row = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    return row?.ok === 1 ? json({ ok: true }) : json({ ok: false }, 503);
  } catch {
    return json({ ok: false }, 503);
  }
}

async function customRateLimit(request: Request, env: Env, userId: string, pathname: string) {
  const limiter = pathname === '/v1/sync' ? env.SYNC_RATE_LIMITER
    : pathname === '/v1/recommendations' || pathname === '/v1/export' || pathname === '/v1/onboarding' || (!['GET', 'HEAD'].includes(request.method) && pathname.startsWith('/v1/feedback')) || (!['GET', 'HEAD'].includes(request.method) && pathname.startsWith('/v1/friends'))
      ? env.EXPENSIVE_RATE_LIMITER : null;
  if (!limiter) return null;
  const result = await limiter.limit({ key: `${userId}:${pathname}` });
  return result.success ? null : new Response(JSON.stringify({ error: 'Too many requests. Try again later.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  });
}

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') return readiness(env);
    if (request.method === 'GET' && url.pathname === '/delete-account/verify') return deletionVerificationPage(url);
    if (request.method === 'GET') {
      if (url.pathname === '/email-logo.png') return new Response(emailLogoPng, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } });
      if (url.pathname === '/reset-password') return passwordResetPage();
      if (url.pathname === '/email-verified' && url.searchParams.has('error')) return noStorePage('Verification link expired', '<h1>Verification link expired</h1><p>This verification link is invalid or expired. Return to Lift and request a new email.</p><p><a href="lift:///auth/verified">Open Lift</a></p>');
      const response = publicPage(url.pathname, env);
      if (response) return response;
    }
    if (request.method === 'POST' && url.pathname === '/v1/deletion-requests') return requestAccountDeletion(request, env);
    if (request.method === 'POST' && url.pathname === '/v1/deletion-requests/verify') return verifyAccountDeletion(request, env);
    const auth = createAuth(env, ctx);
    if (url.pathname.startsWith('/api/auth/')) return auth.handler(request);
    // The old anonymous-session endpoint is intentionally removed. It could
    // create identities unrelated to Better Auth and break cross-device ownership.
    const session = await auth.api.getSession({ headers: request.headers });
    // The feedback board is public; a session only adds the reader's own votes.
    if (request.method === 'GET' && url.pathname === '/v1/feedback') return listFeedback(env, session?.user.id ?? null);
    if (!session) return json({ error: 'Unauthorized.' }, 401);
    const origin = request.headers.get('Origin');
    const trustedOrigins = (env.TRUSTED_ORIGINS || 'https://lift.garrett.one,lift://').split(',').map((value) => value.trim());
    if (!['GET', 'HEAD'].includes(request.method) && origin && !trustedOrigins.includes(origin)) return json({ error: 'Untrusted origin.' }, 403);
    const user: AuthenticatedUser = { id: session.user.id, displayName: session.user.name?.trim() || 'Lifter', imageUrl: session.user.image ?? null };
    const limited = await customRateLimit(request, env, user.id, url.pathname);
    if (limited) return limited;
    // This route intentionally precedes ensureUser: a retry after a partial
    // client failure must not recreate the row it is trying to remove.
    if (request.method === 'DELETE' && url.pathname === '/v1/account') return json({ error: 'Use /api/auth/delete-user so identity and app data are removed together.' }, 410);
    try { await ensureUser(env, user); }
    catch { return json({ error: 'Could not establish account.' }, 500); }
    if (request.method === 'POST' && url.pathname === '/v1/sync') return pushSyncChunk(request, env, user.id);
    if (request.method === 'GET' && url.pathname === '/v1/sync') return pullSyncChanges(env, user.id, url);
    if (request.method === 'GET' && url.pathname === '/v1/recommendations') return json({ recommendations: await recommendations(env, user.id) });
    if (request.method === 'GET' && url.pathname === '/v1/friends') return json({ friends: await friends(env, user.id) });
    if (request.method === 'GET' && url.pathname === '/v1/friends/prs') return json({ prs: await friendPersonalRecords(env, user.id) });
    if (url.pathname === '/v1/friends/workouts/likes' || url.pathname === '/v1/friends/prs/likes') return friendActivity(request, env, user.id, 'likes');
    if (url.pathname === '/v1/friends/workouts/comments' || url.pathname === '/v1/friends/prs/comments') return friendActivity(request, env, user.id, 'comments');
    if (request.method === 'GET' && url.pathname === '/v1/friends/code') return json({ code: await codeFor(env, user.id) });
    if (request.method === 'POST' && url.pathname === '/v1/friends') return addFriend(request, env, user.id);
    const friendRoute = url.pathname.match(/^\/v1\/friends\/([^/]+)(\/block)?$/);
    if (friendRoute) {
      let friendId = '';
      try { friendId = decodeURIComponent(friendRoute[1]!); } catch { return json({ error: 'Invalid friend ID.' }, 400); }
      if (!isString(friendId, 100) || friendId === user.id) return json({ error: 'Invalid friend ID.' }, 400);
      if (request.method === 'DELETE' && friendRoute[2]) return unblockFriend(env, user.id, friendId);
      if (request.method === 'POST' && friendRoute[2]) return blockFriend(env, user.id, friendId);
      if (request.method === 'DELETE' && !friendRoute[2]) return removeFriend(env, user.id, friendId);
    }
    if (request.method === 'GET' && url.pathname === '/v1/profile') return json({ profile: await profile(env, user.id) });
    if (request.method === 'PATCH' && url.pathname === '/v1/profile') return updateProfile(request, env, user.id);
    if (request.method === 'GET' && url.pathname === '/v1/export') return exportAccount(env, user.id);
    if (request.method === 'POST' && url.pathname === '/v1/onboarding') return saveOnboarding(request, env, user.id);
    if (request.method === 'POST' && url.pathname === '/v1/feedback') return createFeedback(request, env, user.id);
    const voteRoute = url.pathname.match(/^\/v1\/feedback\/([0-9a-f-]{36})\/vote$/);
    if (request.method === 'POST' && voteRoute) return voteFeedback(request, env, user.id, voteRoute[1]!);
    return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    let response: Response;
    let error: { name: string; message: string } | undefined;
    try {
      if (request.method === 'OPTIONS') response = new Response(null);
      else {
        const bounded = await boundedRequest(request);
        response = bounded ? await handleRequest(bounded, env, ctx) : json({ error: `Request body exceeds ${maxRequestBodyBytes} bytes.` }, 413);
      }
    } catch (cause) {
      error = cause instanceof Error ? { name: cause.name, message: cause.message } : { name: 'Error', message: String(cause) };
      response = json({ error: 'Internal server error.' }, 500);
    }
    const durationMs = Date.now() - startedAt;
    const status = response.status;
    const level = status >= 500 ? 'error' : 'info';
    console.log({
      event: 'http_request', level, requestId, method: request.method,
      path: new URL(request.url).pathname, status, durationMs,
      ...(error ? { error } : {}),
    });
    const headers = new Headers(response.headers);
    headers.set('X-Request-ID', requestId);
    const origin = request.headers.get('Origin');
    const allowedOrigins = (env.TRUSTED_ORIGINS || 'https://lift.garrett.one,lift://').split(',').map((value) => value.trim());
    if (origin && allowedOrigins.includes(origin)) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Cookie, Authorization, Expo-Origin');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Expose-Headers', 'X-Request-ID, Set-Auth-Cookie');
    if (!headers.has('Content-Security-Policy')) headers.set('Content-Security-Policy', "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    return new Response(response.body, { status, statusText: response.statusText, headers });
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(processDeletionRequests(env));
  },
} satisfies ExportedHandler<Env>;

// Kept as a named export solely for the dependency-free worker regression.
export {
  pullSyncChanges as __testPullSyncChanges,
  pushSyncChunk as __testPushSyncChunk,
  deleteAccount as __testDeleteAccount,
  exportAccount as __testExportAccount,
  updateProfile as __testUpdateProfile,
  validChunk as __testValidChunk,
  validOnboarding as __testValidOnboarding,
  validPayload as __testValidPayload,
  processDeletionRequests as __testProcessDeletionRequests,
};
