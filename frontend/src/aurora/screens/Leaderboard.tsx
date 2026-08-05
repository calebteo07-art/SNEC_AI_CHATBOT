"use client";
/* The League — a promotion-only weekly ladder.

   FIFTH pass (2026-08-04), and the two before it are both load-bearing history:

   · Pass 4 read "very obvious ai slop, and did not seem like a game leaderboard" and answered
     the measurable half. The page had been a document ABOUT a league — a gradient headline, a
     white card explaining the mechanic in prose, and a 380px podium — with the ranks below the
     fold: ONE visible row at 390x844, the first rank 790px down at 1280x900. It deleted the
     podium and made every rank a row.
   · Pass 5 restores the podium, on request, and answers the half pass 4 did not: "world class
     game standard". The ladder being visible was necessary and nowhere near sufficient, because
     the objects were still flat — 1px hairlines, 5%-alpha shadows, pastel fills. Those ARE the
     generated-dashboard house style, and no amount of layout fixes them.

   So the stage comes back under a budget rather than under a taste argument: league_assert
   counts RANKS VISIBLE — these three plus the rows beneath them — and fails below 8. The
   podium may exist; it may not eat the ladder. Pass 4's ratio checks are deliberately NOT
   restored: 1.7x and 2x were held to the pixel across three rejected passes, which is what
   precise measurement of the wrong thing looks like.

   THREE objects, top to bottom (2026-08-05 — it was four):
     · the HEAD, one card in the division's own metal, in three rows behind one clip — the
       crest/name/trophy road, the chase readout, and the role lens on its bottom edge;
     · the PODIUM (ranks 1-3, painted 2-1-3);
     · ONE board holding rank 4 down, as a single surface with the promotion zone as a filled
       gold region ended by a struck cut.
   Everything that used to be explained in sentences is a region you can see; the rules live
   behind the (?).

   There is NO visibility panel here (removed on request, 2026-08-02). The board is therefore
   everyone-by-default with no in-app way out: POST /api/leaderboard/prefs still works and the
   payload still carries `you_hidden`/`display_name`/`you_would_be_rank`, but nothing on this
   page reads or writes them. A student already flagged `leaderboard_hidden` in the database
   keeps that state — they just see a ladder with no row of their own and no explanation.

   Backend: GET /api/leaderboard (tools/api/routers/student.py). `pool_size`/`promote_count`
   describe the REAL division and ignore the role filter, which is why the promotion zone is
   only drawn on the unfiltered view — see the note where it's computed. */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import {
  computeChase, countdownLabel, msToWeekClose, promotionLineIndex, splitPodium,
  nextDivisionName, TOP_DIVISION,
} from "@/aurora/leaderboard/league";
import { TierBand } from "@/aurora/components/leaderboard/TierBand";
import { METALS } from "@/aurora/components/leaderboard/Metals";
import { Podium } from "@/aurora/components/leaderboard/Podium";
import { LeagueRow, PromotionLine, PromotionZone } from "@/aurora/components/leaderboard/LeagueRow";
import { RowSheet } from "@/aurora/components/leaderboard/RowSheet";
import { RulesSheet } from "@/aurora/components/leaderboard/RulesSheet";
import { YouBar } from "@/aurora/components/leaderboard/YouBar";
import { ApiErrorNotice } from "@/aurora/components/ApiErrorNotice";

