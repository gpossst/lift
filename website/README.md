# Lift website

A minimal TanStack Start site for `lift.garrett.one`, deployed to Railway as a
Docker container. Better Auth handles account actions through the Lift API.

Copy `.env.example` to `.env` to set `VITE_API_URL`. It defaults to
`https://api.lift.garrett.one`; the website only needs this public API URL and
does not store authentication secrets.

```bash
bun install
bun --bun run dev
```

Build the production app with:

```bash
bun --bun run build
```

This emits a self-contained Node server in `.output` via Nitro. Run it with:

```bash
bun run start
```

## Deploy to Railway

The `Dockerfile` builds the Nitro Node output and serves it with `node`:

1. Create a Railway service from this repository and set its root directory to
   `website`. Railway detects the `Dockerfile` and builds it.
2. Add the custom domain `lift.garrett.one` to the service.
3. Set `VITE_API_URL` as a build variable if the API is hosted somewhere other
   than `https://api.lift.garrett.one`.

The container listens on `$PORT` (Railway injects it) and falls back to `3000`
locally. Build and run it directly with:

```bash
docker build -t lift-website .
docker run -p 3000:3000 lift-website
```

The existing sync API should use `api.lift.garrett.one`; this website owns the
entire `lift.garrett.one` hostname.
