#!/usr/bin/env bash
set -e

pip install -r requirements.txt

# Back up the pre-built SPA committed to git
if [ -d "frontend/dist" ]; then
    echo "==> Backing up pre-built frontend/dist/ from git..."
    cp -r frontend/dist /tmp/frontend_dist_backup
fi

# Try npm build — best-effort; the committed dist/ is the fallback
if (cd frontend && npm ci && npm run build); then
    echo "==> npm build succeeded"
else
    echo "==> npm build failed — restoring pre-built frontend/dist/ from git"
    if [ -d "/tmp/frontend_dist_backup" ]; then
        rm -rf frontend/dist
        cp -r /tmp/frontend_dist_backup frontend/dist
        echo "==> Restored frontend/dist/ from git backup"
    fi
fi
