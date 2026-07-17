/* Pure, dependency-free resolver for "what do we call the signed-in person?".
   No React/imports so it stays unit-testable via Node type-stripping
   (see frontend/tests/display_name_assert.mjs).

   Why this exists: an identity can legitimately degrade to a raw email address —
   staff (the super-admin and promoted supervisors) have no approved_students row,
   so there is no roster name to seed `student_name` from. Rendering that verbatim
   greeted the super-admin as "Good evening, snec.tne.edu@gmail.com." Every surface
   that shows a user's name goes through here, so an address can never reach the UI
   as a name again; when we truly have nothing, callers get a neutral fallback. */

/** Turn an email local part into something name-shaped: "caleb.teo07" → "Caleb Teo". */
function humanise(local: string): string {
  return local
    .split("+")[0]              // drop the +tag — it's routing, not a name
    .split(/[._\-\s]+/)         // dots/underscores/hyphens separate words
    .map((w) => w.replace(/\d+$/, ""))  // trailing digits are noise ("teo07" → "teo")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * The person's full display name — never a raw email address.
 * Falls back when the identity is missing, blank, or humanises to nothing.
 */
export function displayName(fullName?: string | null, fallback = "there"): string {
  const raw = (fullName ?? "").trim();
  if (!raw) return fallback;
  // A name never contains "@" — so anything that does is an address, not a person.
  // Testing for that beats matching a well-formed email: it also catches the junk
  // ("@@@", a half-typed address) that a strict regex would wave through verbatim.
  if (!raw.includes("@")) return raw;
  return humanise(raw.split("@")[0]) || fallback;
}

/** Just the first name — what the greetings use. */
export function firstNameOf(fullName?: string | null, fallback = "there"): string {
  return displayName(fullName, fallback).split(" ")[0];
}
