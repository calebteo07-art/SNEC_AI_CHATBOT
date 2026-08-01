"use client";
/* The League — a promotion-only weekly ladder on a black stage.

   Supersedes the "vibrant & seamless" board (locked 2026-07-13). That board ranked everyone
   by Lumens and stopped there, so 27 of 30 students were reading a list they could not act
   on. Here the division is earned, the week ends on a clock, and a labelled promotion line
   cuts across the list: everything above it moves up on Monday, and nobody is ever demoted.

   Layout, top to bottom: division ladder + countdown → the chase → the Beam (top three) →
   the ranked league with the promotion line → the privacy controls.

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
import { ChaseStat } from "@/aurora/components/leaderboard/ChaseStat";
import { LeagueRow, PromotionLine } from "@/aurora/components/leaderboard/LeagueRow";
import { RowSheet } from "@/aurora/components/leaderboard/RowSheet";
import { YouBar } from "@/aurora/components/leaderboard/YouBar";
import { BoardSettings } from "@/aurora/components/leaderboard/BoardSettings";

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
        <p className="lb-eyebrow">Weekly league</p>
        <h1 className="lb-title">The League</h1>
        <DivisionStrip division={division} divisionName={data?.division_name ?? "Bronze"} />
      </header>

      {isLoading && !data ? (
        <p className="lb-empty">Lighting the stage…</p>
      ) : (
        <>
          <ChaseStat chase={chase} />
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

          <BoardSettings
            hidden={data?.you_hidden ?? false}
            displayName={data?.display_name ?? null}
            wouldBeRank={data?.you_would_be_rank ?? null}
          />
        </>
      )}

      {you && !youVisible && (
        <YouBar you={you} promo={lineAt !== null && you.rank <= promoteCount} onJump={jumpToYou} />
      )}
      {peek && <RowSheet e={peek} onClose={() => setPeek(null)} />}
    </div>
  );
}
