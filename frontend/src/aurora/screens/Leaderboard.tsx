"use client";
/* The League — a promotion-only weekly ladder on a black stage.

   Supersedes the "vibrant & seamless" board (locked 2026-07-13). That board ranked everyone
   by Lumens and stopped there, so 27 of 30 students were reading a list they could not act
   on. Here the division is earned, the week ends on a clock, and a labelled promotion line
   cuts across the list: everything above it moves up on Monday, and nobody is ever demoted.

   Layout, top to bottom: the title → ONE standing card (ladder + chase + stakes + countdown +
   "how the league works") → the Beam (top three) → role filter → the ranked league with the
   promotion line.

   Rebuilt 2026-08-03 onto the AURORA LIGHT canvas after the black-stage version was rejected
   twice — see the header of leaderboard.css, which names every locked rule it supersedes. The
   header used to be eight separate centred islands; it is now a title and one card, which is
   why `chase` is handed to the standing card rather than rendered beside it, and why the
   ladder owns the explanation of the whole mechanic along with `promote_count`.

   There is NO visibility panel here (removed on request, 2026-08-02). The board is therefore
   everyone-by-default with no in-app way out: POST /api/leaderboard/prefs still works and the
   payload still carries `you_hidden`/`display_name`/`you_would_be_rank`, but nothing on this
   page reads or writes them. A student already flagged `leaderboard_hidden` in the database
   keeps that state — they just see a ladder with no row of their own and no explanation.

   Backend: GET /api/leaderboard (tools/api/routers/student.py). `pool_size`/`promote_count`
   describe the REAL division and ignore the role filter, which is why the promotion line is
   only drawn on the unfiltered view — see the note where it's computed. */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import {
  splitPodium, computeChase, promotionLineIndex, nextDivisionName, TOP_DIVISION,
} from "@/aurora/leaderboard/league";
import { Beam } from "@/aurora/components/leaderboard/Beam";
import { DivisionStrip } from "@/aurora/components/leaderboard/DivisionStrip";
import { LeagueRow, PromotionLine } from "@/aurora/components/leaderboard/LeagueRow";
import { RowSheet } from "@/aurora/components/leaderboard/RowSheet";
import { YouBar } from "@/aurora/components/leaderboard/YouBar";

export function Leaderboard() {
  const [role, setRole] = useState<string | null>(null);
  const [peek, setPeek] = useState<LeaderboardEntry | null>(null);
  const [youVisible, setYouVisible] = useState(true);
  const youRef = useRef<HTMLLIElement | null>(null);
  const { data, isLoading } = useLeaderboard(role);

  const entries = data?.entries ?? [];
  const roles = data?.roles ?? [];
  const division = data?.division ?? 1;
  const promoteCount = data?.promote_count ?? 0;
  const you = entries.find((e) => e.is_you);

  const { podium, rest } = useMemo(() => splitPodium(entries), [entries]);
  const chase = useMemo(
    () => computeChase(entries, promoteCount, division >= TOP_DIVISION),
    [entries, promoteCount, division],
  );

  /* The promotion line is drawn ONLY on the unfiltered board. `promote_count` counts the
     whole division, so overlaying it on a role-filtered view would put the line at the wrong
     student and promise promotions that view can't award. Better no line than a false one. */
  const lineAt = useMemo(
    () => (role ? null : promotionLineIndex(podium.length, rest.length, promoteCount)),
    [role, podium.length, rest.length, promoteCount],
  );

  const jumpToYou = useCallback(() => {
    youRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  /* Auto-scroll to your row, but only after the Beam has played — the podium is the payoff
     of the page and yanking past it on load would throw it away. Podium finishers are left
     where they are: they're already looking at themselves. */
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !you || you.rank <= 3 || !youRef.current) return;
    scrolled.current = true;
    const reduce = document.documentElement.dataset.motion === "reduce" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { youRef.current.scrollIntoView({ block: "center" }); return; }
    const id = setTimeout(
      () => youRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }),
      900,
    );
    return () => clearTimeout(id);
  }, [you]);

  // The sticky bar exists only while your row is off-screen.
  useEffect(() => {
    const el = youRef.current;
    if (!el) { setYouVisible(true); return; }
    const io = new IntersectionObserver(
      ([entry]) => setYouVisible(entry.isIntersecting),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rest.length, role]);

  return (
    <div className="lb-climb" data-testid="leaderboard-root">
      <header className="lb-head">
        <h1 className="lb-title">The League</h1>
      </header>

      <DivisionStrip
        division={division}
        divisionName={data?.division_name ?? "Bronze"}
        promoteCount={promoteCount}
        chase={chase}
      />

      {isLoading && !data ? (
        <p className="lb-empty">Setting the stage…</p>
      ) : (
        <>
          <Beam podium={podium} />

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

          <ol className="lg-list">
            {rest.length > 0 ? (
              rest.map((e, i) => (
                <Fragment key={`${e.rank}-${e.name}`}>
                  {lineAt === i && (
                    <PromotionLine count={promoteCount} to={nextDivisionName(division)} />
                  )}
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
                {entries.length === 0
                  ? "No one's on the board yet — earn Lumens to claim the first spot."
                  : "These ranks are open — keep studying to climb into them."}
              </li>
            )}
          </ol>
        </>
      )}

      {you && !youVisible && (
        <YouBar you={you} promo={lineAt !== null && you.rank <= promoteCount} onJump={jumpToYou} />
      )}
      {peek && <RowSheet e={peek} onClose={() => setPeek(null)} />}
    </div>
  );
}
