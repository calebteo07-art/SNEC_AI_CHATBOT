# Glossary

This project uses codenames. Most were chosen while building a feature and then
stuck, so they appear in directory names, CSS classes, code comments and design
documents without ever being defined. This page is the definition.

If you are reading a file and hit a word that seems to mean something specific,
it is probably here.

---

## Product and feature names

| Term | What it means |
|---|---|
| **EyeBot** | The platform itself. The training app SNEC students log in to |
| **Aurora** | The frontend shell and design system — layout, navigation, the drifting mesh background, the command palette. Lives in `frontend/src/aurora/`. A whole directory named after a codename, which is why it looks cryptic at first |
| **Atlas Rail** | The left-hand navigation. Collapses to 72px, expands to 248px on hover, and can be pinned |
| **Eyecon** | The student's customisable avatar, and the app mascot. **Formerly called "Selena"** — both names appear in the codebase and in older design docs. Same thing |
| **Lumens** | The points currency students earn |
| **The League** | The weekly leaderboard. Five divisions: Ember, Volt, Solar, Nova, Prism. Ranks by points earned *this week* and resets Mondays |
| **The Forge** | The daily check-in screen — the one with the flame |
| **Station** | One run of a virtual-patient OSCE case. "Station" and "case" are used almost interchangeably |
| **Silly** | The curated clinical knowledge base (~93 documents) that grounds the tutor. The name is not an acronym; it is just what it ended up being called. See `docs/notes/silly-coverage-matrix.md` |

## Domain terms

| Term | What it means |
|---|---|
| **SNEC** | Singapore National Eye Centre — the client |
| **OA** | Ophthalmic Assistant — a student role |
| **OT** | Ophthalmic Technician — a student role |
| **PSA** | Patient Service Associate — a student role |
| **OSCE** | Objective Structured Clinical Examination — the assessment format the virtual-patient stations simulate |
| **PDPA** | Singapore's Personal Data Protection Act |

Content is **role-scoped**: OA and PSA see identical content and differ only in
title; OT is genuinely distinct. See `tools/shared/role_scope.py`.

## Engineering and process terms

| Term | What it means |
|---|---|
| **RICOE** | The codename for the 2026 design programme. See the warning below — this one has a trap in it |
| **WAT** | Workflows · Agents · Tools. The project's structure: Markdown SOPs in `workflows/`, tested Python in `tools/`, and an agent connecting them. Explained in `CLAUDE.md` |
| **MOCK_MODE** | The keyless AI fallback. With no `GEMINI_API_KEY`, the app serves canned answers instead of calling Gemini. Tests and harnesses run this way on purpose. **In production it is a silent failure mode** — the site looks healthy and the tutor has stopped tutoring. `/health` reports it |
| **Design lock** | A settled UI decision recorded in `docs/design-locks.md`. You refine within a lock by naming the criterion you are changing; you do not silently rebuild it |
| **Harness** | A browser test that drives the real app and asserts on what rendered. `frontend/tests/*.mjs`, run via `scripts/start-harness.sh` |
| **Gates** | The checks that must pass before pushing: pytest, typecheck, frontend build, harnesses. Note they do **not** gate the deploy — see `docs/OPERATIONS.md` §3 |
| **`docs/superpowers/`** | The design-document tree — `specs/` (what to build and why) and `plans/` (how it was staged). These are **decision records**, not current-state docs. `docs/INDEX.md` explains which four documents describe the system as it is today |

---

## ⚠️ RICOE item IDs are references — do not rename them

`RICOE` was the codename for the July 2026 design programme. Its source document
captured a list of intended changes, each with an identifier: `A1`, `A2`, `B3`,
`C6` and so on.

Those identifiers are now cited **75+ times** across code comments, design locks
and specs, as provenance — the reason a given piece of code looks the way it
does:

```
frontend/src/aurora/tokens.css   /* Moving Gemini-gradient accent (RICOE v2, spec D2) */
docs/design-locks.md             student's customised avatar (ricoe A3).
tools/gamification/leaderboard.py  """D7 leaderboard ranking — pure, deterministic (RICOE v2)."""
```

They function like ticket numbers. Renaming them would break the trail between
the code and the decision behind it, and the old names would survive in git
history anyway — so you would end up with two vocabularies instead of one.

**Treat `ricoe A1`–`C7` as stable reference keys.** The source list is
[`product-wishlist-2026-07.md`](product-wishlist-2026-07.md); the design
programme that implemented it is
[`2026-07-05-ricoe-v2-design.md`](superpowers/specs/2026-07-05-ricoe-v2-design.md).

## Naming from here

Two conventions worth adopting rather than inheriting:

- **New work does not need a codename.** Call it what it is. The names above
  exist because they were convenient in the moment, and every one of them now
  costs a newcomer a lookup.
- **Where a codename already exists, keep using it.** A half-renamed concept is
  worse than a badly-named one, because then the codebase disagrees with itself.

---

See also: [`INDEX.md`](INDEX.md) for the document map,
[`ARCHITECTURE.md`](ARCHITECTURE.md) for the system shape, and `CLAUDE.md` in the
repository root for how the project expects to be worked on.
