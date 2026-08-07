# Applied migrations

Ledger of Supabase migrations that have been run in production. One line per
migration. Migrations are applied by pasting the file's SQL into the Supabase
SQL editor (see the `/db-migrate` command); this file records that it's done.

## ⚠ PENDING — 019_case_progress_checklist_detail.sql

**Not applied.** Its code shipped to an auto-deploying `main` on 2026-08-06, one entry
after 018. Until 2026-08-08 that meant every OSCE attempt lost NINE of thirteen columns,
not one: `db.insert_case_result`'s fallback was all-or-nothing, so the unknown
`checklist_detail` column made the rich insert fail and the retry wrote only
`{student_id, case_id, total_score, passed}` — silently, because the exception was
swallowed, the base insert succeeded, and a clean `case_completed` audit event was still
written. Students saw a correct debrief on screen and the row stored a number roughly a
third of it; `caseGrade.ts` then read the missing `grade_scale` as "this attempt predates
OSCE sub-scores" on brand-new attempts, and `osce_analysis.mark_loss` counted the whole
cohort as `excluded_legacy`.

The shedding is now incremental (newest migration layer first), so the code is safe either
way and today's cost is only `checklist_detail` — the per-step ledger the trainer dossier
reads. Applying this migration restores it. **Attempts written between 2026-08-06 and
2026-08-08 are not recoverable**: the sub-scores were never stored.

To apply: paste the contents of `019_case_progress_checklist_detail.sql` into the Supabase
SQL editor (never the file path), then verify with
`select checklist_detail from case_progress limit 1;` and move the line below into the
ledger with today's date.

- [ ] 019_case_progress_checklist_detail.sql — PENDING (`checklist_detail JSONB`; per-step OSCE ledger)

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
- [x] 017_case_progress_scale_marker.sql — applied 2026-08-04 (`checklist_coverage` + `grade_scale` on `case_progress`. The OSCE grade was rescaled from two schemes ×50 to three buckets 40/30/30 earlier the same day, and the two sub-scores persist as bare INTEGERs, so stored rows from the two eras were indistinguishable and the staff Sub-scores column read a rescale as a performance collapse. `grade_scale` 2 = the new buckets; NULL is the ×50 era and is deliberately NOT backfilled, because NULL means "written before the stamp existed", which IS the legacy scale. ⚠ Ordering was load-bearing: `db.insert_case_result`'s fallback is all-or-nothing, so on an unmigrated DB the rich insert fails on the unknown column and retries with only the base four — every attempt would have lost score_100/safe/both sub-scores/missed_critical/coaching, not just the two new columns. Applied before the code shipped)
- [x] 016_leagues.sql — applied 2026-08-01 (promotion-only weekly leagues: `division`/`rank_prev`/`rank_prev_day`/`league_result_seen_week` on `student_profiles`, plus the `league_week` history and `league_seal` idempotency tables. The league shipped dark — every helper in `tools/shared/db.py` swallows the absent table — so the Monday rollover, division scoping, movement arrows and the result screen only went LIVE at this point, one rollover ahead of the first Monday boundary on 2026-08-03 SGT. ⚠ An unapplied 016 is SILENT, not loud: `take_seal` returns False on the missing table and `run_rollover` returns before the `league_rollover_error` audit write, so a quiet `GET /api/admin/audit` never proved the rollover was healthy)
- [x] 018_home_game_loop.sql — applied 2026-08-05 (`daily_state`/`daily_state_date`/`boosts` on `student_profiles`, for the Home game loop: daily quests, the daily chest and timed XP boosts). Shipped dark one day ahead of the migration and stayed safe the whole time — every read tolerates the absent columns, so quests read zero progress, the chest is unclaimable and the boost multiplier stays 1.0. The mechanics only went LIVE at this point. Verified by selecting each of the three columns against prod.
