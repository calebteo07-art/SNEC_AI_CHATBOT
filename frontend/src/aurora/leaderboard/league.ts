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
 *  one above it ("advance to Silver") without a second round-trip. */
export const DIVISION_NAMES = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as const;
export const TOP_DIVISION = DIVISION_NAMES.length;

/** The division a promotion moves you into, or null at the summit. Clamps rather than
 *  throwing — a null or out-of-range column must never break the board. */
export function nextDivisionName(division: number | null | undefined): string | null {
  const d = Math.max(1, Math.min(TOP_DIVISION, Math.trunc(Number(division) || 1)));
  return d >= TOP_DIVISION ? null : DIVISION_NAMES[d];
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

/** Index in the ranked list before which the cut is drawn, or null when drawing it would
 *  mislead.
 *
 *  `podiumCount` is how many top finishers the list does NOT contain. The podium was deleted
 *  on 2026-08-03 and every rank is now a row, so the board passes 0 — but the parameter stays
 *  because the arithmetic is the general one, and a caller that renders the leaders elsewhere
 *  would need it again.
 *
 *  Two null cases, both real: the top division promotes nobody, and a line at or past the
 *  end of the rendered rows would say "everyone here promotes" — which is false whenever
 *  the role filter has narrowed the view away from the real pool. */
export function promotionLineIndex(
  podiumCount: number, restCount: number, promoteCount: number,
): number | null {
  if (!promoteCount || promoteCount <= 0) return null;
  const idx = Math.max(0, promoteCount - podiumCount);
  return idx < restCount ? idx : null;
}

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
    if (!ahead) return { kind: "summit", value: null, label: "Diamond champion — hold the summit" };
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