export function Leaderboard() {
  const [role, setRole] = useState<string | null>(null);
  const [peek, setPeek] = useState<LeaderboardEntry | null>(null);
  const [rules, setRules] = useState(false);
  const [youVisible, setYouVisible] = useState(true);
  /* ONE "where am I" element, which since 2026-08-04 may be either a ranked <li> or a podium
     <article>. A ref CALLBACK rather than a RefObject: those two element types cannot both
     satisfy one invariant RefObject<T>, and the alternative — tracking only rows — silently
     stops following anyone who reaches the top three, which is the half of the cohort most
     likely to scroll the board. */
  const youRef = useRef<HTMLElement | null>(null);
  const setYouEl = useCallback((el: HTMLElement | null) => { youRef.current = el; }, []);
  const { data, isLoading, isError } = useLeaderboard(role);

  const entries = data?.entries ?? [];
  const roles = data?.roles ?? [];
  const division = data?.division ?? 1;
  const metalIdx = Math.max(0, Math.min(TOP_DIVISION - 1, division - 1));
  const promoteCount = data?.promote_count ?? 0;
  const you = entries.find((e) => e.is_you);
  /* The scale every rung's gauge is drawn against: the top entry of whatever the server
     just returned, which is rank-sorted.
     ⚠ On a role-filtered view that is the best of THAT ROLE, not of the division — the
     `role` param narrows the view server-side and the list is renumbered from 1 (see
     tools/api/routers/student.py::leaderboard). The gauge therefore rescales with the
     lens, which is the consistent choice: the ranks beside it have already rescaled.
     Anchoring to the division leader is not available here — the filtered payload does
     not carry them, and inventing a second scale the ranks disagree with would be worse
     than either. */
  const topXp = entries[0]?.xp ?? 0;

  const chase = useMemo(
    () => computeChase(entries, promoteCount, division >= TOP_DIVISION),
    [entries, promoteCount, division],
  );

  /* The stage, and what is left to climb.
     BOTH the podium and the promotion zone are withheld on a role-filtered view, for the same
     reason: `promote_count` and the ranks both describe the whole division. A filtered cut
     would point at the wrong student, and a filtered podium would put the best three OA on a
     1-2-3 stage when their real ranks are 1, 3 and 6. Better no stage than a false one — and
     with `places` at 0 every rank falls back into the list, so nothing is lost, only re-framed.
     splitPodium also refuses an UNDERFILLED stage, which is what keeps a two-student cohort
     from rendering a podium with a hole in it. */
  const { podium, rest } = useMemo(
    () => splitPodium(entries, role ? 0 : 3),
    [entries, role],
  );
  const lineAt = useMemo(
    () => (role ? null : promotionLineIndex(podium.length, rest.length, promoteCount)),
    [role, podium.length, rest.length, promoteCount],
  );
  /* THE CUT IS DRAWN ONCE. When the cut lands at index 0 the whole promoted set is standing
     on the stage, and the deck says so in words a few pixels above ("Top 3 promote to Gold")
     — so a bar at the top of the ladder is the same boundary stated twice in two visual
     languages. It is withheld there, and it is what pays for the deck's caption row.
     ⚠ It still draws everywhere else, and "everywhere else" is real rather than theoretical:
     below three entries splitPodium refuses the stage entirely, so a two-student cohort has
     its promoted rank IN the ladder and needs the line. That case is gated. */
  const showCut = lineAt !== null && !(lineAt === 0 && podium.length > 0);

  const jumpToYou = useCallback(() => {
    youRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  /* Auto-scroll to your row once the rows have landed. Anyone inside the promotion zone is
     left where they are: the top of the board is already their news.
     A student ON THE STAGE is skipped outright and not merely by the zone test above — the
     zone test is `null` at the top division and on a filtered view, and centring a podium slot
     that already sits 90px down the page would scroll the tier band off the top to show
     something the reader can see perfectly well. */
  const scrolled = useRef(false);
  const youOnStage = podium.some((e) => e.is_you);
  useEffect(() => {
    if (scrolled.current || !you || !youRef.current || youOnStage) return;
    if (lineAt !== null && you.rank <= promoteCount) return;
    scrolled.current = true;
    const reduce = document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { youRef.current.scrollIntoView({ block: "center" }); return; }
    const id = setTimeout(
      () => youRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }),
      700,
    );
    return () => clearTimeout(id);
  }, [you, lineAt, promoteCount, youOnStage]);

  /* The sticky bar exists only while your row is off-screen — where "off-screen" has to mean
     off-screen TO THE STUDENT, not to the intersection observer. The bottom nav floats over
     the scroll area, and the bar itself would sit in the same strip, so a row peeking into the
     last ~90px is behind furniture. On the dense board that is not a corner case: at 390x844
     rank 12 lands at y=817 in an 844px viewport, which the observer scored as 49% visible
     while the reader could see none of it. rootMargin shrinks the root's bottom edge to the
     strip that is actually readable. */
  useEffect(() => {
    const el = youRef.current;
    if (!el) { setYouVisible(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => setYouVisible(entry.isIntersecting),
      { threshold: 0.4, rootMargin: "0px 0px -96px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // podium.length matters as well as rest.length: crossing into or out of the top three
    // moves the observed element from an <li> to an <article> without changing the total.
  }, [rest.length, podium.length, role]);

  const next = nextDivisionName(division);

  /* HOW MANY OF EACH ROLE (2026-08-04). The lens strip was a full-width bar holding three
     control-sized chips at one end and a 12px count at the other — 527px of empty strip at a
     860px board, 843px at 1180. Chips that state their own size fill it with the answer to
     the question the strip already invites: not just "who am I racing" but "how many of them".
     ⚠ CAPTURED WHILE THE LENS IS OFF. `role` narrows `entries` server-side, so a filtered
     payload can only count its own role — the numbers have to come from the unfiltered read
     and be remembered. `role` is null on first load, so they are always populated before any
     chip can be pressed; a role restored from a future URL would simply show bare chips.
     The count is exact: the payload carries the whole division, never a page of it. */
  const counted = useMemo(() => {
    if (role !== null) return null;
    const n: Record<string, number> = {};
    for (const e of entries) if (e.role) n[e.role] = (n[e.role] ?? 0) + 1;
    return n;
  }, [role, entries]);
  const lastCounts = useRef<Record<string, number>>({});
  useEffect(() => { if (counted) lastCounts.current = counted; }, [counted]);
  const roleCounts = counted ?? lastCounts.current;

  /* The week clock. It used to live inside TierBand; it moved here on 2026-08-04 when the
     deck's right flank became its home, and the state came with it rather than being read
     twice. Starts null and fills in on the client — rendering a countdown during SSR would
     hydrate against a different minute and mismatch, and a beat of no-clock is invisible.
     ⚠ Real Singapore time, never the viewer's: the server closes the week on the SGT Monday
     boundary (tools/shared/clock.py), so a local countdown is up to 15 hours wrong, which on
     a Sunday night is the difference between "still time" and "already over". */
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setClock(countdownLabel(msToWeekClose(new Date())));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  /* After every hook, never before. A failed read has no division and no ranks, and the
     defaults above would otherwise draw a complete-looking Bronze board captioned "No one's
     on the board yet" — a statement about the cohort, made from a network failure. */
  if (isError && !data) {
    return (
      <div className="lb-climb" data-testid="leaderboard-root">
        <ApiErrorNotice cause="The League didn’t load" className="aurora-api-error--page" />
      </div>
    );
  }

  return (
    // data-metal drives the CANVAS as well as the band: the page field is tinted and striped
    // in your own division's metal, so climbing re-skins the whole screen rather than one
    // card. Same "hue is identity" rule the lock already carries, spent on the largest
    // surface available instead of the smallest.
    <div className="lb-climb" data-testid="leaderboard-root" data-metal={METALS[metalIdx]}>
      <TierBand
        division={division}
        divisionName={data?.division_name ?? "Bronze"}
        multiplier={data?.division_multiplier ?? 1}
        multipliers={data?.division_multipliers ?? []}
        chase={chase}
        onRules={() => setRules(true)}
      >
        {/* THE LENS IS THE BAND'S THIRD ROW (2026-08-05, "combine the top 2 cards, silver
            league and role filter, into 1 and make it seamless"). It was the block below it,
            sharing the board's edge — which was the 08-04 answer and got the page as far as
            four objects agreeing where the margins were. Two struck cards stacked a few px
            apart still read as two things to look at, and the head is ONE thing.
            Nesting rather than restyling is what makes "seamless" structural: `.tb` clips, so
            the strip cannot have a radius, an outline or a lip of its own, and there is
            nothing left to keep in sync by hand. The state stays HERE because `role` is the
            query key `useLeaderboard` runs on; the band contributes the surface.
            `role="tablist"` sits on the inner group so the list still contains only tabs —
            the count beside them is a readout, not a control. */}
        {roles.length > 1 && (
          <div className="lb-filter">
            <div className="lb-chips" role="tablist" aria-label="Filter by role">
              {/* ⚠ An explicit label on each chip. The count is a sibling text node with no
                  space before it, so the computed accessible name would be "OT7" — one token,
                  and a screen reader is entitled to say it as one. */}
              <button type="button" role="tab" aria-selected={role === null} className="lb-chip"
                      aria-label={`All roles, ${data?.pool_size || entries.length} students`}
                      data-on={role === null} onClick={() => setRole(null)}>
                All<span className="lb-chip-n">{data?.pool_size || entries.length}</span>
              </button>
              {roles.map((r) => (
                <button key={r} type="button" role="tab" aria-selected={role === r} className="lb-chip"
                        aria-label={roleCounts[r] !== undefined ? `${r}, ${roleCounts[r]} students` : r}
                        data-role={r} data-on={role === r} onClick={() => setRole(r)}>
                  {r}{roleCounts[r] !== undefined && <span className="lb-chip-n">{roleCounts[r]}</span>}
                </button>
              ))}
            </div>
            {/* "Who am I actually racing" moved ONTO the chips as counts (2026-08-04), which is
                where it belongs — the number now sits on the control that selects that group.
                This end of the strip takes the fact that had no home at all: what the ranking
                is OF. Nothing outside the (?) sheet said it, and a ladder whose sort order you
                have to guess is a ladder you cannot play deliberately. */}
            {/* ⚠ TWO WORDINGS, one per tier, because each tier can only afford one of the two
                facts. On a 390px strip the chips have no room for their counts, so this end
                carries the pool size (its original job); on desktop the chips state their own
                counts and this end is free to say what the ranking is OF. Both spans always
                render — the contrast probe resolves `.lb-count` itself, and an element that
                only exists at some widths only gets checked at some widths. */}
            {(data?.pool_size ?? 0) > 0 && (
              <span className="lb-count" data-testid="lb-pool">
                <span className="lb-count-sm">{data?.pool_size} in your division</span>
                <span className="lb-count-lg">Ranked by Lumens earned this week</span>
              </span>
            )}
          </div>
        )}
      </TierBand>

      {podium.length > 0 && (
        <Podium
          places={podium} promoteCount={promoteCount} promoteTo={next} clock={clock}
          onPeek={setPeek} youRef={setYouEl}
        />
      )}

      {isLoading && !data ? (
        <p className="lb-empty">Reading the board…</p>
      ) : (
        <ol className="lg-list" data-testid="league-board">
          {rest.length > 0 ? (
            rest.map((e, i) => (
              <Fragment key={`${e.rank}-${e.name}`}>
                {/* The zone header is withheld when the cut falls at index 0 — every promoted
                    student is already on the stage, so the header would caption an empty gold
                    region. The cut itself still draws: a line at the very top of the ladder
                    says "everything above this promotes", which is exactly true. */}
                {lineAt !== null && lineAt > 0 && i === 0 && <PromotionZone count={promoteCount} to={next} />}
                {showCut && lineAt === i && <PromotionLine />}
                <LeagueRow
                  e={e}
                  promo={lineAt !== null && i < lineAt}
                  onPeek={setPeek}
                  topXp={topXp}
                  ref={e.is_you ? setYouEl : undefined}
                />
              </Fragment>
            ))
          ) : (
            <li className="lg-open" data-testid="lb-open-row">
              {podium.length > 0
                ? "That’s the whole division this week — the ladder fills in as more students join."
                : "No one’s on the board yet — earn Lumens to claim the first spot."}
            </li>
          )}
        </ol>
      )}

      {you && !youVisible && (
        <YouBar you={you} promo={lineAt !== null && you.rank <= promoteCount} onJump={jumpToYou} />
      )}
      {peek && <RowSheet e={peek} onClose={() => setPeek(null)} />}
      {rules && (
        <RulesSheet
          onClose={() => setRules(false)}
          division={division}
          multipliers={data?.division_multipliers ?? []}
        />
      )}
    </div>
  );
}
