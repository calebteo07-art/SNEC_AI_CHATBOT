# ── Frontend build (Next 16 standalone) ──────────────────────
FROM node:24-slim AS frontend-build

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build \
 && cp -r public .next/standalone/public \
 && mkdir -p .next/standalone/.next \
 && cp -r .next/static .next/standalone/.next/static

# ── Python + Node runtime ─────────────────────────────────────
FROM python:3.12-slim

# Node 24 for the Next standalone server (single-container topology)
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# Security: run as non-root user
RUN groupadd -r eyebot && useradd -r -g eyebot eyebot

WORKDIR /app

# Install Python deps (cached layer)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY tools/ ./tools/
COPY cases/ ./cases/
COPY scripts/start-prod.sh ./scripts/start-prod.sh

# Copy the self-contained Next server (includes traced node_modules)
COPY --from=frontend-build /build/frontend/.next/standalone ./frontend/.next/standalone

# Media library at the repo-canonical path: FastAPI serves /api/media/manifest
# from here, and the Celery media worker regenerates it in place (hence chown).
# Next serves the user-facing /media/* from its own standalone public/ copy.
COPY --from=frontend-build /build/frontend/public/media ./frontend/public/media

# Pre-create writable directories
RUN mkdir -p /app/.tmp && chown -R eyebot:eyebot /app/.tmp /app/frontend/public/media

# Switch to non-root
USER eyebot

EXPOSE 3000

CMD ["bash", "scripts/start-prod.sh"]
