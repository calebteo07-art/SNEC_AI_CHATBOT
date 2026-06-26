#!/usr/bin/env bash
# Generate a fully reproducible, hash-pinned lockfile from requirements.txt.
#
# MUST run on the same Python as production (3.12) so the resolved wheels match
# the runtime — running it on a different minor version can pin packages that
# have no wheel for 3.12 and break the deploy.
#
# Usage:  python3.12 -m pip install pip-tools && scripts/lock-deps.sh
# Then point render-build.sh at requirements.lock to install pinned.
set -euo pipefail

PYVER="$(python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if [[ "$PYVER" != "3.12" ]]; then
  echo "WARNING: locking on Python $PYVER but production runs 3.12." >&2
  echo "         Resolved versions may not match the runtime. Continue? (Ctrl-C to abort)" >&2
  sleep 3
fi

pip-compile \
  --generate-hashes \
  --output-file requirements.lock \
  requirements.txt

echo "Wrote requirements.lock (hash-pinned). Commit it and install with:"
echo "  pip install --require-hashes -r requirements.lock"
