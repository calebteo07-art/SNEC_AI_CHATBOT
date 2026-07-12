/* Your standing — the addiction loop. Shows the exact XP to overtake the person above
   (and whether that reaches the podium) plus how close the chaser below is. Handles #1,
   last place, and the hidden state. */
"use client";
import { Selena } from "@/aurora/avatar/Selena";
import { tierForXp, type Rivals } from "@/aurora/leaderboard/tiers";
import { TierCrest } from "./crests";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import type { CSSProperties } from "react";

function gapPct(gap: number) {
  // closer → fuller bar (0 XP away → 100%, 500+ away → 6%): "you're so close"
  return Math.max(6, Math.min(100, Math.round(100 - (Math.min(gap, 500) / 500) * 94)));
}

export function RivalrySpotlight({
  you, rivals, youHidden, onShow, podiumRank = 3,
}: {
  you: LeaderboardEntry | undefined;
  rivals: Rivals | null;
  youHidden: boolean;
  onShow: () => void;
  podiumRank?: number;
}) {
  if (youHidden) {
    return (
      <section className="lb-spot is-hidden" data-testid="rivalry-spotlight">
        <div>
          <p className="lb-spot-title">You&apos;re hidden from the climb</p>
          <p className="lb-spot-hint">No one can see you or rank you. Show yourself to start climbing.</p>
        </div>
        <button type="button" className="lb-btn primary" onClick={onShow}>Show me on the board</button>
      </section>
    );
  }
  if (!you) return null;
  const tier = tierForXp(you.xp);
  const above = rivals?.above ?? null;
  const below = rivals?.below ?? null;
  const reachesPodium = !!above && above.rank <= podiumRank;
  return (
    <section className="lb-spot" data-testid="rivalry-spotlight" aria-label="Your standing">
      <div className="lb-spot-you">
        <div className="lb-spot-rankbig">#{you.rank}<small>your rank</small></div>
        <span className="lb-spot-face" style={{ "--rc": tier.c2 } as CSSProperties}>
          <Selena portraitUrl={you.portrait_url} background={you.avatar_config?.background} size={60} />
        </span>
        <div>
          <div className="lb-spot-name">You · {you.name}</div>
          <div className="lb-spot-tags">
            <span className="lb-tierchip" style={{ background: `${tier.c1}33`, color: tier.ink }}><TierCrest tier={tier} size={12} /> {tier.name}</span>
            {you.streak_days > 0 && <span>🔥 {you.streak_days}-day streak</span>}
            <span>Level {you.level}</span>
          </div>
        </div>
      </div>

      <div className="lb-rivals">
        {above ? (
          <div className="lb-rival">
            <div className="lb-rlbl"><span className="up">▲ {above.gap.toLocaleString()} Lumens</span> to overtake <b>{above.name} (#{above.rank})</b>{reachesPodium ? " — and reach the podium" : ""}</div>
            <div className="lb-gapbar ahead"><span style={{ width: `${gapPct(above.gap)}%` }} /></div>
          </div>
        ) : (
          <div className="lb-rival">
            <div className="lb-rlbl">👑 You&apos;re on top{below ? <> — <b>{below.gap.toLocaleString()} Lumens</b> clear of #{below.rank}</> : ""}</div>
          </div>
        )}
        {below && (
          <div className="lb-rival">
            <div className="lb-rlbl"><b>{below.name} (#{below.rank})</b> is <span className="dn">{below.gap.toLocaleString()} Lumens</span> behind — keep climbing</div>
            <div className="lb-gapbar behind"><span style={{ width: `${gapPct(below.gap)}%` }} /></div>
          </div>
        )}
      </div>

      <div className="lb-spot-cta">
        <a className="lb-btn primary" href="/flashcards">⚡ Earn Lumens</a>
      </div>
    </section>
  );
}
