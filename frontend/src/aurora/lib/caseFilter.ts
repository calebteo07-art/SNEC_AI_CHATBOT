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
