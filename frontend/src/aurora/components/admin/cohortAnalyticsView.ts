/* Pure view-model for the cohort-analytics panels: CohortAnalytics -> BarSeries rows
   + the text summary each chart is paired with. No React and no DOM imports, so the
   Node harness can type-strip and unit-test it (mirrors chartGeometry.ts).

   It exists because every honesty rule in this slice is a DATA rule, not a rendering
   one — nulls stay null, low-confidence groups sort last, denominators travel with
   their metric — and those are the rules worth pinning in a test. The .tsx below is
   then a dumb projection of what this returns.

   Both type imports are erased before Node ever resolves them. */
import type { BarRow } from "@/aurora/components/charts/BarSeries";
import type { CohortAnalytics, TopicGroupRow } from "@/hooks/useAdmin";

/** Em-dash for "this metric has no denominator", never "0". A 0% bar or a 0% donut
    reads as measured, catastrophic performance; at ~1 attempt per topic group that
    would be the most common single reading on the board. */
export const NO_DATA = "—";

export interface CohortSection {
  pool: string;
  title: string;
  topics: TopicGroupRow[];
}

export interface BarPanel {
  rows: BarRow[];
  /** BarSeries divides by this. 1 for already-normalised 0-1 values; the largest
      count for raw-count bars. */
  max: number;
  /** The prose the aria-hidden bars are paired with (D3) — and the only place the
      numbers appear spelled out with their denominators. */
  summary: string;
  /** `topic_group` per row, positionally aligned with `rows` — the STABLE identity a
      drill-down opens on. `row.label` is a DISPLAY string: weakestPanel decorates it
      with "· limited data", so looking a topic up by it silently failed on every
      low-confidence row, which at SNEC volume is most of them. Carried beside the rows
      rather than on BarRow itself, because that type lives in the frozen
      components/charts module. Empty for panels whose rows are not topics. */
  keys: string[];
}

export interface SafetyPanel {
  rate: number | null;
  summary: string;
}

/* The frontend twin of tools/supervisor/discipline.py's literal map. `all` is two
   sections, never one blended ranking (D2): the OA/PSA and OT curricula are
   disjoint, so a merged ranking would rank a topic against one no OA student can
   even see. Keyed on the raw string because the payload is unvalidated JSON. */
const POOLS_BY_DISCIPLINE: Record<string, string[]> = {
  oa_psa: ["CLINICAL"],
  ot: ["OT"],
  all: ["CLINICAL", "OT"],
};

const POOL_TITLE: Record<string, string> = { CLINICAL: "OA & PSA", OT: "OT" };

/** 0-1 weakness score as the 0-100 index the panel labels it with. */
function weaknessIndex(score: number): number {
  return Math.round(score * 100);
}

/** A 0-100 metric as "84% (120)" — the percentage plus the n it was measured over
    (§5.3: every metric carries its own denominator). BOTH osce.avg_score (a mean of
    score_100) and flashcard.accuracy (cohort_analytics.flashcard_by_group emits
    db.get_topic_accuracy's `pct`, 0-100 at 1dp) arrive on 0-100; only pass_rate,
    safety_fail_rate and weakness_score are 0-1, and none of those is read out here.
    The spelled-out "84 of 120" lives in the summary instead: .aurora-bar-label is a
    fixed 11rem and .aurora-bar-pct is flex-shrink:0, so a long readout eats the very
    track it annotates. */
function scoreReadout(score: number | null, n: number): string {
  return score === null || n <= 0 ? NO_DATA : `${Math.round(score)}% (${n})`;
}

/* Sort tier: confident (0) -> limited data (1) -> no signal at all (2). Spec §5.3
   requires low-confidence groups below confident ones; without it a single 20/100
   attempt tops the ranking and sends a trainer to the emptiest topic in the
   library rather than the weakest. */
function tier(t: TopicGroupRow): number {
  if (t.weakness_score === null) return 2;
  return t.low_confidence ? 1 : 0;
}

export function rankTopics(topics: TopicGroupRow[]): TopicGroupRow[] {
  return [...topics].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      (b.weakness_score ?? -1) - (a.weakness_score ?? -1) ||
      a.label.localeCompare(b.label),
  );
}

/** One section per pool the requested discipline covers, each ranked. A pool with
    no rows still gets its (empty) section so a discipline never silently vanishes
    from the board on a thin week. */
export function sectionsFor(data: CohortAnalytics): CohortSection[] {
  const pools = POOLS_BY_DISCIPLINE[data.discipline] ?? POOLS_BY_DISCIPLINE.all;
  return pools.map((pool) => ({
    pool,
    title: POOL_TITLE[pool] ?? pool,
    topics: rankTopics(data.topics.filter((t) => t.pool === pool)),
  }));
}

/** Whether the flashcard half of the board may render at all. The table only began
    receiving rows at the writer fix (Task 1), so "unavailable" and "empty" both
    mean "not yet" — and both must read as that, never as 0% accuracy. */
export function flashcardOk(data: CohortAnalytics): boolean {
  return data.sources.flashcard === "ok" && data.topics.some((t) => (t.flashcard?.n ?? 0) > 0);
}

