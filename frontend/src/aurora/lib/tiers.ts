/* Single source of truth for the case difficulty → tier vocabulary.
   The STORED keys stay beginner/intermediate/advanced (the difficulty-unlock gate in
   tools/api/routers/cases.py and its tests depend on them); students only ever see the
   Foundational / Developing / Advanced names. Import TIERS for the ordered learning path
   (Cases journey) and tierLabel() anywhere a single case's tier is shown. */

export interface Tier {
  key: string;
  label: string;
  hint: string;
}

export const TIERS: Tier[] = [
  { key: "beginner", label: "Foundational", hint: "Build the basics" },
  { key: "intermediate", label: "Developing", hint: "Sharpen your reasoning" },
  { key: "advanced", label: "Advanced", hint: "Complex, high-stakes cases" },
];

const LABEL: Record<string, string> = Object.fromEntries(TIERS.map((t) => [t.key, t.label]));

/** Student-facing tier name for a stored difficulty key. Unknown keys pass through
    Title-cased so a case never renders a blank tier. */
export function tierLabel(difficulty: string | null | undefined): string {
  const key = (difficulty || "").toLowerCase();
  if (LABEL[key]) return LABEL[key];
  return difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : "";
}

/** Actionable note for a LOCKED case. Cases unlock account-wide (per role): a tier opens
    once the student has passed 2 cases of the tier immediately below it — mirroring the
    difficulty gate in tools/api/routers/cases.py, which counts passes across the whole
    role, not per topic. So the hint names the tier to clear and stresses it counts in ANY
    topic (several of the advanced OT topic-sets have no Foundational case of their own).
    Returns "" for Foundational / unknown tiers, which are never gated. */
export function unlockHint(difficulty: string | null | undefined): string {
  const i = TIERS.findIndex((t) => t.key === (difficulty || "").toLowerCase());
  if (i <= 0) return "";
  return `Clear 2 ${TIERS[i - 1].label} cases in any topic to unlock.`;
}
