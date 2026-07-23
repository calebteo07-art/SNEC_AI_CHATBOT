-- Migration 014: durable audit trail for privilege-lifecycle events.
-- Run via the /db-migrate skill or the Supabase SQL editor.
--
-- The only audit primitive today (tools/shared/audit_log.py) appends to a local
-- .tmp/audit_log.jsonl file — which on Render is ephemeral (wiped every redeploy /
-- restart / keep-alive cycle), per-worker (records fragment), and unqueryable (the
-- only read path slurps the whole file). This table is the durable, queryable trail a
-- multi-institution rollout needs for security / compliance / forensics. First writers
-- are the admin privilege-lifecycle actions (approve student, create staff, promote,
-- demote, unapprove) — which previously mutated access/authority with ZERO attribution
-- (upsert_supervisor / delete_supervisor / delete_approved record no who/when).
--
-- The app degrades gracefully until this migration is applied: db.insert_audit_event is
-- best-effort and swallows a missing-table error, so every admin action keeps working
-- and simply records nothing yet.

CREATE TABLE IF NOT EXISTS audit_events (
  audit_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor      TEXT NOT NULL DEFAULT 'system',   -- who did it (JWT sub / email)
  action     TEXT NOT NULL,                    -- what happened: promote, demote, unapprove_student, ...
  target     TEXT NOT NULL DEFAULT '',         -- whom/what it affected (email / id)
  feature    TEXT NOT NULL DEFAULT 'admin',    -- subsystem
  detail     TEXT NOT NULL DEFAULT '',         -- extra context (role, reason) — no PII
  ip         TEXT                              -- request client IP (X-Forwarded-For), nullable
);

-- Chronological scan (the audit viewer's default) + per-actor / per-target lookups.
CREATE INDEX IF NOT EXISTS idx_audit_events_ts     ON audit_events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor  ON audit_events(actor);
CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target);

-- Append-only audit: enable RLS with NO permissive policy, so anon/authenticated (anon
-- key) callers get zero access. The service-role key the backend uses bypasses RLS and
-- is the only reader/writer. Deliberately no CREATE POLICY — deny-by-default is correct
-- for an audit log, and it sidesteps the guarded-policy syntax pitfall (PG 42601).
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
