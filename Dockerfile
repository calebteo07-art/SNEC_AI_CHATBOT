# ── Stage 1: Build React frontend ──────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Install deps first (layer-cached unless package files change)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --prefer-offline

# Copy source and build
COPY frontend/ ./
RUN npm run build


# ── Stage 2: Python runtime ────────────────────────────────
FROM python:3.12-slim

# Security: run as non-root user
RUN groupadd -r eyebot && useradd -r -g eyebot eyebot

WORKDIR /app

# Install Python deps (cached layer)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY tools/ ./tools/
COPY cases/ ./cases/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Switch to non-root
USER eyebot

EXPOSE 8000

# Graceful shutdown on SIGTERM (Koyeb/Fly send SIGTERM)
CMD ["uvicorn", "tools.api.server:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--timeout-graceful-shutdown", "10"]
