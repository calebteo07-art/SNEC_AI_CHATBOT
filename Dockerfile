# ── Python runtime ────────────────────────────────────────────
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

# Copy pre-built Next.js static export (chinita/out/ is committed to git)
COPY chinita/out/ ./chinita/out/

# Pre-create writable directories
RUN mkdir -p /app/.tmp && chown -R eyebot:eyebot /app/.tmp

# Switch to non-root
USER eyebot

EXPOSE 8000

CMD ["uvicorn", "tools.api.server:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--timeout-graceful-shutdown", "10"]
