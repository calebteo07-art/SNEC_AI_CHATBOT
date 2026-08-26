# Documentation index

There are ~130 dated documents under `docs/`. Without a map they read as noise.
This is the map.

## How to read this repository's documents

**Only four documents describe the system as it is today.** Everything else is a
*decision record* — a snapshot of the thinking at one moment, deliberately never
updated afterwards.

| Always current | What it is |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the system is built; the endpoint map |
| [`OPERATIONS.md`](OPERATIONS.md) | How to deploy, configure, watch and recover production |
| [`SECURITY.md`](SECURITY.md) | Auth model, roles, the super-admin bootstrap |
| [`design-locks.md`](design-locks.md) | Settled UI decisions that must not be silently rebuilt |

> **The code is the source of truth for *what* the system does. The specs below
> are the source of truth for *why*.** When a spec and the code disagree, the
> code is right and the spec is history. Read a spec to understand the reasoning
> behind a design before you change it — not to learn current behaviour.

`specs/` holds the design brief (what and why). `plans/` holds the matching
implementation plan (how, phase by phase). `archive/` in either folder means the
work was superseded wholesale.

Within a feature area, **the newest date wins.** Older entries are the road that
led there.

---

## By feature area

### Virtual patients / OSCE stations
The largest subsystem. 155 case files in `cases/`; grading is 40% checklist
coverage, 30% consultation technique, 30% judgement and safety.

- [`2026-07-29-virtual-patients-clarity-design.md`](superpowers/specs/2026-07-29-virtual-patients-clarity-design.md) ← **most recent**
- [`2026-07-19-virtual-patients-topic-filter-design.md`](superpowers/specs/2026-07-19-virtual-patients-topic-filter-design.md)
- [`2026-07-07-osce-patient-faces-design.md`](superpowers/specs/2026-07-07-osce-patient-faces-design.md)
- [`2026-06-26-tangible-osce-scoring-design.md`](superpowers/specs/2026-06-26-tangible-osce-scoring-design.md) — the grading model
- [`2026-06-25-osce-station-compulsory-sequence-design.md`](superpowers/specs/2026-06-25-osce-station-compulsory-sequence-design.md)
- [`2026-06-25-osce-split-patient-eyebot-panels-design.md`](superpowers/specs/2026-06-25-osce-split-patient-eyebot-panels-design.md)
- [`2026-06-24-osce-manual-shortcuts-handover-popup-design.md`](superpowers/specs/2026-06-24-osce-manual-shortcuts-handover-popup-design.md)
- [`2026-06-23-osce-station-scoring-debrief-palette-design.md`](superpowers/specs/2026-06-23-osce-station-scoring-debrief-palette-design.md)
- [`2026-06-16-virtual-patient-osce-station-design.md`](superpowers/specs/2026-06-16-virtual-patient-osce-station-design.md) — the original
- [`2026-06-16-virtual-patients-living-eye-design.md`](superpowers/specs/2026-06-16-virtual-patients-living-eye-design.md)

Notes: [`2026-07-19-osce-case-tiers.md`](notes/2026-07-19-osce-case-tiers.md)

### Flashcards
Multiple-choice decks graded by fixed rules — deliberately no AI in the study
loop, so scoring is instant and identical every time.

- [`2026-08-11-flashcards-light-arcade-design.md`](superpowers/specs/2026-08-11-flashcards-light-arcade-design.md) ← **most recent** (supersedes earlier dark-theme work)
- [`2026-07-12-flashcards-quit-forfeit-loophole-design.md`](superpowers/specs/2026-07-12-flashcards-quit-forfeit-loophole-design.md)
- [`2026-07-12-flashcard-explanation-deepen-design.md`](superpowers/specs/2026-07-12-flashcard-explanation-deepen-design.md)
- [`2026-06-29-flashcard-charge-flip-reveal-design.md`](superpowers/specs/2026-06-29-flashcard-charge-flip-reveal-design.md)
- [`2026-06-28-flashcards-topic-fan-carousel-design.md`](superpowers/specs/2026-06-28-flashcards-topic-fan-carousel-design.md)
- [`2026-06-27-flashcards-console-redesign-design.md`](superpowers/specs/2026-06-27-flashcards-console-redesign-design.md)
- [`2026-06-26-flashcards-mcq-v2-design.md`](superpowers/specs/2026-06-26-flashcards-mcq-v2-design.md) — the scoring model

