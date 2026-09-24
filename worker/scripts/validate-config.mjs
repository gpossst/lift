import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const secrets = JSON.parse(execFileSync('bunx', ['wrangler', 'secret', 'list', '--format', 'json'], { encoding: 'utf8' }));
const secretNames = new Set(secrets.map(({ name }) => name));
const rateLimits = new Set((config.ratelimits ?? []).map(({ name }) => name));
const missing = [];

if (!config.d1_databases?.some(({ binding }) => binding === 'DB')) missing.push('D1 binding DB');
for (const name of ['DELETION_RATE_LIMITER', 'SYNC_RATE_LIMITER', 'EXPENSIVE_RATE_LIMITER']) if (!rateLimits.has(name)) missing.push(`rate-limit binding ${name}`);
for (const name of ['BETTER_AUTH_URL', 'TRUSTED_ORIGINS']) if (!config.vars?.[name]?.trim()) missing.push(`variable ${name}`);
for (const name of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL']) if (!secretNames.has(name)) missing.push(`secret ${name}`);
if (!secretNames.has('BETTER_AUTH_SECRET') && !secretNames.has('BETTER_AUTH_SECRETS')) missing.push('secret BETTER_AUTH_SECRET or BETTER_AUTH_SECRETS');

if (missing.length) {
  console.error(`Deployment configuration is incomplete:\n- ${missing.join('\n- ')}`);
  process.exit(1);
}
console.log('Deployment configuration is complete.');
