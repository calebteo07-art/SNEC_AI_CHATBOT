/* Weekly-league client math — dependency-free (no imports) so it unit-tests under Node's
   type stripping and stays pure. The board renders what this module decides; nothing here
   touches the DOM, the clock singleton, or the network.

   Mirrors the server rules in tools/gamification/league.py. Where the two must agree — the
   week boundary and the promotion count — the server is authoritative and this module only
   presents; `promoteCount` arrives on the payload rather than being recomputed here, so the
   line a student sees is the line they are actually judged against. */

export type ChaseKind = "promote" | "hold" | "summit" | "idle";

/** Minimal shape the math needs; LeaderboardEntry is structurally compatible. */
export interface LeagueEntryLike { rank: number; name: string; xp: number; is_you: boolean; }

export interface Chase {
  kind: ChaseKind;
  /** The one big number, or null when there isn't an honest one to show. */
  value: number | null;
  label: string;
}

export interface Arrow {
  glyph: string;
  dir: "up" | "down" | "flat" | "none";
  label: string;
}

/** Mirrors DIVISIONS in tools/gamification/league.py. The board reads `division_name` off
 *  the payload for the CURRENT division; this list exists so the promotion line can name the
 *  one above it ("advance to Volt") without a second round-trip.
 *
 *  ⚠ A LADDER OF LIGHT since 2026-08-06 — each name IS its colour (Ember vermilion #FF6320,
 *  Volt electric blue #3D9BFF, Solar gold #FFB800, Nova violet #D06BFF, Prism aqua #2BE8CE),
 *  and the order is the ladder. Every tint on the board indexes off the same position, so this
 *  list and TIERS in components/leaderboard/Tiers.tsx are two views of one thing and move
 *  together.
 *
 *  ⚠ THIS COMMENT WAS STALE FOR A DAY and that is the warning worth keeping: it went on
 *  describing azure/violet/aqua through the pass that banned blue and repainted them acid
 *  lime, hot magenta and emerald. A prose list of colours in a file that holds no colours
 *  rots silently, because nothing renders it. The hexes are named here now so the drift is at
 *  least greppable — leaderboard.css is still where they are authored. */
export const DIVISION_NAMES = ["Ember", "Volt", "Solar", "Nova", "Prism"] as const;
export const TOP_DIVISION = DIVISION_NAMES.length;

/** The division a promotion moves you into, or null at the summit. Clamps rather than
 *  throwing — a null or out-of-range column must never break the board. */
export function nextDivisionName(division: number | null | undefined): string | null {
  const d = Math.max(1, Math.min(TOP_DIVISION, Math.trunc(Number(division) || 1)));
  return d >= TOP_DIVISION ? null : DIVISION_NAMES[d];
}

/** What the NEXT division PAYS — the name and its formatted multiplier — or null when there
 *  is nothing above you to name.
 *
 *  The band states this beside the promotion mechanic, because "finish top three" and "Gold
 *  pays ×1.25" are one fact split across two screens otherwise: the reason to climb is the
 *  rate, and until 2026-08-04 the rate was only readable inside the (?) sheet.
 *
 *  ⚠ `multipliers` is the SERVER's ladder, straight off the leaderboard payload. It is not
 *  defaulted and not mirrored here on purpose: `division_multiplier` and
 *  `division_multipliers` ship in the same response from the same list in
 *  tools/gamification/league.py, so they cannot disagree with each other or with what a
 *  student is actually paid. A hard-coded copy would drift the first time the economy is
 *  retuned — silently, because a wrong multiplier still renders. An older server sending no
 *  ladder gets no claim rather than an invented one.
 *
 *  Clamps exactly as nextDivisionName does: two helpers answering "what is above me" must
 *  not disagree about a null column. */