/** The tag-drift counter as prose, or null when it must not be shown at all.
    `unknown_tag_attempts` is counted during the flashcard pass, so a FAILED flashcard
    read reports a confident `0` — the same "0 that means no-data" class as a 0% bar, and
    the reason it may only be read while `sources.flashcard` is "ok". Unlike the
    population-wide unclassified/staff counters it renders beside, this one is VIEW-scoped
    (it counts only in-view students), so the copy names the scope out loud. */
export function driftNote(data: CohortAnalytics): string | null {
  if (data.sources.flashcard !== "ok") return null;
  const n = data.totals.unknown_tag_attempts;
  if (n <= 0) return null;
  return `${n} flashcard answer${n === 1 ? "" : "s"} in this discipline view carried a topic tag `
    + `the crosswalk doesn’t recognise and ${n === 1 ? "was" : "were"} bucketed under “General” — `
    + `a renamed topic or a stale app build shows up here first.`;
}

/** The number of observations actually behind a group's weakness index.

    The index blends OSCE score, pass rate, safety and flashcard recall, and for every
    `knowledge_*` group it is 100% flashcard-derived — those groups have no station at
    all. Printing `osce.attempts` beside it therefore rendered a confident index over a
    denominator of `0`. This counts the OSCE attempts and the flashcard answers that fed
    it, which is what "how much evidence is this?" means for a blended score. */
function evidenceN(t: TopicGroupRow): number {
  return t.osce.attempts + (t.flashcard?.n ?? 0);
}

/** The same denominator, spelled out for the tooltip and never collapsed to one noun —
    "12 station attempts" and "12 flashcard answers" are not interchangeable evidence. */
function evidenceNote(t: TopicGroupRow): string {
  const parts: string[] = [];
  if (t.osce.attempts > 0) {
    parts.push(`${t.osce.attempts} station attempt(s) by ${t.osce.students} student(s)`);
  }
  if (t.flashcard && t.flashcard.n > 0) {
    parts.push(`${t.flashcard.n} flashcard answer(s) by ${t.flashcard.students} student(s)`);
  }
  return parts.join(" + ") || "no recorded evidence";
}

export function weakestPanel(topics: TopicGroupRow[], limit = 6): BarPanel {
  const ranked = rankTopics(topics);
  const scored = ranked.filter(
    (t): t is TopicGroupRow & { weakness_score: number } => t.weakness_score !== null,
  );
  const rows: BarRow[] = scored.slice(0, limit).map((t): BarRow => ({
    label: t.low_confidence ? `${t.label} · limited data` : t.label,
    segments: [{
      value: t.weakness_score,
      // Flat purple for limited data, the rose alarm gradient (via `weak`) only for
      // groups that cleared the confidence floor — the marker has to be visible in
      // the bar too, not just in the label, because the label truncates at 11rem.
      tone: t.low_confidence ? "purple" : "rose",
      title: `${t.label}: weakness index ${weaknessIndex(t.weakness_score)} from `
        + `${evidenceNote(t)} · signals: ${t.signals_present.join(", ") || "none"}`,
    }],
    // The denominator of the signals that PRODUCED the score, not the OSCE attempt
    // count. For every knowledge_* group the index is entirely flashcard-derived, so
    // this printed "44 (0)" and the tooltip read "from 0 OSCE attempt(s) by 0
    // student(s)" beside a confident number.
    readout: `${weaknessIndex(t.weakness_score)} (${evidenceN(t)})`,
    weak: !t.low_confidence,
  }));

  // Positionally aligned with `rows`, from the SAME slice — the drill-down key.
  const keys = scored.slice(0, limit).map((t) => t.topic_group);

  if (rows.length === 0) {
    return {
      rows,
      max: 1,
      keys,
      summary: `No topic group has enough performance data to rank yet — `
        + `${ranked.length} group(s) tracked, none with a scored attempt.`,
    };
  }

  const lead = scored[0];
  const low = scored.filter((t) => t.low_confidence).length;
  const none = ranked.length - scored.length;
  const summary = `Weakness index 0-100 (higher = weaker), limited-data groups last. `
    + `Highest: ${lead.label} at ${weaknessIndex(lead.weakness_score)}, from `
    + `${evidenceNote(lead)}.`
    + (low ? ` ${low} group(s) marked “limited data” — under the 3-student / 5-attempt confidence floor.` : "")
    + (none ? ` ${none} group(s) have no performance signal yet and are not ranked.` : "");
  return { rows, max: 1, keys, summary };
}

/** Two BarSeries rows per group — BarSeries stacks every segment into ONE flex
    track (BarSeries.tsx:27), so a grouped bar is not expressible without a new
    component, which §5.4 keeps out of the P2 budget. */
