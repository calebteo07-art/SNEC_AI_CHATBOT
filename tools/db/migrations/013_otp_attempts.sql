-- Migration 013: OTP brute-force lockout.
-- Run via Supabase SQL editor or: supabase db push
--
-- A password-reset code is 6 digits (1e6 combinations). The per-IP endpoint throttle
-- (reset-password is 5/min) does not stop an attacker rotating source IPs, so `attempts`
-- counts wrong guesses per email: verify_and_consume_otp bumps it on each miss and burns
-- the code (deletes the row) on the _MAX_ATTEMPTS-th wrong guess, independent of IP. A
-- fresh request-reset resets it to 0. The application degrades gracefully until this
-- migration is applied: set_otp stores the code without `attempts` and the wrong-guess
-- increment is a guarded no-op, so the reset flow keeps working and falls back to the
-- per-IP throttle alone.

ALTER TABLE password_reset_otps
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