export function nextRungPayoff(
  division: number | null | undefined, multipliers: number[],
): { name: string; mult: string } | null {
  const d = Math.max(1, Math.min(TOP_DIVISION, Math.trunc(Number(division) || 1)));
  const name = nextDivisionName(d);
  const m = multipliers?.[d];   // d is 1-based, so index d IS the rung above
  if (!name || typeof m !== "number" || !Number.isFinite(m)) return null;
  // 1.5, never 1.50 — trailing zeros make a game number look like a currency.
  return { name, mult: `×${m.toFixed(2).replace(/\.?0+$/, "")}` };
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const SGT_OFFSET = 8 * HOUR; // Asia/Singapore is UTC+8 year-round — no DST to model.

/** Milliseconds from `now` until the league week closes: Monday 00:00 SGT.
 *
 *  The server closes the week on the SGT boundary (tools/shared/clock.py), so a
 *  viewer-local countdown would be wrong for anyone outside UTC+8 — up to 15 hours out,
 *  which on a Sunday evening is the difference between "still time" and "already over".
 *  We shift the instant into SGT and do plain UTC date math on it, which keeps the whole
 *  function pure and testable without a timezone database. */
export function msToWeekClose(now: Date): number {
  const sgt = now.getTime() + SGT_OFFSET;
  const d = new Date(sgt);
  // Midnight of the current SGT day, expressed on the same shifted timeline.
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  // Days to the next Monday. Landing on Monday means the week just opened, so the close
  // is a full week out — never "0h left" on the morning a new race begins.
  const days = ((1 - d.getUTCDay() + 7) % 7) || 7;
  return midnight + days * DAY - sgt;
}

/** "1d 12h" · "1h 30m" · "12m". Clamped at zero: a countdown must never read negative
 *  in the seconds between the boundary passing and the next poll. */
export function countdownLabel(ms: number): string {
  const t = Math.max(0, ms);
  if (t >= DAY) return `${Math.floor(t / DAY)}d ${Math.floor((t % DAY) / HOUR)}h`;
  if (t >= HOUR) return `${Math.floor(t / HOUR)}h ${Math.floor((t % HOUR) / 60_000)}m`;
  return `${Math.floor(t / 60_000)}m`;
}

/** Split the ranked list into the finishers who stand on the podium and the rest of the
 *  ladder.
 *
 *  Restored 2026-08-04 with the podium (it was deleted on 2026-08-03 and every rank became a
 *  row). Two rules, and both of them are about not telling a lie with a stage:
 *
 *  1. An UNDERFILLED podium is no podium. Two students on a three-place stage is a set with a
 *     hole in it, so below `places` entries everyone goes in the list instead. This is also
 *     what keeps the one-student cohort rendering a board rather than a lone plinth.
 *  2. `places` is the CALLER's decision, because the caller knows whether a filter is on. The
 *     board passes 0 on a role-filtered view: those top three are the best three OA, whose
 *     real division ranks might be 1, 3 and 6. A podium labelled 1-2-3 would be false, and a
 *     podium labelled 1-3-6 is not a podium. Same reasoning as the promotion zone, which is
 *     withheld on a filtered view for exactly this reason.
 *
 *  Generic in the entry type: this is list surgery, and it must not drag the row shape in. */
export function splitPodium<T>(entries: T[], places = 3): { podium: T[]; rest: T[] } {
  if (places <= 0 || entries.length < places) return { podium: [], rest: entries };
  return { podium: entries.slice(0, places), rest: entries.slice(places) };
}

/** Every entry sitting in `division`, mapped to its rank WITHIN that division (1-based).
 *
 *  The board lists the whole cohort (2026-08-08) but promotion is still decided inside a
 *  division, so the head has to recover the viewer's own race from a mixed list.
 *
 *  A filter and a counter, deliberately NOT a sort. The cohort is ranked by `(-xp, name)` —
 *  the same key the division ranking used — so the filtered order already IS the division
 *  order. Re-sorting here would introduce a second implementation of the ladder's ordering
 *  and invite the two to drift the first time either is retuned.
 *
 *  Keyed by the ENTRY OBJECT. Not by name: two students can share a display name, and this
 *  is the map that decides who gets the promotion gold, so collapsing them would paint the
 *  wrong row. Not by id either — the payload strips `student_id` before it leaves the
 *  server. Callers must therefore pass the same array instances they render.
 *
 *  ⚠ Only meaningful on an UNFILTERED board. A `?role=` view carries one role's members, so
 *  this would number a lens rather than a race; the screen withholds everything built on it
 *  in that case. */
export function leagueRanks<T extends { division: number }>(
  entries: T[], division: number,
): Map<T, number> {
  const ranks = new Map<T, number>();
  let n = 0;
  for (const e of entries) if (e.division === division) ranks.set(e, ++n);
  return ranks;
}

/* ⚠ `promotionLineIndex` WAS DELETED on 2026-08-08 with the cut it positioned. It answered
   "how many rows down does the gold region end", which only has an answer when the promoted
   set is a contiguous run from the top — true of a division board, false of a cohort one,
   where your league's promoting members are scattered among four other leagues'. Its careful
   null cases (the summit promotes nobody; a line past the last row would claim everyone
   promotes) are not lost: the summit still sends promote_count 0, and the promotion state is
   now a per-row flag derived from `leagueRanks` above, which cannot point at a wrong row
   because it is keyed by the row itself. Do not restore it without restoring a contiguous
   promoted set to draw. */

/** How a row moved since the last daily snapshot.
 *
 *  "No snapshot" and "no change" are deliberately different glyphs. A student who joined
 *  yesterday has not *held* their rank, and showing them a flat dash would be a small lie
 *  the board tells on their first day. */
export function arrowFor(delta: number | null | undefined): Arrow {
  if (delta === null || delta === undefined) return { glyph: "·", dir: "none", label: "New this week" };
  const n = Math.trunc(delta);
  if (n === 0) return { glyph: "—", dir: "flat", label: "Held rank" };
  if (n > 0) return { glyph: `▲${n}`, dir: "up", label: `Up ${n} place${n === 1 ? "" : "s"}` };
  return { glyph: `▼${-n}`, dir: "down", label: `Down ${-n} place${n === -1 ? "" : "s"}` };
}

/** The single most useful number on the board, and what it means.
 *
 *  Below the promotion line it is the climb; above it, the cushion over the student chasing
 *  you (spec §6.2 — this is what finally uses the `below` half of computeRivals). At the top
 *  division there is nothing to be promoted into, so the framing changes rather than
 *  inventing a zone that doesn't exist.
 *
 *  The viewer is located by `is_you` and nothing else. An earlier signature also took a
 *  `you` entry, which let the caller pass one row while the list flagged another — the two
 *  silently disagreeing produced a plausible, wrong number. One source of truth instead. */
export function computeChase(
  entries: LeagueEntryLike[],
  promoteCount: number,
  atTopDivision: boolean,
): Chase {
  const i = entries.findIndex((e) => e.is_you);
  if (i < 0) return { kind: "idle", value: null, label: "Ranked by Lumens earned this week" };
  const you = entries[i];

  const ahead = entries[i - 1];

  if (atTopDivision) {
    if (!ahead) return { kind: "summit", value: null, label: "Prism champion — hold the summit" };
    return { kind: "summit", value: Math.max(0, ahead.xp - you.xp), label: `Lumens to overtake #${ahead.rank}` };
  }

  // Below the line: the climb is measured to the student holding the LAST promotion slot,
  // not to whoever happens to be one row up — that is the rank you actually have to reach.
  if (you.rank > promoteCount) {
    const cut = entries[promoteCount - 1];
    const gap = cut ? Math.max(0, cut.xp - you.xp) : null;
    return { kind: "promote", value: gap, label: "Lumens to the promotion zone" };
  }

  const chaser = entries[i + 1];
  if (!chaser) return { kind: "hold", value: null, label: "You're in the promotion zone" };
  return { kind: "hold", value: Math.max(0, you.xp - chaser.xp), label: `Lumens clear of #${chaser.rank}` };
}
