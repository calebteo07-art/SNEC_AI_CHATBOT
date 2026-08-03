"use client";
/* The League — a promotion-only weekly ladder.

   Third rebuild, and the first that changes the GENRE rather than the palette. The report was
   "very obvious ai slop, and did not seem like a game leaderboard". Both halves traced to the
   same thing: the page was a document ABOUT a league — a gradient headline, a white card
   explaining the mechanic in prose, and a 380px podium — with the ranks pushed below the fold.
   On a 390x844 phone exactly one ranked row was visible; on a 1280x900 desktop the first rank
   sat 790px down. A ladder screen where you cannot see the ladder is not a leaderboard, and a
   stack of soft white cards on a pastel mesh is the house style of every generated dashboard.

   What it is now, top to bottom: a tier BAND wearing the division's own metal (crest, name,
   trophy-road pips, the chase and the clock as a HUD readout) → the role filter → ONE board.
   The board is a single surface: hairline-separated rows starting at rank 1, the promotion
   zone as a filled gold region headed by its own label and ended by a struck cut. Everything
   that used to be explained in sentences is now a region you can see.

   Deleted with this pass: the Beam podium and its whole stage (sunburst, embers, ray, pool,
   shine, laurel, plinths), the gradient "The League" headline, and the standing card. The top
   three are not gone — they are the first three rows, wearing metal rank plates, with a crown
   on the champion. That is the trade the podium was losing: ~380px for three data points that
   a medal on a row carries for free.

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
import { computeChase, promotionLineIndex, nextDivisionName, TOP_DIVISION } from "@/aurora/leaderboard/league";
import { TierBand } from "@/aurora/components/leaderboard/TierBand";
import { LeagueRow, PromotionLine, PromotionZone } from "@/aurora/components/leaderboard/LeagueRow";
import { RowSheet } from "@/aurora/components/leaderboard/RowSheet";
import { RulesSheet } from "@/aurora/components/leaderboard/RulesSheet";
import { YouBar } from "@/aurora/components/leaderboard/YouBar";

export function Leaderboard() {
  const [role, setRole] = useState<string | null>(null);
  const [peek, setPeek] = useState<LeaderboardEntry | null>(null);
  const [rules, setRules] = useState(false);
  const [youVisible, setYouVisible] = useState(true);
  const youRef = useRef<HTMLLIElement | null>(null);
  const { data, isLoading } = useLeaderboard(role);

  const entries = data?.entries ?? [];
  const roles = data?.roles ?? [];
  const division = data?.division ?? 1;
  const promoteCount = data?.promote_count ?? 0;
  const you = entries.find((e) => e.is_you);

  const chase = useMemo(
    () => computeChase(entries, promoteCount, division >= TOP_DIVISION),
    [entries, promoteCount, division],
  );

  /* The promotion zone is drawn ONLY on the unfiltered board. `promote_count` counts the whole
     division, so overlaying it on a role-filtered view would put the cut at the wrong student
     and promise promotions that view can't award. Better no zone than a false one.
     The podium split is gone, so the list IS the division: index 0 is rank 1. */
  const lineAt = useMemo(
    () => (role ? null : promotionLineIndex(0, entries.length, promoteCount)),
    [role, entries.length, promoteCount],
  );

  const jumpToYou = useCallback(() => {
    youRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  /* Auto-scroll to your row once the rows have landed. Anyone inside the promotion zone is
     left where they are: the top of the board is already their news. */
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !you || !youRef.current) return;
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
  }, [you, lineAt, promoteCount]);

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
  }, [entries.length, role]);

  const next = nextDivisionName(division);

  return (
    <div className="lb-climb" data-testid="leaderboard-root">
      <TierBand
        division={division}
        divisionName={data?.division_name ?? "Bronze"}
        chase={chase}
        onRules={() => setRules(true)}
      />

      {roles.length > 1 && (
        <div className="lb-filter" role="tablist" aria-label="Filter by role">
          <button type="button" role="tab" aria-selected={role === null} className="lb-chip"
                  data-on={role === null} onClick={() => setRole(null)}>All</button>
          {roles.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={role === r} className="lb-chip"
                    data-on={role === r} onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
      )}

      {isLoading && !data ? (
        <p className="lb-empty">Reading the board…</p>
      ) : (
        <ol className="lg-list" data-testid="league-board">
          {entries.length > 0 ? (
            entries.map((e, i) => (
              <Fragment key={`${e.rank}-${e.name}`}>
                {lineAt !== null && i === 0 && <PromotionZone count={promoteCount} to={next} />}
                {lineAt === i && <PromotionLine />}
                <LeagueRow
                  e={e}
                  promo={lineAt !== null && i < lineAt}
                  onPeek={setPeek}
                  ref={e.is_you ? youRef : undefined}
                />
              </Fragment>
            ))
          ) : (
            <li className="lg-open" data-testid="lb-open-row">
              No one&rsquo;s on the board yet — earn Lumens to claim the first spot.
            </li>
          )}
        </ol>
      )}

      {you && !youVisible && (
        <YouBar you={you} promo={lineAt !== null && you.rank <= promoteCount} onJump={jumpToYou} />
      )}
      {peek && <RowSheet e={peek} onClose={() => setPeek(null)} />}
      {rules && <RulesSheet onClose={() => setRules(false)} />}
    </div>
  );
}
