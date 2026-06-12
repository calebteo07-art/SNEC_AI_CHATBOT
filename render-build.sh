#!/usr/bin/env bash
# Build must fail loudly — with a Node server in the topology, serving a stale
# committed bundle is worse than a failed deploy (frontend/dist is no longer
# committed as of PHOTOPIC Phase 0).
set -e

pip install -r requirements.txt

cd frontend
npm ci
npm run build

# The standalone server only serves public/ and .next/static if they're
# copied in beside it (Next leaves them out, assuming a CDN handles them).
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
