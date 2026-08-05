"use client";
/* AURORA Home — the loud content-pool toggle (spec §4). Rendered ONLY for trainer/admin, in
   Dashboard's top bar beside the Level chip. Flipping a segment optimistically switches the
   caller's OWN student_profiles.role between the OA (clinical / OA·PSA) and OT pools, persists
   it via PATCH /api/profile/role, and invalidates every pool-dependent query so flashcards,
   cases, leaderboard and progress re-read the new discipline's content. */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/screens/AuthContext";
import { activePool, POOL_SEGMENTS, POOL_INVALIDATE_KEYS, type Pool } from "./poolToggle";
import { apiErrorMessage } from "@/aurora/lib/apiError";

export function PoolToggle() {
  const { user, setStudentRole } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const current = activePool(user?.studentRole ?? "");

  const select = async (next: Pool) => {
    if (busy || next === current) return;
    const prev = current;
    setBusy(true);
    setStudentRole(next); // optimistic — the whole app re-reads the pool immediately
    try {
      const res = await fetch("/api/profile/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: next }),
      });
      if (!res.ok) throw new Error("role update failed");
      POOL_INVALIDATE_KEYS.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    } catch {
      setStudentRole(prev); // roll back the optimistic flip
      toast.error(apiErrorMessage("Could not switch content pool"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hm-pool">
      <div className="hm-pool-seg struck-pill" role="tablist" aria-label="Content pool">
        {POOL_SEGMENTS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={current === s.value}
            data-active={current === s.value}
            disabled={busy}
            onClick={() => select(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <span className="hm-pool-help" tabIndex={0} aria-label="What is this?">
        ?
        <span className="hm-pool-tip" role="tooltip">
          Switch which discipline&rsquo;s content you&rsquo;re viewing — flashcards, virtual
          patients, the daily check-in and the leaderboard all follow the pool you pick.
        </span>
      </span>
    </div>
  );
}
