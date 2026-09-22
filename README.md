# Lift

Lift is a local-first Expo workout app backed by a Clerk-authenticated
Cloudflare Worker and D1 database. The repository contains the complete system
as two independently deployable Bun packages:

- `mobile/` — Expo app and EAS configuration
- `worker/` — Cloudflare Worker, D1 migrations, and regression tests
- `docs/` — shared product and engineering documentation

## Setup

Install the Bun version declared in each package's `package.json`, then install
each exact dependency graph from its committed lockfile:

```sh
cd mobile && bun install --frozen-lockfile
cd ../worker && bun install --frozen-lockfile
```

Copy `mobile/.env.example` to `mobile/.env` and provide the local values. Start
each service from its package directory:

```sh
cd mobile && bun run start
cd worker && bun run dev
```

Run each package's static checks and regression tests with:

```sh
cd mobile && bun run check
cd worker && bun run check
```

## Deploy

Build the app from `mobile/` with EAS:

```sh
cd mobile
bunx eas-cli build --profile production --platform all
```

Configure the Worker secrets and D1 binding described in `worker/README.md`,
then apply migrations and deploy:

```sh
cd worker
bunx wrangler d1 migrations apply lift --remote
bun run deploy
```
