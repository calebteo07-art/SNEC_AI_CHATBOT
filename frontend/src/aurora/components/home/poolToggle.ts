/* Pure, DOM-free helpers for the homepage content-pool toggle (spec §4). The toggle flips a
   trainer/admin's OWN student_profiles.role between the OA (clinical / OA·PSA) and OT pools;
   every content + gamification surface already reads the pool from that role, so no new content
   plumbing is needed. Kept dependency-free so it's unit-testable under Node type-stripping. */

export type Pool = "OA" | "OT";

/** The two segments of the loud switch. "OA" is the clinical pool shared by OA + PSA. */
export const POOL_SEGMENTS: { value: Pool; label: string }[] = [
  { value: "OA", label: "OA · PSA" },
  { value: "OT", label: "OT" },
];

/** Which segment is lit for a given stored profile role. OA / PSA / "" all map to the OA
    clinical pool (OA ≡ PSA content); only an explicit "OT" lights the OT segment. */
export function activePool(studentRole: string): Pool {
  return studentRole === "OT" ? "OT" : "OA";
}

/** React-Query keys whose data is pool-dependent — invalidated on every flip so the whole app
    (flashcards, cases, leaderboard, progress) re-reads the newly selected discipline's content. */
export const POOL_INVALIDATE_KEYS: string[][] = [
  ["progress"],
  ["flashcard-topics"],
  ["flashcards"],
  ["leaderboard"],
  ["cases"],
];
