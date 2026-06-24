# Dashboard + Gamification Overhaul — Design

Date: 2026-06-24
Branch: `dashboard-gamification`

## Goal

Make the student Dashboard "make sense": link to every feature (Tutor, Virtual
Patients, Flashcards), and make gamification (XP + streak) coherent, synced, and
visibly part of daily use. Keep the current dark-canvas vibrancy and motion; add
an editorial serif. Streak gets a LinkedIn-inspired (not copycat) weekly view with
**weekend rest days** and a **streak freeze**.

## Root-cause of "XP/streaks don't sync or make sense"

Two parallel gamification systems disagree:

- **localStorage** (`frontend/src/lib/legacy/gamification.ts`) drives the daily-XP
  goal ring and a *second* local streak counter, updated instantly per card/message.
- **Backend** (`/api/progress`, Supabase `student_profiles`) drives the hero's
  XP/Streak/Level readouts + the rail streak, synced only at *session end*; the
  streak advances **only on the daily check-in**, and resets on ANY missed day
  (weekends included).

Result: the ring and the readout drift; a student can study all week and still show
streak 0; weekends break the streak.

## Decisions (confirmed with user)

1. **Streak trigger stays the daily check-in.** Studying does not directly bump the
   streak; the check-in MCQ is the daily ritual that does.
2. **Weekends are rest days (free passes).** Streak counts consecutive *weekdays*
   (Mon–Fri) with a completed check-in. Not checking in on Sat/Sun never breaks the
   streak. A weekend check-in is welcomed (counts, no penalty) but never required.
3. **1 auto-freeze.** The student banks at most 1 freeze (granted at every 5-weekday
   milestone, capped at 1). If exactly one weekday is missed and a freeze is banked,
   it is auto-consumed to preserve the streak. Miss 2+ weekdays, or miss 1 with no
   freeze → reset.
4. **Backend is the single source of truth for XP.** One XP number shown everywhere;
   the daily-goal ring is derived from real synced XP (`xp_today`). Optimistic UI
   keeps it instant; the server reconciles.
5. **Streak look = "Week Lens" (Option A), jewel palette.** A full-width band under
   the hero: animated solid flame + big editorial streak number, the week as
   per-day jewel "pupil" dots in a cool→warm arc (each its own hue + glow),
   dashed-moon rest days, pulsing "today", freeze + best + next-tier chips. Doubles
   as the check-in nudge when today isn't done.
6. **Editorial serif = Fraunces** for display numbers + the hero greeting + tier
   names; mono keeps the small structural labels; sans for body. Introduced
   intentionally app-wide on the dashboard so it doesn't look bolted-on.

## Streak engine (the testable core)

New `tools/gamification/streak.py` — pure functions, no I/O:

- `missed_weekdays(last, today)` → count of Mon–Fri dates strictly between `last`
  and `today` (the missed opportunities; weekends don't count).
- `advance_streak(last_checkin, today, streak, freezes)` → returns new
  `{streak, freezes, froze, reset, changed}`:
  - `last == today` → unchanged (no double count).
  - `last is None` → streak = 1.
  - `missed == 0` → streak + 1.
  - `missed == 1 and freezes > 0` → streak + 1, freezes − 1, froze = True.
  - else → reset to 1 (today is day 1).
  - After advancing, grant a freeze: if `streak % 5 == 0`, `freezes = min(1, freezes+1)`.
- `streak_alive(last_checkin, today, freezes)` → for read-time display before
  today's check-in: alive if `missed_weekdays(last, today) <= (1 if freezes else 0)`.
- `current_week_states(today, history)` → 7 entries Mon..Sun, each
  `{day, date, state}` where state ∈ done | today | missed | upcoming | rest.

Clock: new `tools/shared/clock.py` `app_today()` returns the date in **SGT
(UTC+8)** so the daily boundary matches Singapore students. Used by the streak +
check-in path (checkin.py, update_profile.py, get_profile reset).

## Data model (migration `005_streak_xp.sql`)

`ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS`:

- `streak_freezes INT NOT NULL DEFAULT 0`
- `best_streak INT NOT NULL DEFAULT 0`
- `checkin_history JSONB NOT NULL DEFAULT '[]'` (rolling list of ISO check-in dates,
  trimmed to ~21)
- `xp_today INT NOT NULL DEFAULT 0`
- `xp_today_date DATE` (resets `xp_today` when ≠ today)

All code degrades gracefully if columns are missing (try/except, same pattern as
xp/hearts and leaderboard_opt_in).

## API payloads

`/api/progress` (extends `ProgressData`) adds:

- `xp_today: int`, `daily_goal: int` (100)
- `streak_detail: { current, best, freezes, done_today, week: [{day,date,state}] }`

`/api/gamification/sync` response adds `xp_today`.

## Frontend

- `useProgress` types gain `xp_today`, `daily_goal`, `streak_detail`.
- `useGamificationSync` optimistic `onMutate` bumps `xp` **and** `xp_today` in the
  `["progress"]` cache → hero readout + ring move together, instantly.
- `Dashboard`: ring reads `progress.xp_today` / `daily_goal` (drop `getDailyXp()` as
  the ring source). Hero greeting in Fraunces.
- `Flashcards`: per graded card, optimistically bump the progress cache; keep the
  end-of-session `syncGamification`. Keep localStorage `totalCards`/achievements
  (local-only, out of scope).
- `Tutor`: sync chat XP to the backend when granted; remove the now-meaningless
  local `updateStreak()` call (streak is backend/check-in only).
- New `StreakBand.tsx` (Week Lens) reading `progress.streak_detail`, with a custom
  animated solid flame. New `feature launch` cards linking Tutor / Virtual Patients
  / Flashcards.

## Tiers (eye-themed, weekday thresholds)

First Light · 3 → Clear View · 5 → 20/20 Vision · 10 → Eagle Eye · 20 →
Hawkeye · 30 → Visionary · 50. Computed from `current` streak; band shows current
tier + "N weekdays to <next>".

## Testing

- `tests/gamification/test_streak.py` — the engine (rest days, freeze, reset,
  week states, SGT boundary).
- Extend `tests/profile/test_update_profile.py` for weekday/freeze behavior.
- `aurora_assert.mjs` stays green (update assertions for the new dashboard only if
  hooks change).
- `next build` clean.

## Out of scope

Per-device achievement sync, hearts redesign, leaderboard changes, broad timezone
refactor beyond the gamification/check-in path.
