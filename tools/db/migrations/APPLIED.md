# Applied migrations

Ledger of Supabase migrations that have been run in production. One line per
migration. Migrations are applied by pasting the file's SQL into the Supabase
SQL editor (see the `/db-migrate` command); this file records that it's done.

⚠ **Attempts submitted between 2026-08-06 and 2026-08-08 are permanently thin.** 019's code
shipped to an auto-deploying `main` two days before its ALTER was run, and the old
all-or-nothing fallback in `db.insert_case_result` turned that one unknown column into the
loss of NINE: the rich insert failed and the retry wrote only
`{student_id, case_id, total_score, passed}`. Silent by construction — the exception was
swallowed, the base insert succeeded, and a clean `case_completed` audit event was still
written. Students saw a correct debrief while the row stored roughly a third of it;
`caseGrade.ts` read the missing `grade_scale` as "predates OSCE sub-scores" on brand-new
attempts, and `osce_analysis.mark_loss` counted the whole cohort as `excluded_legacy`.
Those sub-scores were never stored, so they cannot be recovered. Shedding is now
incremental (newest migration layer first), so an unapplied migration can only ever cost
its own columns again.

- [–] 000_base_schema.sql — **never run against production, and must not be.** Production
  already contains every object in it: the 12 tables, the `vector` extension, the
  `semantic_search` function, the `UNIQUE (lower(email))` index and the two storage
  buckets were all created by hand in the Supabase dashboard during 2026 and never
  captured in SQL. This file was written on 2026-08-28 by reading the live schema back
  out through PostgREST, so that a NEW database can be built from source. Its purpose is
  rebuild and staging, not migration. Every statement is `IF NOT EXISTS` / `ON CONFLICT
  DO NOTHING`, so running it against production would be a no-op — but it would also
  prove nothing, because a no-op cannot tell you whether the reconstruction is faithful.
  Only `pg_dump --schema-only` can settle that; see `tools/db/REBUILD.md`.
- [?] 001–005 — **live but unledgered.** These ran before this file existed, so there is
  no record of when. Their objects are present in production (`flashcards`,
  `leaderboard_settings`, the indexes, the CHECK constraints and the
  streak/XP columns all appear in `tools/db/SCHEMA-REFERENCE.md`), which is the evidence
  that they were applied — not a ledger entry. Do not treat the absence of a date here
  as an unapplied migration.
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
- [x] 019_case_progress_checklist_detail.sql — applied 2026-08-08 (`checklist_detail JSONB` on `case_progress`: the per-step OSCE ledger — which steps were performed, which skipped, which critical, in the station's own phase grouping. `compute_station_score` had always built it and thrown it away, so the most teachable artefact the platform produces was destroyed at the end of every attempt and no trainer could reconstruct a run. Verified against prod with `select checklist_detail from case_progress limit 1`. Deliberately NOT backfilled: the per-step record is not recoverable from anything that was stored, and inventing one would assert a record we cannot verify — the same reasoning 017 records for `grade_scale`. NULL means "this attempt predates the column", never "performed no steps". ⚠ Shipped to `main` on 2026-08-06, TWO DAYS ahead of this ALTER, and under the then all-or-nothing insert fallback that cost every attempt nine columns rather than one — see the note at the top of this file. Ordering was load-bearing and was got wrong; the fallback is now incremental so the class of failure is closed)
