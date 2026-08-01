# Applied migrations

Ledger of Supabase migrations that have been run in production. One line per
migration. Migrations are applied by pasting the file's SQL into the Supabase
SQL editor (see the `/db-migrate` command); this file records that it's done.

- [x] 006_avatar.sql — applied 2026-07-06
- [x] 007_avatar_images.sql — applied 2026-07-06 (Selena 3D-portrait cache; public bucket `selena-avatars` also created)
- [x] 008_leaderboard_visibility.sql — applied 2026-07-07 (D7 leaderboard live: `leaderboard_hidden` + `display_name`)
- [x] 009_lumens.sql — applied 2026-07-30 (lifetime monotonic `coins_earned` counter for the Lumens rework, backfilled from `xp`; a quit-penalty can no longer strip an earned home badge)
- [x] 010_flashcard_attempts.sql — applied 2026-07-14 (per-card flashcard grading log for Analytics per-topic accuracy)
- [x] 011_case_progress_grade.sql — applied 2026-07-14 (rich OSCE-grade columns on case_progress: score_100/safe/consult_technique/judgement_safety/missed_critical/coaching)
- [x] 012_weekly_leaderboard.sql — applied 2026-07-30 (`xp_week` + `xp_week_start`; the leaderboard now ranks by XP earned this week and refreshes every Monday SGT, instead of falling back to lifetime XP)
- [x] 013_otp_attempts.sql — applied 2026-07-23 (`attempts` counter on `password_reset_otps`; per-email OTP brute-force lockout, burns the code after 5 wrong guesses — now live)
- [x] 014_audit_events.sql — applied 2026-07-23 (durable `audit_events` table; the admin privilege-lifecycle, auth-surface, and guardrail input-block audit trails are now LIVE and persisting)
- [x] 015_flashcard_deck_progress.sql — applied 2026-07-30 (`flashcard_deck_progress` records which of a topic's 5 curated decks a student has cleared; the x/5 counter and the stop-paying-Lumens cap are now LIVE and persisting)
- [x] 016_leagues.sql — applied 2026-08-01 (promotion-only weekly leagues: `division`/`rank_prev`/`rank_prev_day`/`league_result_seen_week` on `student_profiles`, plus the `league_week` history and `league_seal` idempotency tables. The league shipped dark — every helper in `tools/shared/db.py` swallows the absent table — so the Monday rollover, division scoping, movement arrows and the result screen only went LIVE at this point, one rollover ahead of the first Monday boundary on 2026-08-03 SGT. ⚠ An unapplied 016 is SILENT, not loud: `take_seal` returns False on the missing table and `run_rollover` returns before the `league_rollover_error` audit write, so a quiet `GET /api/admin/audit` never proved the rollover was healthy)
