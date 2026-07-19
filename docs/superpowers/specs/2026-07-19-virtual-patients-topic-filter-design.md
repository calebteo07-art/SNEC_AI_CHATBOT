# Virtual Patients — Filter by Topic

**Date:** 2026-07-19
**Screen:** Virtual Patients / "the Living Eye" (`frontend/src/aurora/screens/Cases.tsx`)
**Type:** Frontend-only additive feature. **No backend change.**
**Supersedes a lock criterion in:** [`docs/design-locks.md`](../../design-locks.md) — Virtual Patients LOCKED 2026-06-25. See original [living-eye design](2026-06-16-virtual-patients-living-eye-design.md).

## Problem

Students can only reach patients through the eye map (an *anatomical* filter). There is no
way to practise by *procedure/topic* — "give me all the Visual Field cases", "all History
Taking". The eye map is coarse and many cases (history taking, fall risk, eye drops, colour
vision) map to **no** anatomical region, so they're reachable only via "whole eye".

## Key finding — the taxonomy already exists

The backend already buckets every case into a role-aware topic-set:
- `tools/cases/topic_sets.py` defines 10–11 ordered sets per pool (OT vs CLINICAL=OA≡PSA).
- `/api/cases` already returns `set_key` + `set_label` on every `CaseInfo` (the chip already
  shown on each patient card).
- `/api/cases/topics` already returns `{set_key, label, total, completed}` per set, in
  canonical order — purpose-built "for the topic picker".

So this feature is **pure frontend wiring** onto tested infrastructure. No new categories are
invented; the taxonomy stays single-sourced in the backend and automatically role-correct.

## Design (approved)

**One active lens.** The eye map and a new topic chip-row are two entry points to a single
selection. Exactly one is engaged at a time:
- Pick a topic chip → `region` resets to `all`.
- Pick an eye region → active topic clears.
- "All patients" chip → both cleared (whole library).

This preserves the page's current single-active-filter feel and never yields an empty screen
(every listed topic has ≥1 case).

**Control — chip row (blends by reuse).** A horizontal, scroll-on-overflow row of topic chips
inside `.aurora-cases-list`, directly under the `.aurora-journey-head`. Reuses existing visual
tokens: `.aurora-case-chip` (the set-label chip already on every card), the
`.aurora-region-reset` pill's blue→purple active fill, and the `.aurora-pin-count` count badge.
Tapping "Visual Field Testing" and seeing cards tagged "Visual Field Testing" reads as one system.

**Data flow.** Fetch `/api/cases/topics` in parallel with `/api/cases`. Build chips from it
(canonical order + `total`; hide `total === 0`). If that fetch fails, derive the chip list from
the already-loaded cases' unique `set_key`/`set_label` (feature degrades gracefully; eye filter
unaffected). Filtering is **client-side** on the already-loaded full library — no round-trip on tap:

```ts
const filtered = topic
  ? cases.filter(c => c.set_key === topic)
  : cases.filter(c => caseInRegion(`${c.topic} ${c.title}`, region));
```

The difficulty-tier grouping (Foundational → Developing → Advanced) is untouched — it operates
on `filtered`.

**Chip content.** Label + count badge (like the eye pins). Fully-completed sets
(`completed === total`, `total > 0`) get a subtle "done" state. Count/done come from
`/api/cases/topics`; if that fetch failed, chips show label-only.

**Header readout.** The `.aurora-journey-head` subtitle reflects the active lens:
- topic active → `{topicLabel} · {n}`
- region active → existing `.aurora-region-reset` pill (unchanged)
- neither → `Whole eye · {n}` (unchanged)

## Isolation / units

- `caseFilter.ts` (new, pure, unit-tested): the selection reducer + list filter.
  - `selectTopic(state, key)` / `selectRegion(state, id)` / `clearLens(state)` — enforce mutual
    exclusion (the state invariant).
  - `filterCases(cases, {region, topic})` — the list filter above.
- `Cases.tsx` — owns fetch + wiring + render; no filter logic inline.
- `aurora.css` — `.aurora-topics*`, scoped under `.aurora-cases`.

## Edge cases

- Topics fetch fails → derive chips from loaded cases; no counts; no crash.
- Empty library / region with 0 → existing empty-state copy unchanged.
- `pointer: coarse` → chip row is touch-scrollable; soft fade at overflow edges.
- Reduced motion → no chip motion beyond the existing tokens.
- Locked cases still render as locked cards within a topic (difficulty locks unchanged).

## Acceptance criteria

1. Topic chip row renders under the journey header, styled to match the card chips / reset pill
   (blue→purple active fill, mono count badge), horizontally scrollable on overflow.
2. Tapping a topic chip filters the list to that set and clears any active eye region; the eye
   shows no active pin.
3. Tapping an eye region clears the active topic (chip row returns to "All patients").
4. "All patients" chip restores the whole library.
5. Chips show per-set counts; zero-count sets are hidden; fully-completed sets show a done state.
6. `/api/cases/topics` failure degrades to label-only chips derived from loaded cases; eye
   filter and list still work.
7. Existing test hooks intact: `.aurora-atlas-plate`, `.aurora-pin`, `data-testid="case-list"`,
   `.aurora-journey`, `.aurora-case`, `.aurora-region-reset`. New hooks: `data-testid="topic-filter"`,
   `.aurora-topic-chip`.
8. `npm run typecheck` + `npm run build` green; `aurora_assert.mjs` green (extended with a
   `/api/cases/topics` mock + chip/mutual-exclusion asserts); `caseFilter` unit test green.

## Out of scope

- Combining eye AND topic (rejected: one-lens-at-a-time chosen).
- Backend changes, new topic-sets, per-case `topic_set` overrides.
- Search box / free-text topic search.

## Implementation checklist

- [ ] `caseFilter.ts` + `caseFilter` unit test (TDD: mutual exclusion + filter).
- [ ] `Cases.tsx`: topics fetch (parallel, graceful), chip-row render, wire handlers via `caseFilter`.
- [ ] `aurora.css`: `.aurora-topics`, `.aurora-topic-chip` (+active/+done), `.aurora-topic-count`, scroll-fade.
- [ ] Extend `aurora_assert.mjs` with `/api/cases/topics` mock + asserts.
- [ ] Amend `docs/design-locks.md` Virtual Patients lock: eye is no longer the *only* filter.
- [ ] Verify: typecheck + build + aurora_assert + unit test; behavioral check on running app.