### Socratic tutor
Answers a question with a better question, grounded in the RAG knowledge base.

- [`2026-08-12-tutor-image-attach-design.md`](superpowers/specs/2026-08-12-tutor-image-attach-design.md) ← **most recent**
- [`2026-07-11-tutor-refresh-manrope-sessions-design.md`](superpowers/specs/2026-07-11-tutor-refresh-manrope-sessions-design.md)
- [`2026-07-11-tutor-gemini-type-greetings-design.md`](superpowers/specs/2026-07-11-tutor-gemini-type-greetings-design.md)
- [`2026-06-15-socratic-tutor-redesign-design.md`](superpowers/specs/2026-06-15-socratic-tutor-redesign-design.md)

### Staff console, analytics and reports
`/admin` for trainers and admins.

- [`2026-08-06-trainer-reports-rebuild-design.md`](superpowers/specs/2026-08-06-trainer-reports-rebuild-design.md) ← **most recent (reports)**
- [`2026-08-02-admin-console-redesign-design.md`](superpowers/specs/2026-08-02-admin-console-redesign-design.md) ← **most recent (console)**
- [`2026-07-31-shared-cohort-reads-and-mastery-inputs-design.md`](superpowers/specs/2026-07-31-shared-cohort-reads-and-mastery-inputs-design.md)
- [`2026-07-26-admin-p2-analytics-depth-design.md`](superpowers/specs/2026-07-26-admin-p2-analytics-depth-design.md)
- [`2026-07-24-admin-p1-truth-safety-design.md`](superpowers/specs/2026-07-24-admin-p1-truth-safety-design.md)
- [`2026-07-13-trainer-role-analytics-design.md`](superpowers/specs/2026-07-13-trainer-role-analytics-design.md)
- [`2026-05-27-admin-dashboard-design.md`](superpowers/specs/2026-05-27-admin-dashboard-design.md) — the original

### Gamification, league and home screen
Lumens (points), levels, streaks, and a weekly league with five divisions.

- [`2026-08-08-cohort-wide-league-board-design.md`](superpowers/specs/2026-08-08-cohort-wide-league-board-design.md) ← **most recent (league)**
- [`2026-08-06-league-palette-calm-design.md`](superpowers/specs/2026-08-06-league-palette-calm-design.md)
- [`2026-08-05-home-hud-phase2-design.md`](superpowers/specs/2026-08-05-home-hud-phase2-design.md) ← **most recent (home)**
- [`2026-08-04-league-arcade-pass-design.md`](superpowers/specs/2026-08-04-league-arcade-pass-design.md)
- [`2026-08-04-homepage-game-hud-design.md`](superpowers/specs/2026-08-04-homepage-game-hud-design.md)
- [`2026-08-01-leaderboard-league-design.md`](superpowers/specs/2026-08-01-leaderboard-league-design.md)
- [`2026-07-29-single-lumens-vault-and-month-calendar-design.md`](superpowers/specs/2026-07-29-single-lumens-vault-and-month-calendar-design.md)
- [`2026-07-13-leaderboard-redesign-design.md`](superpowers/specs/2026-07-13-leaderboard-redesign-design.md)
- [`2026-07-12-lumens-gamefeel-design.md`](superpowers/specs/2026-07-12-lumens-gamefeel-design.md)
- [`2026-07-10-leaderboard-the-climb-design.md`](superpowers/specs/2026-07-10-leaderboard-the-climb-design.md)
- [`2026-07-10-homepage-come-alive-design.md`](superpowers/specs/2026-07-10-homepage-come-alive-design.md)
- [`2026-07-01-homepage-redesign-design.md`](superpowers/specs/2026-07-01-homepage-redesign-design.md)
- [`2026-06-24-dashboard-gamification-design.md`](superpowers/specs/2026-06-24-dashboard-gamification-design.md) — the streak engine

### Identity, avatar and first-run onboarding
The avatar system ("Eyecon", formerly "Selena") and the first-login sequence.

