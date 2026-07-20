# Per-topic OSCE unlock gate (2026-07-20)

## Why

Today the difficulty-unlock gate is **account-wide per role**: passing 2 Foundational
cases *anywhere* unlocks every Developing case; 2 Developing anywhere unlocks every
Advanced (`tools/api/routers/cases.py` `get_cases` + `_check_case_access`, counting
`passed`). The desired model gates **per topic-set** so a student clears a topic's own
basics before that topic's harder cases open — except topics that legitimately have no
Foundational case (e.g. Ocular Emergencies), which keep an account-wide on-ramp.

## Model

"Complete" = **any graded attempt** of a case (a `case_results` row exists), pass or fail.
`resolve_set(role, topic)` (or a case's explicit `topic_set`) buckets each case into its
topic-set, within the student's role pool (OA≡PSA share CLINICAL; OT separate) — identical
to `get_cases`.

For a case of difficulty `d` in topic-set `T` (counts are over cases visible to the role):

- **Foundational (`beginner`)** — never gated (always open).
- **Developing (`intermediate`)**:
  - `F(T) ≥ 1` → **completed ≥ min(2, F(T)) Foundational cases whose set == T**.
  - `F(T) == 0` → **completed ≥ 3 cases in any topic** (account-wide fallback).
- **Advanced (`advanced`)**:
  - `D(T) ≥ 1` → **completed ≥ min(2, D(T)) Developing cases whose set == T**.
  - `D(T) == 0` → **completed ≥ 3 cases in any topic**.
- Unknown difficulty → treated as never gated (open), matching today.

`min(2, available)` handles topics with exactly one prerequisite case (History Taking,
Fall Risk, Pre/Post-Op, OCT Imaging, Orthoptics) — they require that 1 case, not an
impossible 2. The `== 0` fallback of 3 any-topic completions is always satisfiable because
Foundational cases are never gated. **Reachability verified against live origin/main data:
no dead-ends** (incl. Ocular Emergencies advanced, reachable via its single Developing case).

## Components

1. **`tools/cases/tier_gate.py`** (new, pure, no I/O) — the single source of truth.
   - `TierCensus`: per-set available tier counts + per-set completed prerequisite counts +
     total completed, built once from the visible cases and the progress dict.
   - `evaluate(difficulty, set_key, census) -> (locked: bool, hint: str)`.
   - Fallback threshold `ANY_TOPIC_FALLBACK = 3`.
2. **`tools/api/routers/cases.py`**
   - `get_cases`: build the census once, set each `CaseInfo.locked` + `unlock_hint`.
   - `_check_case_access`: build the census, fail-closed 403 whose detail == the hint.
3. **`CaseInfo`** model — add `unlock_hint: str = ""` (only `get_cases` populates it).
4. **Frontend** — `CaseCard.tsx` renders `data.unlock_hint` (generic fallback if absent);
   the type gains `unlock_hint?`. `tiers.ts` drops the now-inaccurate `unlockHint()`
   (`tierLabel` stays).

## Hint copy

- `Complete 2 Foundational cases in this topic to unlock.` (`1 Foundational case` when min==1)
- `Complete 2 Developing cases in this topic to unlock.` (`1 Developing case` when min==1)
- `Complete any 3 cases in any topic to unlock.` (no-Foundational / no-Developing topics)

## Testing

- **`tests/cases/test_tier_gate.py`** (new, TDD) — the pure model: per-topic thresholds,
  `min(2, available)`, the `==0` fallback, singular/plural hints, never-gated Foundational.
- **`tests/cases/test_case_access.py`** — rewritten for per-topic semantics (the old
  account-wide assertions no longer hold): Developing in a topic blocked until that topic's
  Foundational attempts met; a no-Foundational topic's Developing unlocked by 3 any-topic
  completions; Advanced mirror; 403 detail matches the hint; full-library list still returned.
- **`tests/cases/test_case_tiers.py`** — replace the account-wide reachability guard with a
  per-topic one: every gated tier in every set is reachable under the new model.
- **`frontend/tests/tiers_logic.mjs`** — drop `unlockHint` asserts (keep `tierLabel`).
- Behavioral verify: simulate a fresh + partial-progress student through `get_cases`/access.

## Invariants preserved

No event-loop blocking (pure CPU over already-awaited progress); no shared state; identity
from JWT; rate-limit keying unchanged; fail-closed on locked access. Stored difficulty keys
stay `beginner`/`intermediate`/`advanced`.
