# Applied migrations

Ledger of Supabase migrations that have been run in production. One line per
migration. Migrations are applied by pasting the file's SQL into the Supabase
SQL editor (see the `/db-migrate` command); this file records that it's done.

- [x] 006_avatar.sql — applied 2026-07-06
- [x] 007_avatar_images.sql — applied 2026-07-06 (Selena 3D-portrait cache; public bucket `selena-avatars` also created)
- [x] 008_leaderboard_visibility.sql — applied 2026-07-07 (D7 leaderboard live: `leaderboard_hidden` + `display_name`)
- [ ] 009_lumens.sql — **PENDING APPLICATION** (lifetime `coins_earned` counter for the Lumens rework; coordinate Supabase SQL editor apply with deploy)
- [x] 010_flashcard_attempts.sql — applied 2026-07-14 (per-card flashcard grading log for Analytics per-topic accuracy)
- [x] 011_case_progress_grade.sql — applied 2026-07-14 (rich OSCE-grade columns on case_progress: score_100/safe/consult_technique/judgement_safety/missed_critical/coaching)
- [ ] 012_weekly_leaderboard.sql — **PENDING APPLICATION** (`xp_week` + `xp_week_start` tally so the leaderboard ranks by XP earned this week and refreshes every Monday; the board falls back to lifetime-XP ranking and the tally write is a guarded no-op until applied)
- [x] 013_otp_attempts.sql — applied 2026-07-23 (`attempts` counter on `password_reset_otps`; per-email OTP brute-force lockout, burns the code after 5 wrong guesses — now live)
- [x] 014_audit_events.sql — applied 2026-07-23 (durable `audit_events` table; the admin privilege-lifecycle, auth-surface, and guardrail input-block audit trails are now LIVE and persisting)
- [ ] 015_flashcard_deck_progress.sql — **PENDING APPLICATION** (`flashcard_deck_progress` records which of a topic's 5 curated decks a student has cleared; drives the "3/5" counter and the stop-paying-Lumens cap. Until applied every student reads as 0 decks cleared: they always get deck 1 and always earn — it fails toward earning, never toward a lockout)
