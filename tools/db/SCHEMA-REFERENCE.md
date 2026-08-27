# EyeBot — production schema, as far as the REST API exposes it

**Snapshot taken 2026-08-27.** Generated from the PostgREST OpenAPI description
of the live Supabase project, using only `SUPABASE_SERVICE_ROLE_KEY`. Read-only;
no table rows were fetched, so nothing here is personal data.

**It will drift.** This is a point-in-time reference, not a source of truth — the
database is. Regenerate it, or better, replace it with a real `pg_dump`, rather
than editing it by hand.

**Related files in this directory:**

| File | What it gives you |
|---|---|
| `export_schema.sql` | Read-only queries that show the live schema in full — constraints, indexes, policies, functions |
| `generate_ddl.sql` | Makes Postgres emit the `CREATE TABLE` statements as copyable SQL |
| `migrations/` | The 19 hand-applied migrations, and `APPLIED.md` recording which ran |

## !! THIS CANNOT REBUILD THE DATABASE !!

PostgREST describes columns and types. It does NOT describe:

- indexes (including the vector index on chunks.embedding)
- CHECK constraints, or which UNIQUE indexes exist
  (notably UNIQUE(lower(email)) on student_consent)
- row-level-security policies
- stored functions — semantic_search() is invisible here
- extensions, or the pgvector embedding dimension
- storage buckets

Only `pg_dump --schema-only` produces a file that can recreate this
database. This document is a reference, not a backup.

Tables described: **20**

## approved_students

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `email` | text | yes |  | **PK** |
| `full_name` | text | yes |  |  |
| `role` | text | yes |  |  |
| `added_by` | text | yes |  |  |
| `added_at` | timestamp with time zone |  |  |  |
| `student_id` | uuid |  |  |  |

## audit_events

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `audit_id` | uuid | yes | gen_random_uuid() | **PK** |
| `ts` | timestamp with time zone | yes | now() |  |
| `actor` | text | yes | system |  |
| `action` | text | yes |  |  |
| `target` | text | yes |  |  |
| `feature` | text | yes | admin |  |
| `detail` | text | yes |  |  |
| `ip` | text |  |  |  |

## avatar_images

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `config_hash` | text | yes |  | **PK** |
| `image_url` | text |  |  |  |
| `status` | text | yes | pending |  |
| `updated_at` | timestamp with time zone | yes | now() |  |

## case_progress

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | int64 | yes |  | **PK** |
| `student_id` | uuid | yes |  |  |
| `case_id` | text | yes |  |  |
| `total_score` | int32 | yes | 0 |  |
| `passed` | boolean | yes | False |  |
| `completed_at` | timestamp with time zone | yes | now() |  |
| `score_100` | int32 |  |  |  |
| `safe` | boolean |  |  |  |
| `consult_technique` | int32 |  |  |  |
| `judgement_safety` | int32 |  |  |  |
| `missed_critical` | jsonb |  |  |  |
| `coaching` | jsonb |  |  |  |
| `checklist_coverage` | int32 |  |  |  |
| `grade_scale` | int32 |  |  |  |
| `checklist_detail` | jsonb |  |  |  |

## chat_sessions

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `session_id` | uuid | yes | gen_random_uuid() | **PK** |
| `student_id` | uuid | yes |  |  |
| `created_at` | timestamp with time zone | yes | now() |  |
| `topic` | text | yes |  |  |
| `summary` | text | yes |  |  |
| `token_count` | int32 | yes | 0 |  |
| `model` | text | yes |  |  |

## checklists

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() | **PK** |
| `document_id` | uuid | yes |  | FK  ->documents .id |
| `checklist_type` | text | yes |  |  |
| `procedure_name` | text | yes |  |  |
| `module` | int32 | yes |  |  |
| `steps` | jsonb | yes |  |  |
| `total_steps` | int32 |  |  |  |
| `created_at` | timestamp with time zone |  | now() |  |

## chunks

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() | **PK** |
| `document_id` | uuid | yes |  | FK  ->documents .id |
| `chunk_index` | int32 | yes |  |  |
| `page_start` | int32 |  |  |  |
| `page_end` | int32 |  |  |  |
| `text` | text | yes |  |  |
| `token_count` | int32 |  |  |  |
| `embedding` | public.vector(1536) |  |  |  |
| `created_at` | timestamp with time zone |  | now() |  |

## documents

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() | **PK** |
| `filename` | text | yes |  |  |
| `module` | int32 | yes |  |  |
| `category` | text | yes |  |  |
| `title` | text | yes |  |  |
| `page_count` | int32 |  |  |  |
| `ingested_at` | timestamp with time zone |  | now() |  |

## flashcard_attempts

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `attempt_id` | uuid | yes | gen_random_uuid() | **PK** |
| `student_id` | uuid | yes |  | FK  ->student_profiles .student_id |
| `card_id` | text |  |  |  |
| `topic_tag` | text | yes | general |  |
| `correct` | boolean | yes | False |  |
| `score` | int32 | yes | 0 |  |
| `ts` | timestamp with time zone | yes | now() |  |

