# EyeBot — frontend

The Next.js 16 app (App Router, `output: standalone`) that students and staff
actually see. It is **not** a standalone project: in development and in
production it proxies `/api/*` and `/health*` to the FastAPI backend, so running
it alone gives you pages with no data.

Start here instead:

- [`../README.md`](../README.md) — what the app is, and how to run both halves
- [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — how the two processes fit together
- [`../docs/OPERATIONS.md`](../docs/OPERATIONS.md) — deploying and operating it

## Working in this directory

```bash
npm ci            # never `npm install` — see the warning in ../README.md
npm run dev       # needs the API on :8000 to show real data
npm run typecheck # tsc --noEmit
npm run build     # production build; CI gates this
```

Browser and logic harnesses live in `tests/`. Run them through
`bash ../scripts/start-harness.sh all` rather than `next start`, which is flaky
against the standalone output. CI discovers and runs every browser harness.

## Layout

```
src/aurora/    the design system — tokens, motion, shared components
src/screens/   top-level screens (login/onboarding, tutor, station, admin)
src/lib/       client helpers (nav, fetch wrappers, formatting)
public/        static assets, brand imagery, patient portraits
tests/         Node logic harnesses + Playwright browser harnesses
```

Settled UI decisions are recorded in [`../docs/design-locks.md`](../docs/design-locks.md).
Refine within a lock and name the criterion you are changing; do not silently
rebuild a locked surface.
