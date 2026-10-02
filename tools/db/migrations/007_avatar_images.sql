-- Migration 007: Selena 3D-portrait cache (RICOE v2 Foundation 2 · part 3)
--
-- One row per DISTINCT character look, keyed by config_hash (the deterministic
-- sha256[:16] over the portrait axes — background excluded, since it's a CSS
-- backdrop). status tracks the async generate-on-save lifecycle:
--   pending → a render is in flight (BackgroundTasks); ready → image_url is live;
--   failed  → generation errored (a later save retries).
-- The app degrades gracefully until this is applied: the portrait endpoints treat
-- a missing table as "no cache" and simply fall back to the instant SVG <Selena>.
-- Apply via the /db-migrate skill (paste this SQL into the Supabase SQL editor).

CREATE TABLE IF NOT EXISTS avatar_images (
  config_hash TEXT PRIMARY KEY,
  image_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on with no policy: anon/authenticated get nothing; the backend's service-role key
-- bypasses it. Added 2026-10-02 so a rebuild matches production, which already had RLS
-- on this table (schema-only pg_dump, 2026-10-02) — a no-op there.
ALTER TABLE avatar_images ENABLE ROW LEVEL SECURITY;