export function comparisonPanel(topics: TopicGroupRow[], hasFlashcards: boolean, limit = 5): BarPanel {
  const ranked = rankTopics(topics)
    .filter((t) => t.osce.scored_n > 0 || (t.flashcard?.n ?? 0) > 0)
    .slice(0, limit);

  const rows: BarRow[] = [];
  for (const t of ranked) {
    const avg = t.osce.avg_score;
    rows.push({
      label: `${t.label} · OSCE`,
      // avg_score is a MEAN OF score_100 (0-100); the flashcard row below is a rate
      // (0-1). Sharing one 0-1 track without dividing here is the 100x bug §5.3
      // calls out — every OSCE bar would clamp to full width.
      segments: avg === null ? [] : [{
        value: avg / 100,
        tone: "blue",
        title: `${t.label}: mean station score ${Math.round(avg)} of 100 over ${t.osce.scored_n} scored attempt(s)`,
      }],
      readout: scoreReadout(avg, t.osce.scored_n),
    });
    if (!hasFlashcards) continue;
    const f = t.flashcard;
    rows.push({
      label: `${t.label} · flashcards`,
      // accuracy arrives on 0-100, exactly like avg_score — divide by 100 for the
      // shared 0-1 track or every flashcard bar clamps to full width.
      segments: f && f.accuracy !== null ? [{
        value: f.accuracy / 100,
        tone: "green",
        title: `${t.label}: ${Math.round(f.accuracy)}% correct over ${f.n} answer(s) by ${f.students} student(s)`,
      }] : [],
      readout: f ? scoreReadout(f.accuracy, f.n) : NO_DATA,
    });
  }

  if (rows.length === 0) {
    return {
      rows,
      max: 1,
      keys: [],
      summary: "No topic group has a graded OSCE attempt or a flashcard answer in this window yet.",
    };
  }
  const summary = `Two rows per group: mean station score (0-100) above flashcard accuracy, `
    + `each with the number of attempts it was measured over.`
    + (hasFlashcards
      ? ""
      : ` No flashcard data yet — answers are only recorded from the writer fix onward, `
        + `so this shows OSCE alone rather than an empty topic at zero.`);
  // Two rows per group, so a positional key would not align — this panel has no
  // drill-down and does not claim one.
  return { rows, max: 1, keys: [], summary };
}

/** Cohort safety rate, POOLED: sum of fails over sum of gradable attempts. The mean
    of the per-group rates would weight a 2-attempt group the same as a 20-attempt
    one. The endpoint sends a rate + its denominator rather than a raw count, so the
    count is reconstructed — rate x n is an integer by construction. */
export function safetyPanel(topics: TopicGroupRow[]): SafetyPanel {
  let gradable = 0;
  let fails = 0;
  for (const t of topics) {
    const n = t.osce.safety_gradable_n;
    // A null rate with n > 0 cannot happen under D13; skip both rather than
    // counting attempts whose fails we cannot know.
    if (n <= 0 || t.osce.safety_fail_rate === null) continue;
    gradable += n;
    fails += Math.round(t.osce.safety_fail_rate * n);
  }
  if (gradable === 0) {
    return {
      rate: null,
      summary: "No attempt in this window was graded against a checklist carrying a "
        + "critical step, so there is no safety rate to report.",
    };
  }
  return {
    rate: fails / gradable,
    // "safety-graded", not "graded". The pass-rate card beside this one uses "graded" to
    // mean carrying a pass/fail on the CURRENT rubric, and the two denominators are
    // genuinely different sets — safety keeps every era, since the 2026-08-04 rescale did
    // not touch `safe`. One word meaning two things put "1 of 11 graded attempt(s)" next
    // to "No graded attempts in the window" and made the board look broken.
    summary: `${fails} of ${gradable} safety-graded attempt(s) missed a critical safety step.`,
  };
}

interface MissedEntry {
  step: string;
  count: number;
  students: number;
  group: string;
  cohort: number;
}

/** Most-missed critical steps across the section. Entries stay per-group: the same
    step text under two groups is two rows, because each carries its own cohort
    denominator and merging them would invent a third. */
export function missedPanel(topics: TopicGroupRow[], limit = 6): BarPanel {
  const entries: MissedEntry[] = topics.flatMap((t) =>
    t.osce.missed_top.map((m) => ({ ...m, group: t.label, cohort: t.osce.students })),
  );
  entries.sort((a, b) => b.count - a.count || b.students - a.students || a.step.localeCompare(b.step));
  const top = entries.slice(0, limit);

  const rows: BarRow[] = top.map((e): BarRow => ({
    label: e.step,
    segments: [{
      value: e.count,
      tone: "rose",
      title: `${e.group}: missed on ${e.count} attempt(s) by ${e.students} of ${e.cohort} student(s) who attempted this group`,
    }],
    // "3/40" — students affected over students who attempted the group. The bar
    // length is the raw miss count, which is a different denominator, so the two
    // are never conflated in one number.
    readout: `${e.students}/${e.cohort}`,
    weak: true,
  }));

  if (top.length === 0) {
    return { rows, max: 1, keys: [], summary: "No critical step has been missed by 2 or more students in this window." };
  }
  return {
    rows,
    max: top[0].count,
    // Rows are steps, not topic groups — no drill-down.
    keys: [],
    summary: `Most-missed critical step: “${top[0].step}” — ${top[0].students} of ${top[0].cohort} `
      + `students who attempted ${top[0].group}. Bar length is the raw miss count; the readout is students affected.`,
  };
}
