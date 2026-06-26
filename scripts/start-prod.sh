#!/usr/bin/env bash
# Single-container production topology (PHOTOPIC Phase 0):
#   FastAPI   — internal only, 127.0.0.1:8000
#   Next.js   — public process on $PORT, proxies /api/* and /health to FastAPI
#               via next.config.ts rewrites (same-origin: cookies + SSE intact)
set -e

# Workers default to 1 (safe on a 512MB instance); raise WEB_CONCURRENCY on a
# larger plan. State that must be shared across workers (rate-limit counters)
# lives in Redis when REDIS_URL is set — see tools/api/shared.py.
uvicorn tools.api.server:app \
  --host 127.0.0.1 --port 8000 \
  --workers "${WEB_CONCURRENCY:-1}" \
  --timeout-graceful-shutdown 10 &
API_PID=$!

PORT="${PORT:-3000}" HOSTNAME="0.0.0.0" node frontend/.next/standalone/server.js &
WEB_PID=$!

trap 'kill -TERM "$API_PID" "$WEB_PID" 2>/dev/null' TERM INT

# Either process dying takes the service down so the platform restarts it.
wait -n
EXIT_CODE=$?
kill -TERM "$API_PID" "$WEB_PID" 2>/dev/null || true
exit $EXIT_CODE
