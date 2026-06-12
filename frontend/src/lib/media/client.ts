"use client";
/* PHOTOPIC · GenerativeMediaClient
 * Resolves accents/loops from the static manifest (instant — the library is
 * versioned files under /media/, cache-first in the service worker).
 * Selection is deterministically seeded per (day, student, context) so the
 * interface feels alive across sessions without flickering within one.
 */
import { useQuery } from "@tanstack/react-query";
import type { Accent, LoopSpec, MediaManifest, NavContext } from "./types";

async function fetchManifest(): Promise<MediaManifest> {
  const res = await fetch("/media/manifest.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("media manifest unavailable");
  return res.json();
}

export function useMediaManifest() {
  return useQuery<MediaManifest>({
    queryKey: ["media-manifest"],
    queryFn: fetchManifest,
    staleTime: 60 * 60_000,
    retry: 1,
  });
}

/** FNV-1a — tiny, deterministic, good enough for picking an accent. */
function seedHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sessionSeed(ctx: string): number {
  let sid = "anon";
  try {
    sid = sessionStorage.getItem("eyebot_student_id") ?? "anon";
  } catch { /* private mode */ }
  return seedHash(`${new Date().toDateString()}|${sid}|${ctx}`);
}

export function accentsFor(
  manifest: MediaManifest | undefined,
  ctx: NavContext,
  n = 1,
): Accent[] {
  if (!manifest) return [];
  const pool = manifest.accents.filter((a) => a.context.includes(ctx));
  if (pool.length === 0) return [];
  const start = sessionSeed(ctx) % pool.length;
  return Array.from({ length: Math.min(n, pool.length) }, (_, i) => pool[(start + i) % pool.length]);
}

export function loopFor(
  manifest: MediaManifest | undefined,
  ctx: NavContext,
): LoopSpec | null {
  if (!manifest) return null;
  const pool = manifest.loops.filter((l) => l.context.includes(ctx));
  if (pool.length === 0) return null;
  return pool[sessionSeed(`loop|${ctx}`) % pool.length];
}
