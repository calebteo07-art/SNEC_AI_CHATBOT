# Role scope unification — design

**Date:** 2026-08-19
**Status:** approved, ready for implementation

## Problem

The app scopes content by student role (OA / OT / PSA), but the scoping is not
applied uniformly, and one surface actively contradicts the documented role model.

The content model is **two pools, not three**. One line, duplicated in two
modules, is the whole system:

```python
return "OT" if (role or "").upper() == "OT" else "CLINICAL"
```

- `tools/flashcards/flashcard_sets.py::pool_for_role`
- `tools/cases/topic_sets.py::case_pool`

Every role studies the shared `FOUNDATIONS` pool plus its own procedural pool
(`CLINICAL` for OA/PSA, `OT` for OT). **OA and PSA resolve to the same pool and
therefore have byte-identical content scope**; only the job title differs.

### Audit result

Correctly scoped today: flashcards, daily check-in, OSCE cases, quests, admin
cohort analytics.

Four gaps:

1. **The tutor role context is 3-way while content is 2-way.**
   `_ROLE_TUTOR_CONTEXT` gives OA and PSA *different* focus lines, contradicting
   `OA ≡ PSA`. A PSA student gets PSA-flavoured teaching emphasis over an
   OA-identical content pool.
2. **The dict is duplicated verbatim** in `tools/api/shared.py:150` and
   `tools/api/routers/student.py:37`. Two copies of the same constant can drift.
3. **`GET /api/study-suggestion` does not scope `weak_topics` by role**
   (`tools/api/routers/student.py:839`). `weak_topics` mixes flashcard tags with
   raw OSCE case topics, so an OT student can be told to study a CLINICAL topic
   they do not have decks for. Quests already guard this via `_in_scope`;
   study-suggestion does not.
4. The tutor knowledge base and the League are not role-scoped.

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| League / leaderboard | **Keep cohort-wide** | Scope is a content property, not a social one. Splitting halves each board's population and forces a division-tier rebalance. |
| Tutor knowledge base | **Keep whole; sharpen the role line** | A scoped KB leaves the tutor ungrounded the moment a student asks outside their syllabus. Prompt steering preserves answer quality with no content loss. |
| OA/PSA focus line source | **Derive from the topic lists** | A hand-written line is a second, unenforced copy of the scope. Deriving makes prompt and content pool structurally incapable of drifting. |

## Design

### New module: `tools/shared/role_scope.py`

Pure — no I/O, no state, no event-loop concerns. One purpose: *what is this
role's scope*, in the two forms the app needs (prose for prompts, a predicate
for filtering).

```
ROLE_TITLES: dict[str, str]        # the ONLY thing that differs OA vs PSA
role_focus(role) -> str            # derived tutor prompt line
bare_key(stored) -> str            # topic key with any difficulty suffix stripped
in_scope(weak_topics, role) -> list[str]
```

`bare_key` and `in_scope` move here from `tools/gamification/quests.py`, where
they are currently private. Two features now need the same predicate; leaving it
private in a gamification module would force study-suggestion to import a private
symbol across an unrelated boundary.

### The derived focus line

```
STUDENT ROLE: Patient Service Associate (PSA).
Core knowledge, studied by every role: <12 FOUNDATIONS labels>.
This role's procedures: <14 CLINICAL labels>.
```

OA produces a byte-identical body under `Ophthalmic Assistant (OA)`. OT produces
the same core clause plus its own 19 procedural labels.

Labels are emitted **verbatim** from `FLASHCARD_TOPICS`, so the tutor names a
topic exactly as the deck UI does. Both clauses are included because both pools
genuinely are in the role's scope.

An unknown or blank role yields an empty string, exactly as the current
`.get(role.upper(), "")` does — `tutor_system` then returns the base prompt
unchanged.

### Call sites rewired

| File | Change |
|---|---|
| `tools/api/shared.py:150` | delete `_ROLE_TUTOR_CONTEXT`; `tutor_system` calls `role_focus` |
| `tools/api/routers/student.py:37` | delete the duplicate dict; import `role_focus` |
| `tools/gamification/quests.py:62` | import `bare_key` / `in_scope` instead of defining them |
| `tools/api/routers/student.py:839` | **bug fix** — filter `weak_topics` through `in_scope` before picking a focus |

### Deliberately unchanged

League (cohort-wide), the tutor KB (`workflows/ophthalmology_kb.md`, served
whole), flashcards, check-in, OSCE cases, quests' own behaviour, and admin
analytics. No frontend change: the derived line is server-side prompt text.

## Testing

TDD — each test written and observed failing before the code that satisfies it.

1. **OA ≡ PSA.** `role_focus("OA")` and `role_focus("PSA")` differ *only* by the
   title; the topic body is byte-identical. This is the invariant the whole task
   exists to guarantee.
2. **Derivation is real.** Each role's line contains every label of its own pool
   and **zero** labels from the other pool (an OA line naming "Humphrey Visual
   Field" fails).
3. **Single source of truth.** No `_ROLE_TUTOR_CONTEXT` survives anywhere in
   `tools/`, so the drift hazard cannot silently return.
4. **Study-suggestion is scoped.** An OT student whose only weak topic is a
   CLINICAL one does not get it as their focus.
5. **Quests unchanged.** The existing quest suite still passes against the
   relocated `bare_key` / `in_scope`, proving the move is behaviour-preserving.

## Risks

- **Prompt length.** The line grows from ~5 curated phrases to 26 (OA/PSA) or 31
  (OT) labels. It sits inside the Gemini context cache, so the cost amortizes
  across every message in a session. Accepted: drift-proofing was chosen over
  curated brevity.
- **Context cache.** Not a risk. `get_or_create_context_cache` keys on
  `key + sha256(static_system)[:12]` (`tools/shared/gemini_client.py:231`), so
  changing the prompt text mints a new cache entry automatically. No stale
  prompt can be served.
- **No new env var, no migration, no dashboard coordination.** Safe to ship to
  `main` on its own.
