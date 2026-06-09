#!/usr/bin/env bash
set -e

pip install -r requirements.txt

# Back up the pre-built static export committed to git
if [ -d "chinita/out" ]; then
    echo "==> Backing up pre-built chinita/out/ from git..."
    cp -r chinita/out /tmp/chinita_out_backup
fi

# Try npm build — best-effort, Node version may be incompatible
if (cd chinita && npm ci && npm run build); then
    echo "==> npm build succeeded"
else
    echo "==> npm build failed — restoring pre-built chinita/out/ from git"
    if [ -d "/tmp/chinita_out_backup" ]; then
        rm -rf chinita/out
        cp -r /tmp/chinita_out_backup chinita/out
        echo "==> Restored chinita/out/ from git backup"
    fi
fi
