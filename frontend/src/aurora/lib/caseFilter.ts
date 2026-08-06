/* Pure, dependency-free filter logic for the Virtual-Patients "Living Eye" screen
   (spec 2026-07-19). The eye map and the topic chip-row are two entry points to a
   SINGLE active lens — exactly one is ever engaged (ricoe C4 kept in spirit): picking
   a topic clears the eye-region and vice-versa. Kept React-free (the region matcher is
   injected) so it's unit-testable under Node type-stripping. */

/** The single active lens. `region: "all"` + `topic: null` is the whole library. The two
    are mutually exclusive by construction — a non-"all" region and a non-null topic can
    never coexist. */
export type Lens = { region: string; topic: string | null };

export const ALL_LENS: Lens = { region: "all", topic: null };

/** One topic-set chip: a role-aware set from `/api/cases/topics` (with counts) or, when that
    fetch is unavailable, derived from the loaded cases' `set_key`/`set_label` (label-only). */
export type TopicChip = { key: string; label: string; total?: number; done?: boolean };

/** Shape of one entry from `GET /api/cases/topics`. */
export type ApiTopic = { set_key: string; label: string; total: number; completed: number };

/** Tap a topic chip: engage that set, clearing any eye-region. Re-tapping the active
    topic toggles back to the whole library (mirrors the eye pin's toggle). */
export function toggleTopic(cur: Lens, key: string): Lens {
  return cur.topic === key ? ALL_LENS : { region: "all", topic: key };
}

/** Tap an eye region: focus it, clearing any active topic. Re-tapping the active region
    toggles back to the whole library. */
export function toggleRegion(cur: Lens, id: string): Lens {
  return cur.region === id ? ALL_LENS : { region: id, topic: null };
}

/** Filter the loaded case list for the active lens. A topic lens filters strictly by
    `set_key`; otherwise the eye-region matcher (injected — `caseInRegion`) decides. */
export function filterCases<T extends { set_key?: string; topic: string; title: string }>(
  cases: T[],
  lens: Lens,
  regionMatch: (text: string, region: string) => boolean,
): T[] {
  if (lens.topic) return cases.filter((c) => c.set_key === lens.topic);
  return cases.filter((c) => regionMatch(`${c.topic} ${c.title}`, lens.region));
}

/** One section of the patient journey. */
export type JourneySection<T> = { key: string; label: string; hint: string; items: T[]; done?: boolean };

/** A tier row as declared in lib/tiers.ts. */
type TierDef = { key: string; label: string; hint: string };

/**
 * Group the visible patients into the journey: the difficulty tiers in order, then anything
 * of an unknown tier, then — LAST — the ones this student has already passed.
 *
 * Completed patients are pulled OUT of their tier rather than greyed in place (user-directed:
 * "make sure that it is listed at the bottom/last with a tick badge and grey off to signify
 * completed … student does not access the completed cases unless they scroll out of their
 * way"). They are never dropped: a finished patient is still worth replaying for practice,
 * it just stops being in the way of, and stops looking like, the work still to do.
 *
 * A LOCKED case is never treated as completed — the two states are mutually exclusive
 * upstream, but ordering locked-and-completed after locked-and-not would be nonsense.
 */
export function journeySections<T extends { difficulty: string; completed?: boolean; locked?: boolean }>(
  cases: T[],
  tiers: readonly TierDef[],
): JourneySection<T>[] {
  const isDone = (c: T) => !!c.completed && !c.locked;
  const active = cases.filter((c) => !isDone(c));
  const done = cases.filter(isDone);
  const known = new Set(tiers.map((t) => t.key));

  const sections: JourneySection<T>[] = tiers
    .map((t) => ({ ...t, items: active.filter((c) => (c.difficulty || "").toLowerCase() === t.key) }))
    .filter((s) => s.items.length > 0);

  const rest = active.filter((c) => !known.has((c.difficulty || "").toLowerCase()));
  if (rest.length) sections.push({ key: "more", label: "More patients", hint: "", items: rest });
  if (done.length) {
    sections.push({
      key: "completed",
      label: "Completed",
      hint: "Passed already — replay any of these for practice (they no longer earn Lumens).",
      items: done,
      done: true,
    });
  }
  return sections;
}

/** Build the topic chip-row. Primary: the role-aware sets from `/api/cases/topics`, in
    canonical order, hiding empty sets and flagging fully-completed ones. Fallback (topics
    fetch failed → `null`/empty): derive unique sets from the loaded cases in first-seen
    order, label-only, so the filter still works and never blocks the screen. */
export function topicChips(
  apiTopics: ApiTopic[] | null | undefined,
  cases: { set_key?: string; set_label?: string }[],
): TopicChip[] {
  if (apiTopics && apiTopics.length) {
    return apiTopics
      .filter((t) => t.total > 0)
      .map((t) => ({ key: t.set_key, label: t.label, total: t.total, done: t.completed >= t.total }));
  }
  const seen = new Set<string>();
  const out: TopicChip[] = [];
  for (const c of cases) {
    const k = c.set_key;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ key: k, label: c.set_label || k });
  }
  return out;
}
