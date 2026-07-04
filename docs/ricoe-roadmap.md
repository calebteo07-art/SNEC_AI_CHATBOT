# ricoe Roadmap — granular phased execution

Source of truth: [`ricoe.md`](../ricoe.md) (Caleb's verbatim intended changes, captured 2026-07-03).
This roadmap decomposes ricoe into **small, independently shippable phases** so nothing
gets skipped or neglected (user directive 2026-07-04: *"plan and execute ricoe in more and
smaller phases, not too huge and packed phases"*).

**Working rule:** one phase = one atomic change → TDD/verify where applicable →
`/ship-check` for any user-facing state invariant → commit + push to `main`. Mark status
here after each phase so the roadmap survives context/account switches.

Legend: ⬜ todo · 🔧 in progress · ✅ done · ⛔ blocked · 🚫 skip (per ricoe) · 💳 needs paid
Gemini/Nano-Banana go-ahead · 🔒 touches a locked design (`docs/design-locks.md`)

> Naming note: ricoe renames the greeting-card mascot (currently **Iris**) to **Selena**.
> Treat "Selena" = the current default greeting mascot going forward.

---

## Tutor
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 1 | Remove the sliding-light background in tutor | A1 | ✅ 🔒 (removed `.aurora-chat-sweep` scan-bar; constellation + mesh kept) |
| 2 | Tutor output-message pfp → default avatar, not customised Selena | A3 | ✅ 🔒 (reply avatar = default Selena mascot `/brand/iris.png`; guardrail: never the student's customised avatar) |
| 3 | Tutor greeting/landing page w/ recent sessions (resume/read) | A2 | ⛔ needs inspiration screenshot from Caleb |

## Homepage
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 4 | Fix feature/shortcut cards not routing (click does nothing) | D3-bug | ✅ 🔒 (root cause: perpetual drift + 3D projection made clicks fall through to the stage, and side cards were pointer-events:none; fix = resolve the tap at the stage → open nearest card; regression test added, aurora 26/26) |
| 5 | Make Tutor/OSCE/Flashcard shortcut cards custom + less boring | D3-polish | ⬜ 🔒 |
| 6 | Reduce side white-space, enlarge all cards sideways | D4 | ⬜ 🔒 |
| 7 | Greeting card + streak: shorter but wider | D5 | ⬜ 🔒 |

## Overall
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 8 | EyeBot logo + SNEC logo on every page | E2 | ⬜ |

## Flashcards
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 9 | "New deck" button after finishing → topic-selection page | B4 | ⬜ 🔒 |
| 10 | On topic click, show topic name+description intro card before Q1 | B5 | ⬜ 🔒 |
| 11 | Louder gamification: XP/2×-combo → powerful game-phrased popup | B3 | ⬜ 🔒 |
| 12 | Convert flashcards to light mode (purple off-white + dark-purple card) | B6 | ⬜ 🔒 |
| — | Ghibli topic cards / topic-card picture list | B1,B2 | 🚫 skip ("ignore first dont do") |

## OSCE
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 13 | Action buttons: fix cut-off words / duplicate buttons | C1 | ⬜ 🔒 |
| 14 | Auto-scroll every panel (conversation/action/checklist) to latest | C8 | ⬜ 🔒 |
| 15 | Some actions skip the typed explanation (you-decide which) | C5 | ⬜ 🔒 |
| 16 | Grade action responses in real time vs crafted model answer (not hardcoded "good job") | C6 | ⬜ 🔒 |
| 17 | Count OSCE checklist toward the final /100 | C7 | ⬜ 🔒 |
| 18 | Eye-diagram filter: always show cases on every eye part, even locked | C2 | ⬜ 🔒 |
| 19 | Eye-part buttons bigger + more apparent | C3 | ⬜ 🔒 |
| 20 | Remove topic filter — eye diagram is the only filter | C4 | ⬜ 🔒 |
| 21 | Conversation pfp = static talking head; action pfp = static hand | C9 | ⬜ 🔒 |
| 22 | Patient face pfps (Chua Ah Hoon + all) via Nano Banana (default = non-premium) | C10 | ⬜ 💳 |

## Selena identity system
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 23 | Per-student avatar customization (skin/hair/clothes/accessories), base = Selena; first-run onboarding + later edit | D1 | ⬜ 💳 |
| 24 | Custom streak-milestone icons (5/10/60-day…), upgraded per tier | D2 | ⬜ 💳 |
| 25 | Surface Selena across app features (motion/life where appropriate) | E1 | ⬜ 💳 |

## Leaderboard (new page)
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 26 | Backend: leaderboard endpoint (rank by XP only; all users; filter by role) | F | ⬜ |
| 27 | Leaderboard page UI: Selena headshot + name + role + XP + small streak badge | F | ⬜ 💳 |

---

## Notes carried into execution
- **Locked features** (`docs/design-locks.md`): tutor, home, flashcards, OSCE are all
  locked. Every 🔒 phase *refines within the lock* — name the acceptance criterion being
  changed; do not silently rebuild.
- **Paid image gen** (💳): scaffold with clearly-marked placeholders first (green,
  keyless), run the live paid Nano-Banana generation only on Caleb's explicit go-ahead
  (user rule 2026-07-02). SNEC staff = SingHealth blue scrubs + orange trim.
- ricoe: *"don't use the most expensive/premium Nano-Banana for every generation; reserve
  premium for important/clinical."* → default to the cheaper model for cosmetic pfps.
- **Blocked** (⛔): Phase 3 needs Caleb's inspiration screenshot.
