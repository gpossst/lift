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

const emailHtml = (logoUrl: string, text: string, action?: { label: string; url: string }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Lift</title>
</head>
<body style="margin:0;padding:32px 16px;background:#F9F9F7">
<div style="max-width:480px;margin:0 auto;padding:32px 28px;border-radius:24px;background:#FFFFFF;font:16px/1.55 Spline Sans,Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#11120F">
<img src="${escapeHtml(logoUrl)}" width="130" height="50" alt="Lift" style="display:block;width:130px;height:50px;border:0;margin:0 0 24px">
<p style="margin:0 0 24px">${escapeHtml(text).replace(/\n/g, '<br>')}</p>
${action ? `<p style="margin:0 0 24px"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:14px 22px;border-radius:16px;background:#FFCC4A;color:#17180F;font-weight:900;text-decoration:none">${escapeHtml(action.label)}</a></p>` : ''}
<p style="margin:0;color:#72776D;font-size:13px">If you did not request this, you can ignore this email.</p>
</div>
</body>
</html>`;

export async function sendEmail(env: AuthEnv, to: string, subject: string, text: string, action?: { label: string; url: string }) {
  const apiKey = required(env.RESEND_API_KEY, 'RESEND_API_KEY');
  const from = required(env.RESEND_FROM_EMAIL, 'RESEND_FROM_EMAIL');
  const logoUrl = `${env.BETTER_AUTH_URL?.trim() || 'https://api.lift.garrett.one'}/email-logo.png`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: action ? `${text}\n\n${action.label}: ${action.url}` : text, html: emailHtml(logoUrl, text, action) }),
  });
  if (!response.ok) throw new Error(`Resend rejected email (${response.status}).`);
}

export function createAuth(env: AuthEnv, ctx?: BackgroundContext) {
  const baseURL = env.BETTER_AUTH_URL?.trim() || 'https://api.lift.garrett.one';
  const trustedOrigins = (env.TRUSTED_ORIGINS || 'https://lift.garrett.one,lift://')
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
      sendVerificationEmail: ({ user, url }) => {
        const verificationURL = new URL(url);
        if (verificationURL.searchParams.get('callbackURL')?.startsWith('lift://')) verificationURL.searchParams.set('callbackURL', `${baseURL}/email-verified`);
        return sendEmail(env, user.email, 'Verify your Lift email', 'Verify this email address to finish creating your Lift account.', { label: 'Verify email', url: verificationURL.toString() });
      },
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
