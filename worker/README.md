# Lift API and authentication Worker

This Cloudflare Worker owns Lift authentication and the local-first sync API at
`api.lift.garrett.one`. Better Auth stores users, sessions, email verification,
password reset, rate limits, TOTP, email OTP, backup codes, and MFA lockout in
the same D1 database as profiles, workouts, recommendations, and friends.

## Production configuration

Set the Worker secrets; do not commit their values:

```sh
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put BETTER_AUTH_SECRETS
bunx wrangler secret put RESEND_API_KEY
bunx wrangler secret put RESEND_FROM_EMAIL
bunx wrangler secret put SUPPORT_EMAIL
```

For local development, copy `.dev.vars.example` to `.dev.vars`; Wrangler loads
that ignored file without exposing the values to the client bundles.

Generate `BETTER_AUTH_SECRET` with `openssl rand -base64 32`. Versioned secrets
use `version:value` entries with the current version first, for example
`2:<current>,1:<previous>`; retain the previous value while encrypted MFA state
is being rotated. Configure these non-secret values in production:

```text
BETTER_AUTH_URL=https://api.lift.garrett.one
TRUSTED_ORIGINS=https://lift.garrett.one,mobile://
```

In Resend, verify `lift.garrett.one` (or the exact sending domain) and use a
sender such as `Lift <auth@lift.garrett.one>`. Then deploy:

```sh
bun install
bun run check
bunx wrangler d1 migrations apply liftdb --remote
bun run deploy
```

The mobile app uses `EXPO_PUBLIC_API_URL=https://api.lift.garrett.one`. The web
app uses `VITE_API_URL=https://api.lift.garrett.one`.

## Authentication

Better Auth is mounted at `/api/auth/*`. Email/password accounts sign in on
signup and receive a verification email; clients prompt until it is verified.
TOTP is the recommended second factor; Resend
email OTP and single-use backup codes are supported fallbacks. Protected
`/v1/*` routes accept only a valid Better Auth session cookie. Browser requests
must come from a configured trusted origin; the Worker never uses wildcard
credentialed CORS.

Clients delete accounts through Better Auth's `/api/auth/delete-user` endpoint,
which also cascades the existing app-owned `users` row and all related data.
`DELETE /v1/account` is intentionally retired.

## App API

- `GET /v1/sync?cursor=<id>&limit=<1..100>` pulls incremental changes.
- `POST /v1/sync` pushes an idempotent batch of at most three mutations.
- `GET|PATCH /v1/profile` reads or updates the current user's private profile.
- `GET /v1/recommendations` returns private/cohort recommendations.
- `GET /v1/friends`, `GET /v1/friends/prs`, `GET /v1/friends/code`, and
  `POST /v1/friends` manage the limited friend surface.
- `GET /v1/export` returns a portable account export.
- `POST /v1/onboarding` saves onboarding preferences.

Public `/privacy`, `/terms`, `/support`, and `/delete-account` pages remain
available. The deletion request form records a retry-safe support request; it
does not replace authenticated in-app deletion.

Legacy pre-Better-Auth rows cannot be auto-linked safely because D1 does not
store an email-to-old-provider-ID mapping. If production Clerk users already
exist, export that mapping and run an explicit account migration before launch.
