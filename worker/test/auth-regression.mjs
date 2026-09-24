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
const env = { DB, BETTER_AUTH_URL: 'https://api.lift.test', BETTER_AUTH_SECRETS: `2:${'n'.repeat(40)},1:${'o'.repeat(40)}`, BETTER_AUTH_SECRET: 'legacy-secret-that-is-at-least-32-characters', TRUSTED_ORIGINS: 'https://lift.test,mobile://', RESEND_API_KEY: 're_test', RESEND_FROM_EMAIL: 'Lift <auth@lift.test>' };
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
  const signup = await call('/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ email, name, password: 'correct horse battery staple' }) }, environment);
  if (signup.status !== 200) throw new Error(`Sign-up failed: ${signup.status} ${await signup.text()}`);
  const signupCookie = cookieFrom(signup);
  if ((await call('/v1/profile', { headers: { Cookie: signupCookie } }, environment)).status !== 200) throw new Error('Sign-up did not create a usable session.');
  const verificationEmail = sentEmails.findLast((item) => item.to?.includes(email));
  const verificationURL = verificationEmail?.text?.match(/https:\/\/[^\s]+/)?.[0];
  if (!verificationURL) throw new Error('Verification email did not contain a link.');
  const verification = new URL(verificationURL);
  const verified = await call(`${verification.pathname}${verification.search}`, {}, environment);
  if (![200, 302].includes(verified.status) || !(await DB.prepare('SELECT emailVerified FROM user WHERE email = ?').bind(email).first()).emailVerified) throw new Error('Email verification link failed.');
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

let twoCookie = await createUser('two@lift.test', 'Two');
const emailCount = sentEmails.length;
const enableEmailMfa = await call('/api/auth/two-factor/enable', { method: 'POST', headers: { Cookie: twoCookie }, body: JSON.stringify({ password: 'correct horse battery staple', method: 'otp' }) });
const emailEnrollment = await enableEmailMfa.json();
if (enableEmailMfa.status !== 200 || emailEnrollment.method !== 'otp' || !(await DB.prepare("SELECT twoFactorEnabled FROM user WHERE email = 'two@lift.test'").first()).twoFactorEnabled || sentEmails.length !== emailCount) throw new Error('Email MFA should enable without sending or verifying an enrollment code.');
twoCookie = cookieFrom(enableEmailMfa);
const pushed = await call('/v1/sync', { method: 'POST', headers: { Cookie: oneCookie }, body: JSON.stringify({ batchId: 'account-isolation', changes: [{ entity: 'workout', key: 'private', operation: 'upsert', baseRevision: 0, record: { id: 'private', split: 'push', createdAt: 1, endedAt: null } }] }) });
if (pushed.status !== 200) throw new Error(`Authenticated account could not write sync data: ${await pushed.text()}`);
const own = await (await call('/v1/sync', { headers: { Cookie: oneCookie } })).json();
const other = await (await call('/v1/sync', { headers: { Cookie: twoCookie } })).json();
if (own.changes?.length !== 1 || other.changes?.length !== 0) throw new Error('Authenticated account data crossed Better Auth users.');

const twoId = (await DB.prepare("SELECT id FROM user WHERE email = 'two@lift.test'").first()).id;
const deleted = await call('/api/auth/delete-user', { method: 'POST', headers: { Cookie: twoCookie }, body: JSON.stringify({ password: 'correct horse battery staple' }) });
if (deleted.status !== 200 || await DB.prepare("SELECT 1 FROM user WHERE email = 'two@lift.test'").first() || await DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(twoId).first()) throw new Error('Better Auth account deletion did not remove identity and app data.');

const one = await DB.prepare("SELECT id FROM user WHERE email = 'one@lift.test'").first();
await DB.prepare('UPDATE session SET expiresAt = 0 WHERE userId = ?').bind(one.id).run();
if ((await call('/v1/sync', { headers: { Cookie: oneCookie } })).status !== 401) throw new Error('Expired Better Auth session was accepted.');

await mf.dispose();
console.log('Better Auth origin, forgery, expiry, MFA enrollment, Resend, deletion, and account-isolation regressions passed.');
