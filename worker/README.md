# Lift sync Worker

The Worker is a Clerk-authenticated, local-first sync service. The verified
Clerk session JWT `sub` is the D1 user ID, so the same Clerk account has the
same workout history and friend graph on every device. Workout histories are
never returned to another account; friends can only see each other's latest PR.

## Deploy

1. Configure the D1 binding in `wrangler.jsonc` and run `bun install` from the
   repository root.
2. In Clerk Dashboard, copy **API keys → JWT public key → PEM public key** and
   save it as a Worker secret:

   ```sh
   bunx wrangler secret put CLERK_JWT_KEY
   ```

   The Worker validates RS256 signatures locally with Web Crypto. Set these
   optional variables too when available: `CLERK_ISSUER` (exact Clerk issuer)
   and `CLERK_AUTHORIZED_PARTIES` (comma-separated allowed `azp` origins).
3. Apply the schema before deploying:

   ```sh
   bunx wrangler d1 migrations apply lift --remote
   bun run deploy
   ```
4. Configure the mobile app with both its Clerk publishable key and:

   ```sh
   EXPO_PUBLIC_SYNC_API_URL=https://lift-sync.<your-subdomain>.workers.dev
   ```

## Sync API

Every non-OPTIONS request requires `Authorization: Bearer <Clerk session JWT>`.
`POST /v1/session` was intentionally removed; anonymous device tokens cannot
provide cross-device ownership.

- `GET /v1/sync?cursor=<id>&limit=<1..100>` returns the next change page as
  `{ changes, cursor, hasMore, revision }`. New clients start at cursor `0`.
- `POST /v1/sync` accepts `{ batchId, changes }` with at most three mutations.
  The batch ID is idempotent, the chunk is one atomic D1 batch, and each change
  carries the server revision it was based on. A stale edit is ignored and the
  canonical winner is returned by the following pull. Device timestamps are
  domain data only and never decide conflicts.
- Keys are `workoutId`, `workoutId\\u001fexerciseId\\u001fsetNumber`,
  `workoutId\\u001fmuscle`, and
  `workoutId\\u001fexerciseId\\u001faction` for workouts, sets, ratings, and
  recommendation feedback respectively.
- `GET /v1/profile` returns the signed-in user's app profile and optional
  recommendation preferences. `PATCH /v1/profile` accepts `displayName`
  (1–40 characters) and partial `recommendationPreferences`; omitted values are
  preserved and nullable values can be cleared with `null`. Similar-user
  comparisons require explicit opt-in and at least five exactly matched peers.
- `GET /v1/friends` returns `{ friends: { count, users } }`; friend users
  include their app display name and initial Clerk profile image.
- `GET /v1/friends/prs` returns at most one recent max-weight personal record
  per friend; it never exposes workout or set history.
- `GET /v1/friends/code` and `POST /v1/friends` manage six-character alphanumeric friend codes.
- `GET /v1/export` returns a portable JSON copy of the signed-in user's profile,
  workouts, ratings, recommendation feedback, and friend connections.
- `DELETE /v1/account` deletes the authenticated user's D1 parent row; foreign
  keys cascade through all app data. It returns success when already deleted so
  the client can safely retry before deleting the Clerk identity.

## Privacy and account deletion

The Worker serves public `/privacy`, `/terms`, `/support`, and `/delete-account`
pages. Set `SUPPORT_EMAIL` to a monitored mailbox before release. The web form
stores retry-safe requests in `account_deletion_requests`; operations should
verify the account email in Clerk, delete the Clerk user and D1 user row, mark
the request `completed`, and purge completed request records within 30 days.

Pre-Clerk anonymous rows are preserved in D1 but deliberately not linked to a
Clerk account: automatically assigning a legacy device's data to an account
would be an account-takeover risk. A future explicit, authenticated migration
can offer users a one-time import path.
