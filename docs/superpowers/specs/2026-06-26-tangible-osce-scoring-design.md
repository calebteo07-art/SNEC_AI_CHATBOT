# Tangible, adaptive OSCE station scoring — design

Date: 2026-06-26
Status: approved (brainstorm) → ready for implementation plan

## Problem

The OSCE "Station 100" score has three buckets ([`tools/cases/station_score.py`](../../../tools/cases/station_score.py)):

| Bucket | Points | Driver |
|---|---|---|
| Thoroughness | 0–40 | checklist coverage (critical steps ×2), deterministic |
| Technique | 0–30 | LLM `history` + `investigations` domain scores |
| Judgment & safety | 0–30 | LLM `diagnosis` + `management`, capped at 60% on a missed critical step |

Two issues, raised by the product owner:

1. **"Technique" is mislabeled and always present.** It is really LLM grading of history-taking + investigations, not hands-on procedure skill. It appears even on conversation-only cases (history-taking, triage, counselling, refusal) where there is no manual procedure to have technique *for*.
2. **The non-Technique buckets are not tangible.** "Thoroughness" and "Judgment & safety" are abstract labels that do not tell a student *which specific thing* to do better, so they are hard to learn from.

Note: the **manual action panel already auto-hides** — [`ActionPalette.tsx`](../../../frontend/src/aurora/components/ActionPalette.tsx) returns `null` when there are zero manual chips, so conversation-only cases never show it. No change is needed there. The right-hand `StationChecklist` pane stays — it is the source of the "Steps completed" bucket.

## Decision summary (from brainstorming)

- Keep **three buckets**, but rename + give each a concrete, plain-English definition and surface the items behind the number.
- Make **Technique conditional** on the case having manual procedures.
- For conversation-only cases (Technique removed), redistribute its points **50 / 50** across the two remaining buckets.
- **Technique = procedure execution only** (the `investigations` domain). History-taking quality is no longer a separate fuzzy number — it is captured by *Steps completed* (history questions are ticked checklist steps) and reflected in *Judgement*. The grader still produces history feedback for coaching.

## Scoring model

`compute_station_score(domain_scores, steps, performed, has_manual=True)` becomes adaptive. `has_manual` defaults to `True` to preserve existing call sites/tests.

| Bucket (student-facing label) | Manual-procedure case | Conversation-only case | Source |
|---|---|---|---|
| **Steps completed** | 0–40 | 0–50 | critical-weighted checklist coverage (deterministic) |
| **Technique** | 0–30 | *removed* | LLM `investigations` (procedure execution) |
| **Clinical judgement & safety** | 0–30 | 0–50 | LLM `diagnosis`+`management`, safety-gated |

Total stays `/100`. Pass line stays 60. Verdict thresholds (85 / 70 / 60) unchanged. `total_score = round(score_100 * 0.4)` legacy `/40` projection unchanged.

### Formulas

Let `earned/possible` = critical-weighted checklist coverage ratio; `inv`, `dia`, `mng` = LLM domain scores (0–10); `gate` = `SAFETY_CAP` (0.6) if a critical step is missed, else 1.0.

**Manual case (`has_manual=True`):**
- `thoroughness = round(40 * earned/possible)`
- `technique    = round(30 * inv/10)`
- `judgment     = round(30 * (dia+mng)/20 * gate)`

**Conversation-only case (`has_manual=False`):**
- `thoroughness = round(50 * earned/possible)`
- `technique    = 0` (not displayed)
- `judgment     = round(50 * (dia+mng)/20 * gate)`

`score_100 = clamp(0, 100, thoroughness + technique + judgment)`.

### New return fields

Added to the dict returned by `compute_station_score` (and surfaced through the `/submit` response):

- `technique_applies: bool` — equals `has_manual`; frontend hides the Technique card when false.
- `thoroughness_max: int` (40 or 50)
- `technique_max: int` (30 or 0)
- `judgment_max: int` (30 or 50)

All existing fields (`score_100`, `verdict`, `thoroughness`, `technique`, `judgment`, `safe`, `missed_critical`, `thoroughness_detail`, `total_score`, `critical_hit`, `critical_total`) remain.

## Determining `has_manual`

