"use client";
/* The privacy control — restored.

   `useSetLeaderboardPrefs` has existed and worked since migration 008, but nothing imported
   it: the old header took a `settings` prop the screen never passed, so the hide-me toggle
   was unreachable from the running app while POST /api/leaderboard/prefs kept accepting
   writes. On a named, supervisor-visible cohort board that is a real privacy gap, not a
   missing nicety — so it comes back regardless of the redesign.

   A hidden student still sees their own board; they simply appear to no one and hold no
   promotion slot (the server excludes them from the pool). The copy says so, because a
   toggle whose consequences are invisible is one students won't trust. */
import { useEffect, useState } from "react";
import { useSetLeaderboardPrefs } from "@/hooks/useLeaderboard";

export function BoardSettings({ hidden, displayName }: { hidden: boolean; displayName: string | null }) {
  const prefs = useSetLeaderboardPrefs();
  const [name, setName] = useState(displayName ?? "");

  // The payload is the source of truth: re-sync when a refetch brings a different value
  // (another device, or our own mutation landing) so the field can't drift from the server.
  useEffect(() => { setName(displayName ?? ""); }, [displayName]);

  const dirty = name.trim() !== (displayName ?? "").trim();

  return (
    <section className="bs" aria-label="Board settings">
      <h2 className="bs-h">Your visibility</h2>

      <div className="bs-row">
        <div className="bs-copy">
          <p className="bs-lbl" id="bs-hide-lbl">Hide me from the league</p>
          <p className="bs-hint">
            You&apos;ll still see your own board. Others won&apos;t see you, and you won&apos;t hold a
            promotion slot.
          </p>
        </div>
        <button
          type="button"
          className="bs-switch"
          data-testid="lb-hide-switch"
          role="switch"
          aria-checked={hidden}
          aria-labelledby="bs-hide-lbl"
          data-on={hidden}
          disabled={prefs.isPending}
          onClick={() => prefs.mutate({ hidden: !hidden })}
        >
          <span className="bs-knob" aria-hidden />
        </button>
      </div>

      <div className="bs-row">
        <div className="bs-copy">
          <label className="bs-lbl" htmlFor="bs-name">Display name</label>
          <p className="bs-hint">Optional. Leave blank to use your roster name.</p>
        </div>
        <div className="bs-field">
          <input
            id="bs-name"
            className="bs-input"
            value={name}
            maxLength={40}
            placeholder="Roster name"
            onChange={(ev) => setName(ev.target.value)}
          />
          <button
            type="button"
            className="bs-save"
            disabled={!dirty || prefs.isPending}
            onClick={() => prefs.mutate({ display_name: name.trim() })}
          >
            Save
          </button>
        </div>
      </div>

      {prefs.isError && <p className="bs-err" role="alert">Couldn&apos;t save that — try again.</p>}
    </section>
  );
}
