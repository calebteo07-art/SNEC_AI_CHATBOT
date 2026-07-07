# Applied migrations

Ledger of Supabase migrations that have been run in production. One line per
migration. Migrations are applied by pasting the file's SQL into the Supabase
SQL editor (see the `/db-migrate` command); this file records that it's done.

- [x] 006_avatar.sql — applied 2026-07-06
- [x] 007_avatar_images.sql — applied 2026-07-06 (Selena 3D-portrait cache; public bucket `selena-avatars` also created)
- [x] 008_leaderboard_visibility.sql — applied 2026-07-07 (D7 leaderboard live: `leaderboard_hidden` + `display_name`)
