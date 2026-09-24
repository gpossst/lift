import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_SECRETS?: string;
  BETTER_AUTH_URL?: string;
  TRUSTED_ORIGINS?: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
}

type BackgroundContext = Pick<ExecutionContext, 'waitUntil'>;

const required = (value: string | undefined, name: string) => {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is required.`);
  return result;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);

async function sendEmail(env: AuthEnv, to: string, subject: string, text: string, action?: { label: string; url: string }) {
  const apiKey = required(env.RESEND_API_KEY, 'RESEND_API_KEY');
  const from = required(env.RESEND_FROM_EMAIL, 'RESEND_FROM_EMAIL');
  const safeText = escapeHtml(text).replace(/\n/g, '<br>');
  const actionHtml = action ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#171915;color:#fff;text-decoration:none">${escapeHtml(action.label)}</a></p>` : '';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: action ? `${text}\n\n${action.label}: ${action.url}` : text, html: `<div style="font:16px/1.5 system-ui,sans-serif;color:#171915"><p>${safeText}</p>${actionHtml}<p style="color:#6b7067">If you did not request this, you can ignore this email.</p></div>` }),
  });
  if (!response.ok) throw new Error(`Resend rejected email (${response.status}).`);
}

export function createAuth(env: AuthEnv, ctx?: BackgroundContext) {
  const baseURL = env.BETTER_AUTH_URL?.trim() || 'https://api.lift.garrett.one';
  const trustedOrigins = (env.TRUSTED_ORIGINS || 'https://lift.garrett.one,mobile://')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  const secrets = env.BETTER_AUTH_SECRETS?.split(',').map((entry) => {
    const separator = entry.indexOf(':');
    const version = Number(entry.slice(0, separator));
    const value = entry.slice(separator + 1).trim();
    if (separator < 1 || !Number.isSafeInteger(version) || version < 1 || !value) throw new Error('BETTER_AUTH_SECRETS must use version:secret entries.');
    return { version, value };
  });
  if (!env.BETTER_AUTH_SECRET?.trim() && !secrets?.length) throw new Error('BETTER_AUTH_SECRET or BETTER_AUTH_SECRETS is required.');

  return betterAuth({
    appName: 'Lift',
    baseURL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET?.trim(),
    secrets: secrets?.length ? secrets : undefined,
    database: env.DB,
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }) => sendEmail(env, user.email, 'Reset your Lift password', 'Use the secure link below to choose a new Lift password. This link expires in one hour.', { label: 'Reset password', url }),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) => sendEmail(env, user.email, 'Verify your Lift email', 'Verify this email address to finish creating your Lift account.', { label: 'Verify email', url }),
    },
    user: { deleteUser: { enabled: true } },
    rateLimit: { enabled: true, storage: 'database' },
    plugins: [
      expo(),
      twoFactor({
        issuer: 'Lift',
        otpOptions: {
          storeOTP: 'hashed',
          sendOTP: ({ user, otp }) => sendEmail(env, user.email, 'Your Lift security code', `Your Lift verification code is ${otp}. It expires shortly.`),
        },
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 15 * 60 },
      }),
    ],
    advanced: {
      useSecureCookies: true,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
      ...(ctx ? { backgroundTasks: { handler: (promise: Promise<unknown>) => ctx.waitUntil(promise) } } : {}),
    },
  });
}

export type LiftAuth = ReturnType<typeof createAuth>;
