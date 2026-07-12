-- 009_lumens.sql — lifetime Lumens counter (monotonic). The `xp` column stays the
-- spendable balance (relabelled "Lumens" in the UI); coins_earned only ever increases,
-- so a quit-penalty that lowers the balance never removes an earned home badge.
-- Two statements; no IF NOT EXISTS on the constraint (Postgres 42601).
ALTER TABLE student_profiles ADD COLUMN coins_earned bigint NOT NULL DEFAULT 0;
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_coins_earned_nonneg CHECK (coins_earned >= 0);
