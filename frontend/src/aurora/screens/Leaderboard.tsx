"use client";
/* Leaderboard (RICOE v2, D7) — everyone by default, ranked by XP, with Selena
   headshots. A student can hide themselves (opt-out) and set an optional display
   name. Role filter tabs rank within a role; the viewer's own row is highlighted.
   Photopic tokens + CSS-only motion (matches studio.css / motion.css policy). */
import { useEffect, useState } from "react";
import { useLeaderboard, useSetLeaderboardPrefs } from "@/hooks/useLeaderboard";
import { Selena } from "@/aurora/avatar/Selena";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function Leaderboard() {
  const [role, setRole] = useState<string | null>(null);
  const { data, isLoading } = useLeaderboard(role);
  const prefs = useSetLeaderboardPrefs();

  const entries = data?.entries ?? [];
  const roles = data?.roles ?? [];
  const youHidden = data?.you_hidden ?? false;

  // Local draft for the display-name field, seeded from the server value.
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => { setNameDraft(data?.display_name ?? ""); }, [data?.display_name]);
  const nameDirty = nameDraft.trim() !== (data?.display_name ?? "");

  const you = entries.find((e) => e.is_you);

  return (
    <div className="lb-wrap" data-testid="leaderboard-root">
      <header className="lb-head">
        <h1>Leaderboard</h1>
        <p className="lb-sub">
          Everyone in the cohort is here by default, ranked by total XP. Keep learning to
          climb — your Selena rides along. Prefer to stay off? You can hide yourself any time.
        </p>
      </header>

      {/* ── your visibility controls ─────────────────────────────── */}
      <section className="lb-you" aria-label="Your leaderboard settings">
        <div className="lb-you-row">
          <div className="lb-you-copy">
            <p className="lb-you-title">Show me on the leaderboard</p>
            <p className="lb-you-hint">
              {youHidden
                ? "You're hidden — no one can see you here, and you won't be ranked."
                : you
                  ? `You're visible — currently #${you.rank} with ${you.xp.toLocaleString()} XP.`
                  : "You're visible."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!youHidden}
            className="lb-switch"
            data-on={!youHidden}
            disabled={prefs.isPending}
            onClick={() => prefs.mutate({ hidden: !youHidden })}
          >
            <span className="lb-switch-knob" />
          </button>
        </div>

        <div className="lb-you-row">
          <label className="lb-you-copy" htmlFor="lb-name">
            <p className="lb-you-title">Display name <span className="lb-optional">(optional)</span></p>
            <p className="lb-you-hint">Shown instead of your name. Leave blank to use your first name + last initial.</p>
          </label>
          <div className="lb-name-field">
            <input
              id="lb-name"
              className="lb-name-input"
              type="text"
              maxLength={40}
              placeholder="e.g. Iris Champ"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
            <button
              type="button"
              className="lb-name-save"
              disabled={!nameDirty || prefs.isPending}
              onClick={() => prefs.mutate({ display_name: nameDraft.trim() })}
            >
              Save
            </button>
          </div>
        </div>
      </section>

      {/* ── role filter ──────────────────────────────────────────── */}
      {roles.length > 1 && (
        <div className="lb-filter" role="tablist" aria-label="Filter by role">
          <button type="button" role="tab" aria-selected={role === null} className="lb-chip" data-on={role === null} onClick={() => setRole(null)}>All</button>
          {roles.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={role === r} className="lb-chip" data-on={role === r} onClick={() => setRole(r)}>{r}</button>
          ))}
        </div>
      )}

      {/* ── the board ────────────────────────────────────────────── */}
      {isLoading && !data ? (
        <p className="lb-empty">Loading the board…</p>
      ) : entries.length === 0 ? (
        <p className="lb-empty" data-testid="lb-empty">
          The board&apos;s warming up — once the cohort starts earning XP, everyone shows up here.
        </p>
      ) : (
        <ol className="lb-list">
          {entries.map((e) => (
            <li key={`${e.rank}-${e.name}`} className="lb-row" data-you={e.is_you || undefined} data-top={e.rank <= 3 || undefined}>
              <span className="lb-rank" aria-hidden>{MEDALS[e.rank] ?? e.rank}</span>
              <span className="lb-face" aria-hidden>
                <Selena config={e.avatar_config ?? undefined} size={44} />
              </span>
              <span className="lb-meta">
                <span className="lb-name">{e.name}{e.is_you && <span className="lb-youtag">You</span>}</span>
                <span className="lb-sub2">
                  {e.role && <span className="lb-rolechip">{e.role}</span>}
                  {e.streak_days > 0 && <span className="lb-streak">🔥 {e.streak_days}d</span>}
                  <span className="lb-lvl">Lv {e.level}</span>
                </span>
              </span>
              <span className="lb-xp"><b>{e.xp.toLocaleString()}</b> XP</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
