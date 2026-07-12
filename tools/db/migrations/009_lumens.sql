-- 009_lumens.sql — lifetime Lumens counter (monotonic). `xp` stays the spendable
-- balance (relabelled "Lumens" in the UI); coins_earned only ever increases, so a
-- quit-penalty that lowers the balance never removes an earned home badge.
-- Backfill from xp so existing students keep their true lifetime total.
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS coins_earned bigint NOT NULL DEFAULT 0;
UPDATE student_profiles SET coins_earned = xp WHERE coins_earned = 0;
ALTER TABLE student_profiles ADD CONSTRAINT student_profiles_coins_earned_nonneg CHECK (coins_earned >= 0);