- [`2026-07-17-first-login-order-design.md`](superpowers/specs/2026-07-17-first-login-order-design.md) ← **most recent (onboarding order)**
- [`2026-07-14-composited-eyecon-design.md`](superpowers/specs/2026-07-14-composited-eyecon-design.md)
- [`2026-07-14-first-run-grand-tour-design.md`](superpowers/specs/2026-07-14-first-run-grand-tour-design.md)
- [`2026-07-13-eyecon-rename-and-first-login-design.md`](superpowers/specs/2026-07-13-eyecon-rename-and-first-login-design.md)
- [`2026-07-11-mono-eyebot-logo-design.md`](superpowers/specs/2026-07-11-mono-eyebot-logo-design.md)
- [`2026-07-07-selena-seamless-custom-design.md`](superpowers/specs/2026-07-07-selena-seamless-custom-design.md)
- [`2026-07-07-logo-selena-raster-design.md`](superpowers/specs/2026-07-07-logo-selena-raster-design.md)
- [`2026-07-05-ricoe-v2-design.md`](superpowers/specs/2026-07-05-ricoe-v2-design.md) — the design-token foundation

### Roles, content scope and knowledge base
Three student roles: OA, OT, PSA. OA and PSA share content; OT is distinct.

- [`2026-08-19-role-scope-unification-design.md`](superpowers/specs/2026-08-19-role-scope-unification-design.md) ← **most recent** (role scoping is derived in `tools/shared/role_scope.py`)
- [`2026-07-20-per-topic-unlock-gate-design.md`](superpowers/specs/2026-07-20-per-topic-unlock-gate-design.md)
- [`2026-07-02-silly-content-coverage-design.md`](superpowers/specs/2026-07-02-silly-content-coverage-design.md)
- [`2026-07-02-silly-complete-flashcards-osce-design.md`](superpowers/specs/2026-07-02-silly-complete-flashcards-osce-design.md)

Notes: [`silly-coverage-matrix.md`](notes/silly-coverage-matrix.md) · [`2026-07-31-distance-va-source-conflict.md`](notes/2026-07-31-distance-va-source-conflict.md)

### Platform, infrastructure and security
- [`2026-07-21-gmail-api-email-sender-design.md`](superpowers/specs/2026-07-21-gmail-api-email-sender-design.md) — **why email does not use SMTP** (Render blocks it)
- [`2026-06-26-production-hardening-design.md`](superpowers/specs/2026-06-26-production-hardening-design.md) — the fail-closed boot guard, rate-limit keying, Redis
- [`2026-05-30-phase1-db-migration-cookies-design.md`](superpowers/specs/2026-05-30-phase1-db-migration-cookies-design.md) — the HttpOnly cookie model

### Frontend platform, motion and mobile
- [`2026-07-17-mobile-refit-design.md`](superpowers/specs/2026-07-17-mobile-refit-design.md) ← **most recent (mobile)** — phone tiers gate on `pointer: coarse`, never width
- [`2026-06-22-mobile-responsive-polish-design.md`](superpowers/specs/2026-06-22-mobile-responsive-polish-design.md)
- [`2026-06-15-student-app-motion-design.md`](superpowers/specs/2026-06-15-student-app-motion-design.md) — the CSS motion engine
- [`2026-06-13-frontend-redesign-design.md`](superpowers/specs/2026-06-13-frontend-redesign-design.md) — the "Aurora" redesign
- [`2026-07-10-spring-clean-design.md`](superpowers/specs/2026-07-10-spring-clean-design.md) · [`2026-06-01-spring-cleaning-design.md`](superpowers/specs/2026-06-01-spring-cleaning-design.md) — dependency/asset removals

---

## Other material

| Path | What it is | Keep reading it? |
|---|---|---|
| `superpowers/plans/` | Implementation plans matching the specs above, same date convention | Only alongside its spec |
| `superpowers/specs/archive/`, `superpowers/plans/archive/` | Superseded wholesale | Historical only |
| `archive/ricoe-roadmap.md` | An early roadmap | Historical only |
| [`notes/dev-journal.md`](notes/dev-journal.md) | Running engineering journal | Useful for context on odd decisions |
| [`notes/becky.md`](notes/becky.md) | Performance / minimal-grounding notes | Reference |
| `notes/grandprix-prompts-*.{jsonl,json}` | Generated prompt output | Data, not documentation |

Root-level files that are **project history rather than instructions**:

- `ricoe.md` — a captured wishlist of intended future changes from July 2026.
  Verbatim author notes; several items have since shipped. Treat it as a source
  of ideas, not a backlog.
- `.session-handoff.md` — an AI-session continuity snapshot. Of no value to a
  new team except as a record of where work stopped.