In [`tools/api/routers/cases.py`](../../../tools/api/routers/cases.py) `case_submit`, after resolving the checklist steps (`_cl_compare["steps"]`), compute:

```python
actions = build_actions(case.get("examination_findings", {}), steps)
has_manual = any(a["kind"] == "manual" for a in actions)
```

Both `build_actions` and the steps are already available in that scope. Pass `has_manual` into `compute_station_score`. This reuses the **same** manual/verbal classification (`_VERBAL_LABELS` + `_is_say`) that drives whether the action panel renders, so "no action panel" and "no Technique bucket" stay perfectly in sync.

A reusable helper `has_manual_actions(examination_findings, steps) -> bool` may be added to `tools/cases/examination_actions.py` to keep the endpoint thin and make the rule unit-testable. (Optional; the inline form above is acceptable.)

Note on rubric-fallback cases: all 151 current cases resolve to a real DB checklist (0 fallback), so the fallback path is effectively dead. The classification may misfire on rubric-derived "statement" steps, but this is acceptable and out of scope.

## Frontend (`frontend/src/aurora/screens/CaseSession.tsx`)

- Extend the `DomainResult` type with `technique_applies`, `thoroughness_max`, `technique_max`, `judgment_max`.
- Make the component cards data-driven instead of the hardcoded `COMPONENTS` array:
  - **Steps completed** (was "Thoroughness") — max `thoroughness_max`; sub = `thoroughness_detail`.
  - **Technique** — max `technique_max`; sub = "How well you performed the procedure(s)"; **render only when `technique_applies` is true**.
  - **Clinical judgement & safety** (was "Judgment & safety") — max `judgment_max`; sub = "Spotting the problem, triage, escalation & handover".
- Guard the bar-fill math against `max === 0` (defensive; the card is hidden when max is 0).
- Surface the missed steps for *Steps completed* using the existing `checklist_comparison` data so the bucket is item-traceable (the missed-only review already exists in the debrief — ensure it reads the renamed bucket cleanly).
- No change to `ActionPalette` (already conditional) or to the live station checklist pane.

## Backend grader

No change. `evaluate_case` and the rubric prompts still produce all four domain scores + feedback. Only the recombination in `station_score.py` changes.

## Out of scope

- No change to the LLM grading prompts or the four-domain rubric.
- No Supabase migration.
- No change to difficulty progression (still pass at 60/100 → 24/40).
- No decomposition of Judgement into a full per-criterion LLM matrix (that was the heavier option, declined). Tangibility for Judgement comes from the definition + the specific feedback/`missed_critical` already returned.

## Testing (TDD — write failing tests first)

`tests/cases/test_station_score.py`:
- **Conversation-only, perfect** — `has_manual=False`, all domains 10, full coverage → `thoroughness=50`, `technique=0`, `judgment=50`, `score_100=100`, `technique_applies=False`, maxes 50/0/50.
- **Conversation-only, coverage only** — zero domains, full coverage, `has_manual=False` → `score_100=50` (thoroughness only).
- **Technique tracks `investigations`, not `history`** — manual case, `history=0, investigations=10, diagnosis=0, management=0`, full coverage → `thoroughness=40`, `technique=30`, `judgment=0`, `score_100=70`.
- **Manual case unchanged** — existing `test_perfect_score_is_100`, safety-gate, pass-line, detail, empty-checklist tests still pass with the default `has_manual=True`.
- Assert the new max fields are present and correct in both modes.

`tests/cases/test_examination_actions.py` (if helper added):
- `has_manual_actions` is `True` for a procedure checklist (e.g. contains "Measure IOP") and `False` for an all-verbal history checklist (intro / identify / ask… steps).

Full suite (`python -m pytest -q`) + frontend `npm run typecheck && npm run build` must stay green.

## Files touched

- `tools/cases/station_score.py` — adaptive buckets + new fields.
- `tools/api/routers/cases.py` — compute + pass `has_manual`; pass new fields through `DomainScore`.
- `tools/cases/examination_actions.py` — optional `has_manual_actions` helper.
- `frontend/src/aurora/screens/CaseSession.tsx` — data-driven, relabeled, conditional Technique card; extended type.
- `tests/cases/test_station_score.py`, `tests/cases/test_examination_actions.py` — new tests.