## flashcard_deck_progress

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `student_id` | uuid | yes |  | **PK** FK  ->student_profiles .student_id |
| `topic_key` | text | yes |  | **PK** |
| `level` | int32 | yes |  | **PK** |
| `completed_at` | timestamp with time zone | yes | now() |  |

## flashcards

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `card_id` | uuid | yes | gen_random_uuid() | **PK** |
| `student_id` | uuid | yes |  | FK  ->student_profiles .student_id |
| `topic_tag` | text | yes | general |  |
| `front` | text | yes |  |  |
| `back` | text | yes |  |  |
| `repetitions` | int32 | yes | 0 |  |
| `easiness` | double precision | yes | 2.5 |  |
| `interval_days` | int32 | yes | 0 |  |
| `next_due` | date | yes | CURRENT_DATE |  |
| `last_reviewed` | timestamp with time zone |  |  |  |
| `source` | text | yes | session |  |
| `created_at` | timestamp with time zone | yes | now() |  |

## images

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | yes | gen_random_uuid() | **PK** |
| `document_id` | uuid | yes |  | FK  ->documents .id |
| `page_number` | int32 | yes |  |  |
| `image_index` | int32 | yes |  |  |
| `drive_file_id` | text |  |  |  |
| `drive_url` | text |  |  |  |
| `width_px` | int32 |  |  |  |
| `height_px` | int32 |  |  |  |
| `created_at` | timestamp with time zone |  | now() |  |

## leaderboard_settings

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `cohort` | text | yes |  | **PK** |
| `enabled` | boolean | yes | False |  |
| `updated_at` | timestamp with time zone | yes | now() |  |

## league_seal

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `key` | text | yes |  | **PK** |
| `sealed_at` | timestamp with time zone | yes | now() |  |

## league_week

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `student_id` | text | yes |  | **PK** |
| `week_start` | date | yes |  | **PK** |
| `division` | int32 | yes | 1 |  |
| `xp_final` | int32 | yes | 0 |  |
| `rank_final` | int32 |  |  |  |
| `outcome` | text |  |  |  |
| `created_at` | timestamp with time zone | yes | now() |  |

## password_reset_otps

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `email` | text | yes |  | **PK** |
| `otp_hash` | text | yes |  |  |
| `expires_at` | timestamp with time zone | yes |  |  |
| `created_at` | timestamp with time zone | yes | now() |  |
| `attempts` | int32 | yes | 0 |  |

## student_auth

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `email` | text | yes |  | **PK** |
| `password_hash` | text | yes |  |  |
| `must_change` | boolean | yes | True |  |
| `created_at` | timestamp with time zone | yes | now() |  |

## student_consent

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `student_id` | uuid | yes |  | **PK** |
| `student_name` | text | yes |  |  |
| `email` | text | yes |  |  |
| `consent_date` | timestamp with time zone |  |  |  |
| `pdpa_version` | text | yes |  |  |
| `withdrawn_date` | timestamp with time zone |  |  |  |
| `created_at` | timestamp with time zone | yes | now() |  |

## student_profiles

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `student_id` | uuid | yes |  | **PK** |
| `role` | text | yes |  |  |
| `weak_topics` | jsonb | yes |  |  |
| `missed_findings` | jsonb | yes |  |  |
| `retention_scores` | jsonb | yes |  |  |
| `session_count` | int32 | yes | 0 |  |
| `streak` | int32 | yes | 0 |  |
| `last_active` | date |  |  |  |
| `learning_velocity` | text | yes | stable |  |
| `checkin_done_today` | boolean | yes | False |  |
| `supervisor_note` | text | yes |  |  |
| `updated_at` | timestamp with time zone | yes | now() |  |
| `xp` | int32 | yes | 0 |  |
| `hearts` | int32 | yes | 5 |  |
| `hearts_reset_date` | date |  |  |  |
| `leaderboard_opt_in` | boolean | yes | False |  |
| `streak_freezes` | int32 | yes | 0 |  |
| `best_streak` | int32 | yes | 0 |  |
| `checkin_history` | jsonb | yes |  |  |
| `xp_today` | int32 | yes | 0 |  |
| `xp_today_date` | date |  |  |  |
| `avatar_config` | jsonb |  |  |  |
| `leaderboard_hidden` | boolean | yes | False |  |
| `display_name` | text |  |  |  |
| `coins_earned` | int64 | yes | 0 |  |
| `xp_week` | int32 | yes | 0 |  |
| `xp_week_start` | date |  |  |  |
| `division` | int32 | yes | 1 |  |
| `rank_prev` | int32 |  |  |  |
| `rank_prev_day` | date |  |  |  |
| `league_result_seen_week` | date |  |  |  |
| `daily_state` | jsonb |  |  |  |
| `daily_state_date` | date |  |  |  |
| `boosts` | jsonb |  |  |  |

## supervisors

| Column | Type | Required | Default | Notes |
|---|---|---|---|---|
| `email` | text | yes |  | **PK** |
| `supervisor_id` | text | yes |  |  |
| `cohort` | text | yes | SNEC |  |
| `role` | text | yes | supervisor |  |
