# ricoe Roadmap — granular phased execution

Source of truth: [`ricoe.md`](../ricoe.md) (Caleb's verbatim intended changes, captured
2026-07-03; logo-redesign item added 2026-07-04).
This roadmap decomposes ricoe into **small, independently shippable phases** so nothing
gets skipped or neglected (user directive 2026-07-04: *"plan and execute ricoe in more and
smaller phases, not too huge and packed phases"* and *"replan and execute ricoe in the most
effective and efficient way … make sure nothing gets skipped or neglected … do not compromise
on any quality"*).

**Working rule:** one phase = one atomic change → TDD/verify where applicable →
`/ship-check` for any user-facing state invariant → commit + push to `main`. Mark status
here after each phase so the roadmap survives context/account switches.

Legend: ⬜ todo · 🔧 in progress · ✅ done · ⛔ blocked · 🚫 skip (per ricoe) · 💳 needs paid
Gemini/Nano-Banana go-ahead · 🔒 touches a locked design (`docs/design-locks.md`)

> Naming note: ricoe renames the greeting-card mascot (currently **Iris**) to **Selena**.
> Treat "Selena" = the current default greeting mascot going forward.

---

## Execution batches — efficient order (2026-07-04 re-plan)

Grouped so each surface/file is touched once, ordered low-risk → high-risk, with all
paid image-gen deferred to one consolidated go-ahead. **Free code ships continuously; paid
gen scaffolds a clearly-marked placeholder now and fires only on Caleb's explicit go-ahead.**

| Batch | Phases | Surface | Cost | Notes |
|-------|--------|---------|------|-------|
| **1 · Homepage layout** | 6, 7, 5 | `home.css` + `FeatureCarousel`/`GreetingHero`/`StreakTile` | free 🔒 | shorter-wider cards, less whitespace, richer shortcut cards. Refine within Home lock. |
| **2 · Branding** | 8 | `AppShell`/`AtlasRail`/`layout` + `Logo.tsx` | free | EyeBot + SNEC logo on every page. |
| **3 · Flashcards flow** | 9, 10, 11 | `Flashcards.tsx` + flash components | free 🔒 | new-deck button, topic intro card, louder gamification popup. |
| **4 · Flashcards light mode** | 12 | flash CSS | free 🔒→🔓 | **lock-break**: dark→purple-off-white. New brief in design-locks first. |
| **5 · OSCE frontend** | 13, 14, 15, 18, 19, 20, 21 | `CaseSession`/`ActionPalette`/`Cases`/eye plate | free 🔒 | button fix, auto-scroll, skip-explanation, eye-diagram filter, static pfps. |
| **6 · OSCE scoring/grading** | 16, 17 | backend grader + `/observe` + scoring | free 🔒 | TDD + ship-check (state invariants). |
| **7 · Leaderboard** | 26, 27 | new router + new page | free (27 headshot 💳) | XP-ranked, role filter; default-Selena headshot placeholder. |
| **8 · Paid image gen (ONE go-ahead)** | 28, 22, 24, 23, 25, 27-headshot | Nano-Banana assets | 💳 | logo variation, patient faces, milestone icons, avatar system, Selena surfacing. |
| **Blocked** | 3 | tutor landing | ⛔ | needs Caleb's inspiration screenshot. |

---

## Tutor
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 1 | Remove the sliding-light background in tutor | A1 | ✅ 🔒 (removed `.aurora-chat-sweep` scan-bar; constellation + mesh kept) |
| 2 | Tutor output-message pfp → default avatar, not customised Selena | A3 | ✅ 🔒 (reply avatar = default Selena mascot `/brand/iris.png`; guardrail: never the student's customised avatar) |
| 3 | Tutor greeting/landing page w/ recent sessions (resume/read) | A2 | ✅ 🔒 (greeting landing = empty state of /chat: time hello + gradient name + ever-changing cheeky sub + big prompt + real recent-session cards; cross-fades into the thread on ask/resume; Gemini-themed on the constellation surface; screenshot-verified, aurora 28/28) |

## Homepage
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 4 | Fix feature/shortcut cards not routing (click does nothing) | D3-bug | ✅ 🔒 (tap resolved at stage → nearest card; regression test; aurora 26/26) |
| 5 | Make Tutor/OSCE/Flashcard shortcut cards custom + less boring | D3-polish | ✅ 🔒 (kicker pill + light-bloom orb + tile row; richer copy) |
| 6 | Reduce side white-space, enlarge all cards sideways | D4 | ✅ 🔒 (canvas 1360px; feature cards 384×220) |
| 7 | Greeting card + streak: shorter but wider | D5 | ✅ 🔒 (hero grid 1.9fr/1fr, tighter greeting padding) |

## Overall
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 8 | EyeBot logo + SNEC logo on every page | E2 | ✅ (rails already had both; added `CoBrand` lockup to rail-less pages — tutor header SNEC, check-in header, flashcards dark-variant; verified by screenshot + aurora SNEC assertion) |
| 28 | Redesign EyeBot logo → a *different* Selena variation (angle/headshot), not the greeting-card pose | E3 | ⬜ 💳 🔒 (breaks "mono Spark-Eye logo" global lock — needs new brief + paid gen) |

## Flashcards
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 9 | "New deck" button after finishing → topic-selection page | B4 | ✅ 🔒 (newDeck resets run+selection state in place → topic fan, not /dashboard; session/review flows hard-reload into the fan; regression test added) |
| 10 | On topic click, show topic name+description intro card before Q1 | B5 | ✅ 🔒 (new `TopicIntro`: "Up next" + gradient topic name + 1-line blurb from `TOPIC_BLURBS` (all 45 topics + Mixed) + `N cards · mixed difficulty · instant scoring` + Begin; deck loads in bg; fan picks only, review/handoff skip; aurora 29/29 + screenshot) |
| 11 | Louder gamification: XP/2×-combo → powerful game-phrased popup | B3 | ✅ 🔒 (new `ComboBurst`: streak tier-up fires a big game-phrased slam — DOUBLE UP ×2 / ON FIRE ×3 / UNSTOPPABLE ×4 / GODLIKE 10+ — with ×N, shockwave rings, streak count; `pointer-events:none`, self-dismisses; keeps rewarding past the cap; `comboCallout` in types.ts; aurora 29/29 + screenshot) |
| 12 | Convert flashcards to light mode (purple off-white + dark-purple card) | B6 | ✅ 🔒→🔓 (LOCK-BREAK, new brief in design-locks: canvas flipped graphite→light lavender, card navy→dark-purple across study/intro/results; recoloured engravings (dark-purple line-art), Brownian blooms (violet, multiply-blend), exit/mute/fan chrome, CoBrand→light variant; interactions unchanged; aurora 29/29 + screenshots of fan/intro/study/burst) |
| — | Ghibli topic cards / topic-card picture list | B1,B2 | 🚫 skip ("ignore first dont do") |

## OSCE
| # | Phase | ricoe | Status |
|---|-------|-------|--------|
| 13 | Action buttons: fix cut-off words / duplicate buttons | C1 | ✅ 🔒 (refine-within-lock: one chip per distinct procedure, never truncated mid-word. `examination_actions.py` — `_clip_words` word-boundary trim replaces hard `[:34]`/`[:30]` slices; merge now collapses ALL same-(label,mode) chips not just consecutive runs, so a recurring action like hand-hygiene-before/after is ONE chip the gate re-locks between occurrences; `white-space:nowrap` on `.aurora-pchip`. TDD: 2 new failing→green tests; 489 pytest / typecheck / build green) |
| 14 | Auto-scroll every panel (conversation/action/checklist) to latest | C8 | ✅ 🔒 (patient consult already followed; added self-contained scroll to the other two — `EyeBotPanel` threadRef pins `.aurora-eyebot-thread` to bottom on new reveal/coaching/typing; `StationChecklist` brings the current step into view via `scrollIntoView({block:"nearest"})` as the gate advances. Scoped to each container, never yanks the page, safe no-op on mobile stack. Frontend-only; typecheck / build / station_assert 17/17 green) |
| 15 | Some actions skip the typed explanation (you-decide which) | C5 | ✅ 🔒 (decision: mechanical confirmations with no assessable technique tick on ONE click — `_QUICK_LABELS` = Wipe occluder / Disinfect equipment / Discard waste / Print results / Document results / Remove glasses·CL; skill procedures (VA, IOP, slit-lamp, drops, hand-hygiene WHO moments) still require the typed technique. New `quick` field through builder → `ExaminationAction` model → `ExamAction` type; `performAction` logs a short performed note + ticks + skips the coaching AI call for quick chips; ⚡ affordance + "no typing needed" title. TDD: 3 new pytest; 492 pytest / typecheck / build / station_assert 18/18 green) |
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
  changed; do not silently rebuild. Two phases **consciously break** a lock and MUST write a
  new brief first: #12 (flashcards dark→light) and #28 (mono Spark-Eye logo → Selena raster).
- **Paid image gen** (💳): scaffold with clearly-marked placeholders first (green,
  keyless), run the live paid Nano-Banana generation only on Caleb's explicit go-ahead
  (user rule 2026-07-02). SNEC staff = SingHealth blue scrubs + orange trim.
- ricoe: *"don't use the most expensive/premium Nano-Banana for every generation; reserve
  premium for important/clinical."* → default to the cheaper model for cosmetic pfps.
- **Blocked** (⛔): Phase 3 needs Caleb's inspiration screenshot.
