import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const temp = mkdtempSync(join(tmpdir(), 'lift-auth-regression-'));
const { default: handler } = await import('../src/index.ts');
const mf = new Miniflare(convertV4MiniflareOptions({ compatibilityDate: '2026-08-31', compatibilityFlags: ['nodejs_compat'], modules: true, script: 'export default { fetch() { return new Response("ok") } }', d1Databases: { DB: 'auth-regression' } }));
const DB = await mf.getD1Database('DB');
for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
  const source = readFileSync(join('migrations', file), 'utf8');
  const triggers = source.match(/CREATE TRIGGER[\s\S]*?END;/gi) ?? [];
  const ordinary = source.replace(/CREATE TRIGGER[\s\S]*?END;/gi, '');
  for (const statement of ordinary.split(';').map((sql) => sql.trim()).filter(Boolean)) await DB.prepare(statement).run();
  for (const trigger of triggers) await DB.prepare(trigger.replace(/;\s*$/, '')).run();
}

const sentEmails = [];
globalThis.fetch = async (input, init) => {
  if (String(input) !== 'https://api.resend.com/emails') throw new Error(`Unexpected fetch: ${input}`);
  sentEmails.push(JSON.parse(init.body));
  return Response.json({ id: crypto.randomUUID() });
};
let denySync = false;
let denyExpensive = false;
const env = {
  DB,
  BETTER_AUTH_URL: 'https://api.lift.test',
  BETTER_AUTH_SECRETS: `2:${'n'.repeat(40)},1:${'o'.repeat(40)}`,
  BETTER_AUTH_SECRET: 'legacy-secret-that-is-at-least-32-characters',
  TRUSTED_ORIGINS: 'https://lift.test,lift://',
  RESEND_API_KEY: 're_test',
  RESEND_FROM_EMAIL: 'Lift <auth@lift.test>',
  SUPPORT_EMAIL: 'support@lift.test',
  DELETION_RATE_LIMITER: { limit: async () => ({ success: true }) },
  SYNC_RATE_LIMITER: { limit: async () => ({ success: !denySync }) },
  EXPENSIVE_RATE_LIMITER: { limit: async () => ({ success: !denyExpensive }) },
};
const pending = [];
let requestNumber = 1;
const ctx = { waitUntil(promise) { pending.push(promise); } };
const call = async (path, init = {}, environment = env) => {
  const headers = new Headers(init.headers);
  if (!headers.has('Origin')) headers.set('Origin', 'https://lift.test');
  if (!headers.has('cf-connecting-ip')) headers.set('cf-connecting-ip', `192.0.2.${requestNumber++}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await handler.fetch(new Request(`https://api.lift.test${path}`, { ...init, headers }), environment, ctx);
  await Promise.all(pending.splice(0));
  return response;
};
const cookieFrom = (response) => {
  const value = response.headers.get('set-cookie');
  const match = value?.match(/(?:__Secure-)?better-auth\.session_token=[^;,]+/);
  if (!match) throw new Error(`Session cookie missing from: ${value}`);
  return match[0];
};
const createUser = async (email, name, environment = env) => {
  const signup = await call('/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ email, name, password: 'correct horse battery staple', callbackURL: 'lift:///auth/verified' }) }, environment);
  if (signup.status !== 200) throw new Error(`Sign-up failed: ${signup.status} ${await signup.text()}`);
  const signupCookie = cookieFrom(signup);
  if ((await call('/v1/profile', { headers: { Cookie: signupCookie } }, environment)).status !== 200) throw new Error('Sign-up did not create a usable session.');
  const verificationEmail = sentEmails.findLast((item) => item.to?.includes(email));
  const verificationURL = verificationEmail?.text?.match(/https:\/\/[^\s]+/)?.[0];
  if (!verificationURL) throw new Error('Verification email did not contain a link.');
  const verification = new URL(verificationURL);
  if (verification.searchParams.get('callbackURL') !== 'https://api.lift.test/email-verified') throw new Error('Mobile verification email redirects into a browser-only app link.');
  const verified = await call(`${verification.pathname}${verification.search}`, {}, environment);
  if (verified.status !== 302 || verified.headers.get('location') !== 'https://api.lift.test/email-verified' || !(await DB.prepare('SELECT emailVerified FROM user WHERE email = ?').bind(email).first()).emailVerified) throw new Error('Email verification link failed.');
  const confirmation = await call('/email-verified');
  if (confirmation.status !== 200 || !(await confirmation.text()).includes('Email verified') || confirmation.headers.get('cache-control') !== 'no-store') throw new Error('Mobile verification confirmation page failed.');
  const signin = await call('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password: 'correct horse battery staple' }) }, environment);
  if (signin.status !== 200) throw new Error(`Sign-in failed: ${signin.status} ${await signin.text()}`);
  return cookieFrom(signin);
};
const totp = (uri) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const secret = new URL(uri).searchParams.get('secret').toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const character of secret) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
};

const health = await call('/healthz');
if (health.status !== 200 || !(await health.json()).ok) throw new Error('Readiness check failed with valid configuration and D1.');
if ((await call('/healthz', {}, { ...env, SUPPORT_EMAIL: '' })).status !== 503) throw new Error('Readiness check accepted a missing support address.');
const publicPage = await call('/delete-account');
for (const header of ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy']) if (!publicPage.headers.has(header)) throw new Error(`Security header missing: ${header}`);
const expiredVerification = await call('/email-verified?error=INVALID_TOKEN');
if (!(await expiredVerification.text()).includes('Verification link expired')) throw new Error('Invalid verification link showed success.');
const oversized = await call('/api/auth/sign-up/email', { method: 'POST', body: 'x'.repeat(64 * 1024 + 1) });
if (oversized.status !== 413) throw new Error('Oversized request body reached the route handler.');

await createUser('recovery@lift.test', 'Recovery');
const resetRequest = await call('/api/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email: 'recovery@lift.test', redirectTo: 'https://api.lift.test/reset-password' }) });
if (resetRequest.status !== 200) throw new Error(`Password reset request failed: ${resetRequest.status}`);
const resetEmail = sentEmails.findLast((item) => item.to?.includes('recovery@lift.test') && item.subject === 'Reset your Lift password');
const resetLink = resetEmail?.text?.match(/https:\/\/[^\s]+/)?.[0];
if (!resetLink) throw new Error('Password reset email did not contain a link.');
const resetURL = new URL(resetLink);
const resetRedirect = await call(`${resetURL.pathname}${resetURL.search}`);
const destination = new URL(resetRedirect.headers.get('location'));
if (resetRedirect.status !== 302 || destination.pathname !== '/reset-password' || !destination.searchParams.has('token')) throw new Error('Password reset link did not redirect to the browser fallback with a token.');
const resetPage = await call(`${destination.pathname}${destination.search}`);
const resetHtml = await resetPage.text();
if (resetPage.status !== 200 || resetPage.headers.get('cache-control') !== 'no-store' || resetPage.headers.get('referrer-policy') !== 'no-referrer' || !resetHtml.includes('Open in Lift') || !resetHtml.includes("fetch('/api/auth/reset-password'")) throw new Error('Browser password reset page was not usable or private.');
const newPassword = 'fresh correct horse battery staple';
const resetSaved = await call('/api/auth/reset-password', { method: 'POST', headers: { Origin: 'https://api.lift.test' }, body: JSON.stringify({ newPassword, token: destination.searchParams.get('token') }) });
if (resetSaved.status !== 200) throw new Error(`Browser password reset failed: ${resetSaved.status} ${await resetSaved.text()}`);
const recoveredSignIn = await call('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: 'recovery@lift.test', password: newPassword }) });
if (recoveredSignIn.status !== 200) throw new Error('The recovered account could not sign in with its new password.');

const untrusted = await call('/api/auth/sign-up/email', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: JSON.stringify({ email: 'evil@lift.test', name: 'Evil', password: 'correct horse battery staple' }) });
if (untrusted.status < 400) throw new Error('Better Auth accepted an untrusted origin.');

let oneCookie = await createUser('one@lift.test', 'One');
const freshProfile = await (await call('/v1/profile', { headers: { Cookie: oneCookie } })).json();
if (freshProfile.profile.hasChosenDisplayName !== false) throw new Error('A new account was treated as having chosen a display name.');
const unnamedCode = await (await call('/v1/friends/code', { headers: { Cookie: oneCookie } })).json();
if (unnamedCode.code !== null || (await call('/v1/friends', { method: 'POST', headers: { Cookie: oneCookie }, body: JSON.stringify({ code: 'ABC123' }) })).status !== 409) throw new Error('Friends were available before choosing a display name.');
const namedProfile = await (await call('/v1/profile', { method: 'PATCH', headers: { Cookie: oneCookie }, body: JSON.stringify({ displayName: 'One Lifter' }) })).json();
if (namedProfile.profile.hasChosenDisplayName !== true || !(await (await call('/v1/friends/code', { headers: { Cookie: oneCookie } })).json()).code) throw new Error('Choosing a display name did not unlock friends.');
const minimalOnboarding = await call('/v1/onboarding', { method: 'POST', headers: { Cookie: oneCookie }, body: JSON.stringify({ goals: ['Get stronger'], experience: 'new', trainingDays: 3 }) });
const minimalProfile = await (await call('/v1/profile', { headers: { Cookie: oneCookie } })).json();
if (minimalOnboarding.status !== 201 || minimalProfile.profile.recommendationPreferences.weightLb !== null || minimalProfile.profile.recommendationPreferences.heightInches !== null || minimalProfile.profile.hasChosenDisplayName !== true) throw new Error('Minimal onboarding did not preserve optional measurements and name choice.');
if (!sentEmails.some((email) => email.to?.includes('one@lift.test'))) throw new Error('Sign-up did not send verification email through Resend.');
const enableMfa = await call('/api/auth/two-factor/enable', { method: 'POST', headers: { Cookie: oneCookie }, body: JSON.stringify({ password: 'correct horse battery staple', method: 'totp' }) });
const enrollment = await enableMfa.json();
if (enableMfa.status !== 200 || !enrollment.totpURI || !Array.isArray(enrollment.backupCodes) || !enrollment.backupCodes.length) throw new Error('TOTP enrollment or backup-code generation failed.');
const verifyMfa = await call('/api/auth/two-factor/verify-totp', { method: 'POST', headers: { Cookie: oneCookie }, body: JSON.stringify({ code: totp(enrollment.totpURI) }) });
if (verifyMfa.status !== 200 || !(await DB.prepare("SELECT twoFactorEnabled FROM user WHERE email = 'one@lift.test'").first()).twoFactorEnabled) throw new Error('TOTP enrollment could not be verified.');
oneCookie = cookieFrom(verifyMfa);
if ((await call('/v1/sync', { headers: { Cookie: 'better-auth.session_token=forged' } })).status !== 401) throw new Error('Forged session cookie was accepted.');
if ((await call('/v1/sync', { headers: { Cookie: oneCookie } })).status !== 200) throw new Error('Valid Better Auth session was rejected.');
if ((await call('/v1/sync', { method: 'POST', headers: { Cookie: oneCookie, Origin: 'https://evil.test' }, body: '{}' })).status !== 403) throw new Error('Custom API mutation accepted an untrusted origin.');
denySync = true;
const throttledSync = await call('/v1/sync', { headers: { Cookie: oneCookie } });
denySync = false;
if (throttledSync.status !== 429 || throttledSync.headers.get('retry-after') !== '60') throw new Error('Sync endpoint was not rate limited.');
denyExpensive = true;
const throttledRecommendations = await call('/v1/recommendations', { headers: { Cookie: oneCookie } });
denyExpensive = false;
if (throttledRecommendations.status !== 429) throw new Error('Expensive custom endpoint was not rate limited.');

let twoCookie = await createUser('two@lift.test', 'Two');
const emailCount = sentEmails.length;
const enableEmailMfa = await call('/api/auth/two-factor/enable', { method: 'POST', headers: { Cookie: twoCookie }, body: JSON.stringify({ password: 'correct horse battery staple', method: 'otp' }) });
const emailEnrollment = await enableEmailMfa.json();
if (enableEmailMfa.status !== 200 || emailEnrollment.method !== 'otp' || !(await DB.prepare("SELECT twoFactorEnabled FROM user WHERE email = 'two@lift.test'").first()).twoFactorEnabled || sentEmails.length !== emailCount) throw new Error('Email MFA should enable without sending or verifying an enrollment code.');
twoCookie = cookieFrom(enableEmailMfa);
await call('/v1/profile', { method: 'PATCH', headers: { Cookie: twoCookie }, body: JSON.stringify({ displayName: 'Two Lifter' }) });
const oneId = (await DB.prepare("SELECT id FROM user WHERE email = 'one@lift.test'").first()).id;
const twoId = (await DB.prepare("SELECT id FROM user WHERE email = 'two@lift.test'").first()).id;
const oneCode = (await (await call('/v1/friends/code', { headers: { Cookie: oneCookie } })).json()).code;
const twoCode = (await (await call('/v1/friends/code', { headers: { Cookie: twoCookie } })).json()).code;
const addedFriend = await call('/v1/friends', { method: 'POST', headers: { Cookie: twoCookie }, body: JSON.stringify({ code: oneCode }) });
if (addedFriend.status !== 201 || (await addedFriend.json()).friends.count !== 1) throw new Error('Reciprocal friend connection could not be added.');
await call(`/v1/friends/${oneId}`, { method: 'DELETE', headers: { Cookie: twoCookie } });
const [oneAfterRemoval, twoAfterRemoval] = await Promise.all([
  call('/v1/friends', { headers: { Cookie: oneCookie } }).then((response) => response.json()),
  call('/v1/friends', { headers: { Cookie: twoCookie } }).then((response) => response.json()),
]);
if (oneAfterRemoval.friends.count || twoAfterRemoval.friends.count) throw new Error('Removing a friend did not remove both sides of the connection.');
await call('/v1/friends', { method: 'POST', headers: { Cookie: twoCookie }, body: JSON.stringify({ code: oneCode }) });
const blockedFriend = await call(`/v1/friends/${oneId}/block`, { method: 'POST', headers: { Cookie: twoCookie } });
const blockedSummary = await blockedFriend.json();
if (blockedFriend.status !== 200 || blockedSummary.friends.count || blockedSummary.friends.blocked?.[0]?.id !== oneId) throw new Error('Blocking did not remove and retain the blocked friend.');
if ((await call('/v1/friends', { method: 'POST', headers: { Cookie: oneCookie }, body: JSON.stringify({ code: twoCode }) })).status !== 409) throw new Error('A blocked connection could be re-added.');
await call(`/v1/friends/${oneId}/block`, { method: 'DELETE', headers: { Cookie: twoCookie } });
if ((await call('/v1/friends', { method: 'POST', headers: { Cookie: oneCookie }, body: JSON.stringify({ code: twoCode }) })).status !== 201) throw new Error('Unblocking did not allow the connection to be added again.');
await DB.prepare("INSERT INTO workouts (user_id, local_id, split, created_at, ended_at) VALUES (?, 'friend-feed', 'push', 1000, 4000)").bind(oneId).run();
await DB.batch([
  DB.prepare("INSERT INTO workout_sets (user_id, workout_local_id, set_number, exercise_id, weight, reps, completed_at) VALUES (?, 'friend-feed', 1, 'bench-press', 100, 5, 1000)").bind(oneId),
  DB.prepare("INSERT INTO workout_sets (user_id, workout_local_id, set_number, exercise_id, weight, reps, completed_at) VALUES (?, 'friend-feed', 2, 'bench-press', 110, 5, 2000)").bind(oneId),
  DB.prepare("INSERT INTO workout_sets (user_id, workout_local_id, set_number, exercise_id, weight, reps, completed_at) VALUES (?, 'friend-feed', 3, 'bench-press', 120, 3, 3000)").bind(oneId),
]);
await DB.prepare("INSERT INTO workouts (user_id, local_id, split, created_at, ended_at) VALUES (?, 'other-feed', 'push', 5000, 6000)").bind(oneId).run();
await DB.prepare("INSERT INTO workout_sets (user_id, workout_local_id, set_number, exercise_id, weight, reps, completed_at) VALUES (?, 'other-feed', 1, 'bench-press', 130, 2, 5500)").bind(oneId).run();
await DB.prepare("INSERT INTO workouts (user_id, local_id, split, created_at, ended_at) VALUES (?, 'no-pr-feed', 'push', 7000, 8000)").bind(oneId).run();
await DB.prepare("INSERT INTO workout_sets (user_id, workout_local_id, set_number, exercise_id, weight, reps, completed_at) VALUES (?, 'no-pr-feed', 1, 'squat', 100, 5, 7500)").bind(oneId).run();
const friendFeed = await (await call('/v1/friends/prs', { headers: { Cookie: twoCookie } })).json();
if (friendFeed.prs.length !== 3 || friendFeed.prs[0].weight !== 130 || friendFeed.prs[1].weight !== 120 || friendFeed.prs[2].weight !== 110) throw new Error('Friend feed did not return recent PRs in newest-first order.');
const post = friendFeed.prs[1];
const postBody = JSON.stringify({ id: post.id, workoutId: post.workoutId });
if (post.liked || post.likeCount || post.commentCount) throw new Error('New workout should have no reactions.');
const like = await call('/v1/friends/workouts/likes', { method: 'POST', headers: { Cookie: twoCookie }, body: postBody });
if (like.status !== 200 || (await like.json()).likeCount !== 1) throw new Error('Could not like a friend workout.');
await call('/v1/friends/workouts/likes', { method: 'POST', headers: { Cookie: twoCookie }, body: postBody });
const comment = await call('/v1/friends/workouts/comments', { method: 'POST', headers: { Cookie: twoCookie }, body: JSON.stringify({ ...JSON.parse(postBody), body: 'Strong lift!' }) });
if (comment.status !== 200 || (await comment.json()).comments[0]?.body !== 'Strong lift!') throw new Error('Could not comment on a friend workout.');
const reactedFeed = await (await call('/v1/friends/prs', { headers: { Cookie: twoCookie } })).json();
if (reactedFeed.prs[0].likeCount || reactedFeed.prs[0].commentCount || reactedFeed.prs.slice(1).some((record) => !record.liked || record.likeCount !== 1 || record.commentCount !== 1)) throw new Error('Reactions were not scoped to the whole workout.');
if ((await call('/v1/friends/workouts/likes', { method: 'POST', headers: { Cookie: twoCookie }, body: JSON.stringify({ id: oneId, workoutId: 'no-pr-feed' }) })).status !== 404) throw new Error('A workout without a PR accepted a like.');
if ((await call('/v1/friends/workouts/comments', { method: 'POST', headers: { Cookie: twoCookie }, body: JSON.stringify({ ...JSON.parse(postBody), body: ' ' }) })).status !== 400) throw new Error('Blank comment was accepted.');
if ((await call('/v1/friends/workouts/likes', { method: 'POST', headers: { Cookie: oneCookie }, body: postBody })).status !== 404) throw new Error('A user could react to their own workout through friend activity.');
const unlike = await call('/v1/friends/workouts/likes', { method: 'DELETE', headers: { Cookie: twoCookie }, body: postBody });
if (unlike.status !== 200 || (await unlike.json()).likeCount !== 0) throw new Error('Could not unlike a friend workout.');
await DB.batch([
  DB.prepare("INSERT INTO friend_pr_likes (author_id, workout_local_id, exercise_id, set_number, user_id, created_at) VALUES (?, 'friend-feed', 'bench-press', 2, ?, 2000)").bind(oneId, twoId),
  DB.prepare("INSERT INTO friend_pr_likes (author_id, workout_local_id, exercise_id, set_number, user_id, created_at) VALUES (?, 'friend-feed', 'bench-press', 3, ?, 3000)").bind(oneId, twoId),
  DB.prepare("INSERT INTO friend_pr_comments (id, author_id, workout_local_id, exercise_id, set_number, user_id, body, created_at) VALUES ('legacy-one', ?, 'friend-feed', 'bench-press', 2, ?, 'Earlier set', 2000)").bind(oneId, twoId),
  DB.prepare("INSERT INTO friend_pr_comments (id, author_id, workout_local_id, exercise_id, set_number, user_id, body, created_at) VALUES ('legacy-two', ?, 'friend-feed', 'bench-press', 3, ?, 'Later set', 3000)").bind(oneId, twoId),
]);
for (const statement of readFileSync('migrations/0018_friend_workout_activity.sql', 'utf8').split(';').map((sql) => sql.trim()).filter((sql) => sql.startsWith('INSERT OR IGNORE'))) await DB.prepare(statement).run();
const migratedFeed = await (await call('/v1/friends/prs', { headers: { Cookie: twoCookie } })).json();
if (migratedFeed.prs.slice(1).some((record) => !record.liked || record.likeCount !== 1 || record.commentCount !== 3)) throw new Error('Existing set reactions were not merged into the workout.');
const migratedComments = await (await call(`/v1/friends/workouts/comments?id=${oneId}&workoutId=friend-feed`, { headers: { Cookie: twoCookie } })).json();
if (migratedComments.comments.length !== 3) throw new Error('Existing set comments were not preserved on the workout.');
const pushed = await call('/v1/sync', { method: 'POST', headers: { Cookie: oneCookie }, body: JSON.stringify({ batchId: 'account-isolation', changes: [{ entity: 'workout', key: 'private', operation: 'upsert', baseRevision: 0, record: { id: 'private', split: 'push', createdAt: 1, endedAt: null } }] }) });
if (pushed.status !== 200) throw new Error(`Authenticated account could not write sync data: ${await pushed.text()}`);
const own = await (await call('/v1/sync', { headers: { Cookie: oneCookie } })).json();
const other = await (await call('/v1/sync', { headers: { Cookie: twoCookie } })).json();
if (own.changes?.length !== 1 || other.changes?.length !== 0) throw new Error('Authenticated account data crossed Better Auth users.');

const postFeedback = (cookie) => call('/v1/feedback', { method: 'POST', headers: { Cookie: cookie }, body: JSON.stringify({ kind: 'feature', body: 'A feedback limit test' }) });
const feedbackPosts = await Promise.all([postFeedback(oneCookie), postFeedback(oneCookie), postFeedback(oneCookie)]);
if (feedbackPosts.filter((response) => response.status === 200).length !== 2 || feedbackPosts.filter((response) => response.status === 429).length !== 1) throw new Error('Concurrent feedback posts exceeded the two-per-day limit.');
if ((await postFeedback(twoCookie)).status !== 200) throw new Error('Feedback limit crossed accounts.');
await DB.prepare('UPDATE site_feedback SET created_at = ? WHERE user_id = ?').bind(Math.floor(Date.now() / 1000) - 86400, oneId).run();
if ((await postFeedback(oneCookie)).status !== 200) throw new Error('Feedback limit did not reset after 24 hours.');

const deleted = await call('/api/auth/delete-user', { method: 'POST', headers: { Cookie: twoCookie }, body: JSON.stringify({ password: 'correct horse battery staple' }) });
if (deleted.status !== 200 || await DB.prepare("SELECT 1 FROM user WHERE email = 'two@lift.test'").first() || await DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(twoId).first()) throw new Error('Better Auth account deletion did not remove identity and app data.');
if (await DB.prepare('SELECT 1 FROM friend_workout_comments WHERE user_id = ?').bind(twoId).first()) throw new Error('Account deletion left friend comments behind.');

const one = await DB.prepare("SELECT id FROM user WHERE email = 'one@lift.test'").first();
await DB.prepare('UPDATE session SET expiresAt = 0 WHERE userId = ?').bind(one.id).run();
if ((await call('/v1/sync', { headers: { Cookie: oneCookie } })).status !== 401) throw new Error('Expired Better Auth session was accepted.');

await mf.dispose();
console.log('Better Auth origin, forgery, expiry, MFA enrollment, Resend, deletion, and account-isolation regressions passed.');
