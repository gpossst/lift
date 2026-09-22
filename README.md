# Lift

Lift is a local-first Expo workout app backed by a Clerk-authenticated
Cloudflare Worker and D1 database. The repository is a Bun workspace containing
the complete system:

- `mobile/` — Expo app and EAS configuration
- `worker/` — Cloudflare Worker, D1 migrations, and regression tests
- `docs/` — shared product and engineering documentation

## Setup

Install the Bun version declared in `package.json`, then install the exact
dependency graph from the committed lockfile:

```sh
bun install --frozen-lockfile
```

Copy `mobile/.env.example` to `mobile/.env` and provide the local values. Start
either service from the repository root:

```sh
bun run mobile
bun run worker
```

Run all static checks and regression tests with:

```sh
bun run check
```

## Deploy

Build the app from `mobile/` with EAS:

```sh
cd mobile
bunx eas-cli build --profile production --platform all
```

Configure the Worker secrets and D1 binding described in `worker/README.md`,
then apply migrations and deploy from the repository root:

```sh
cd worker
bunx wrangler d1 migrations apply lift --remote
cd ..
bun run deploy:worker
```
