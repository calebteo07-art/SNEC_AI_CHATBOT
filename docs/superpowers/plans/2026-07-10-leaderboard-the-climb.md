# Leaderboard "The Climb" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the leaderboard as a premium, gamified, addicting board ("The Climb") in the homepage's warm-premium aesthetic — podium (top 3), a live rivalry spotlight, XP tiers (Bronze→Diamond), and glowing tier-banded rows — with zero backend/DB change.

**Architecture:** Pure client-side derivation from the existing `/api/leaderboard` payload. A dependency-free `tiers.ts` module supplies tier lookup + standings math (rivals/podium/bands). Focused presentational components (`components/leaderboard/*`) compose the screen; `<Selena>` renders headshots and `useCountUp` animates XP. A scoped `.lb-climb` CSS namespace reuses the home palette; a `:has()` rule paints the warm canvas. Generated tier-crest art is a gated, paid follow-up that swaps in over committed SVG fallbacks.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, TanStack Query, `canvas-confetti` (already a dep), Playwright `.mjs` harness, Node type-stripping for pure-logic unit tests, Python + PIL + Nano-Banana-flash for the art pipeline.

**Spec:** `docs/superpowers/specs/2026-07-10-leaderboard-the-climb-design.md`

---

## File structure

**Create:**
- `frontend/src/aurora/leaderboard/tiers.ts` — dependency-free: `Tier`/`TierId`/`EntryLike`/`RivalGap`/`Rivals` types, `TIERS`, `tierForXp`, `computeRivals`, `splitPodium`, `bandRows`.
- `frontend/src/aurora/components/leaderboard/crests.tsx` — `TierCrest`, `ChampionCrown` (SVG; webp-preferring in the gated art task).
- `frontend/src/aurora/components/leaderboard/LeaderboardHeader.tsx`
- `frontend/src/aurora/components/leaderboard/Podium.tsx`
- `frontend/src/aurora/components/leaderboard/RivalrySpotlight.tsx`
- `frontend/src/aurora/components/leaderboard/TierBand.tsx`
- `frontend/src/aurora/components/leaderboard/LeaderboardRow.tsx`
- `frontend/src/aurora/components/leaderboard/BoardSettings.tsx`
- `frontend/tests/leaderboard_logic.mjs` — pure-logic unit harness (Node type-stripping).
- `tools/leaderboard/__init__.py`, `tools/leaderboard/crest_art.py`, `tools/leaderboard/generate_crests.py` — art pipeline.
- `tests/test_crest_registry.py` — registry completeness.

**Modify:**
- `frontend/src/aurora/screens/Leaderboard.tsx` — full rewrite (compose the new components).
- `frontend/src/aurora/leaderboard.css` — full rewrite (warm `.lb-climb` namespace).
- `frontend/src/aurora/aurora.css` — add the `.aurora-main:has(.lb-climb)` warm canvas.
- `frontend/tests/aurora_assert.mjs` — rewrite the leaderboard section + expand the mock cohort.
- `docs/design-locks.md` — add the Leaderboard lock entry.
- `MEMORY.md` / memory files — record the redesign.

**Untouched:** `frontend/src/hooks/useLeaderboard.ts` (payload unchanged), backend routers, DB.

---

### Task 1: Pure logic — `tiers.ts` + unit harness (TDD)

**Files:**
- Create: `frontend/src/aurora/leaderboard/tiers.ts`
- Test: `frontend/tests/leaderboard_logic.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/leaderboard_logic.mjs`:

```js
/* Pure unit test for the leaderboard tier + standings math. Run with Node's type
   stripping (tiers.ts is dependency-free, mirrors greeting_assert.mjs):
     node --experimental-strip-types frontend/tests/leaderboard_logic.mjs */
import assert from "node:assert";
import { tierForXp, computeRivals, splitPodium, bandRows, TIERS } from "../src/aurora/leaderboard/tiers.ts";

// 1) tier boundaries (inclusive lower bounds)
assert.strictEqual(tierForXp(0).id, "bronze");
assert.strictEqual(tierForXp(1999).id, "bronze");
assert.strictEqual(tierForXp(2000).id, "silver");
assert.strictEqual(tierForXp(4499).id, "silver");
assert.strictEqual(tierForXp(4500).id, "gold");
assert.strictEqual(tierForXp(6999).id, "gold");
assert.strictEqual(tierForXp(7000).id, "platinum");
assert.strictEqual(tierForXp(9999).id, "platinum");
assert.strictEqual(tierForXp(10000).id, "diamond");
assert.strictEqual(tierForXp(999999).id, "diamond");
assert.strictEqual(TIERS.length, 5);

// 2) computeRivals — middle of the pack sees both neighbours
const E = [
  { rank: 1, name: "A", xp: 12000, is_you: false },
  { rank: 2, name: "B", xp: 9000, is_you: false },
  { rank: 3, name: "C", xp: 7720, is_you: false },
  { rank: 4, name: "You", xp: 7660, is_you: true },
  { rank: 5, name: "D", xp: 7635, is_you: false },
];
const you = E.find((e) => e.is_you);
const rv = computeRivals(E, you);
assert.strictEqual(rv.above.gap, 60);
assert.strictEqual(rv.above.name, "C");
assert.strictEqual(rv.above.rank, 3);
assert.strictEqual(rv.below.gap, 25);
assert.strictEqual(rv.below.name, "D");

// 3) #1 has no one above; last has no one below
const T = [{ rank: 1, name: "You", xp: 100, is_you: true }, { rank: 2, name: "X", xp: 80, is_you: false }];
assert.strictEqual(computeRivals(T, T[0]).above, null);
assert.strictEqual(computeRivals(T, T[0]).below.gap, 20);
assert.strictEqual(computeRivals(T, T[1]).below, null);
assert.strictEqual(computeRivals(T, T[1]).above.gap, 20);

// 4) hidden / absent viewer → null
assert.strictEqual(computeRivals(E, null), null);
assert.strictEqual(computeRivals([{ rank: 1, name: "X", xp: 1, is_you: false }], { rank: 9, name: "You", xp: 1, is_you: true }), null);

// 5) podium split is safe for tiny cohorts
assert.strictEqual(splitPodium(E).podium.length, 3);
assert.strictEqual(splitPodium(E).rest.length, 2);
assert.strictEqual(splitPodium([{ xp: 1 }]).podium.length, 1);
assert.strictEqual(splitPodium([]).rest.length, 0);

// 6) bandRows groups contiguous rows by tier, preserving order
const bands = bandRows([{ xp: 7660 }, { xp: 7635 }, { xp: 6120 }]); // plat, plat, gold
assert.strictEqual(bands.length, 2);
assert.strictEqual(bands[0].tier.id, "platinum");
assert.strictEqual(bands[0].rows.length, 2);
assert.strictEqual(bands[1].tier.id, "gold");
assert.strictEqual(bands[1].rows.length, 1);

console.log("PASS: leaderboard tiers + standings");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types frontend/tests/leaderboard_logic.mjs`
Expected: FAIL — cannot resolve `../src/aurora/leaderboard/tiers.ts` (module missing).

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/aurora/leaderboard/tiers.ts`:

```ts
/* Leaderboard tier + standings math — dependency-free (no imports) so it unit-tests
   under Node's type stripping and stays pure. Consumed by the leaderboard screen. */

export type TierId = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface Tier {
  id: TierId;
  name: string;
  min: number; // inclusive XP floor
  c1: string; // light facet
  c2: string; // deep facet / ring
  ink: string; // legible text on a light tint of this tier
}

/** Minimal shape the math needs; LeaderboardEntry is structurally compatible. */
export interface EntryLike { rank: number; name: string; xp: number; is_you: boolean; }

export interface RivalGap { name: string; rank: number; gap: number; }
export interface Rivals { above: RivalGap | null; below: RivalGap | null; }

export const TIERS: Tier[] = [
  { id: "bronze", name: "Bronze", min: 0, c1: "#E8A06A", c2: "#C97B4A", ink: "#7A4A2B" },
  { id: "silver", name: "Silver", min: 2000, c1: "#CBD5E1", c2: "#94A3B8", ink: "#475569" },
  { id: "gold", name: "Gold", min: 4500, c1: "#FCD34D", c2: "#F59E0B", ink: "#B45309" },
  { id: "platinum", name: "Platinum", min: 7000, c1: "#7FD6E6", c2: "#38BDC9", ink: "#0C6E7A" },
  { id: "diamond", name: "Diamond", min: 10000, c1: "#A78BFA", c2: "#7C5CF6", ink: "#6D28D9" },
];

/** Highest tier whose floor the XP has reached. */
export function tierForXp(xp: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (xp >= tier.min) t = tier;
  return t;
}

/** The person directly above (to overtake) and below (chasing you). Null when the
    viewer is hidden or not present in this (possibly role-filtered) view. */
export function computeRivals(entries: EntryLike[], you?: EntryLike | null): Rivals | null {
  if (!you) return null;
  const i = entries.findIndex((e) => e.is_you);
  if (i < 0) return null;
  const a = entries[i - 1];
  const b = entries[i + 1];
  return {
    above: a ? { name: a.name, rank: a.rank, gap: Math.max(0, a.xp - entries[i].xp) } : null,
    below: b ? { name: b.name, rank: b.rank, gap: Math.max(0, entries[i].xp - b.xp) } : null,
  };
}

/** Top 3 → podium, the rest → the ranked list. Safe for < 3 entries. */
export function splitPodium<T>(entries: T[]): { podium: T[]; rest: T[] } {
  return { podium: entries.slice(0, 3), rest: entries.slice(3) };
}

/** Group contiguous rows into tier bands, preserving rank order. */
export function bandRows<T extends { xp: number }>(rows: T[]): { tier: Tier; rows: T[] }[] {
  const out: { tier: Tier; rows: T[] }[] = [];
  for (const row of rows) {
    const tier = tierForXp(row.xp);
    const last = out[out.length - 1];
    if (last && last.tier.id === tier.id) last.rows.push(row);
    else out.push({ tier, rows: [row] });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types frontend/tests/leaderboard_logic.mjs`
Expected: `PASS: leaderboard tiers + standings`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/leaderboard/tiers.ts frontend/tests/leaderboard_logic.mjs
git commit -m "feat(leaderboard): pure tier + standings math (tierForXp/computeRivals/splitPodium/bandRows) + unit harness"
```

---

### Task 2: `crests.tsx` — tier crest + champion crown (SVG)

**Files:**
- Create: `frontend/src/aurora/components/leaderboard/crests.tsx`

- [ ] **Step 1: Write the component**

```tsx
/* Tier crest + champion crown emblems. SVG now (ships keyless); the gated art task
   swaps these to generated webp with an SVG fallback. Presentational; rendered
   inside client trees (mirrors <Selena>). */
import type { Tier } from "@/aurora/leaderboard/tiers";

export function TierCrest({ tier, size = 16 }: { tier: Tier; size?: number }) {
  return (
    <svg className="lb-crest" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M6 3h12l4 6-10 12L2 9z" fill={tier.c2} />
      <path d="M6 3h12l4 6H2z" fill={tier.c1} />
    </svg>
  );
}

export function ChampionCrown() {
  return (
    <svg className="lb-crown" viewBox="0 0 48 34" aria-hidden focusable="false">
      <path d="M4 30h40l-3-19-9 8-8-14-8 14-9-8z" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="24" cy="6" r="3" fill="#FBBF24" />
      <circle cx="5" cy="10" r="2.4" fill="#FBBF24" />
      <circle cx="43" cy="10" r="2.4" fill="#FBBF24" />
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/crests.tsx
git commit -m "feat(leaderboard): tier crest + champion crown SVG emblems"
```

---

### Task 3: `leaderboard.css` rewrite + warm canvas hook

**Files:**
- Modify (full rewrite): `frontend/src/aurora/leaderboard.css`
- Modify: `frontend/src/aurora/aurora.css` (add canvas hook after the `.aurora-home` canvas block, ~line 76)

- [ ] **Step 1: Replace `frontend/src/aurora/leaderboard.css` entirely**

```css
/* Leaderboard "The Climb" (ricoe D7 refresh). Warm-premium, scoped under `.lb-climb`
   with an `lb-` namespace so nothing leaks. Reuses the home palette + Bricolage.
   Mobile-first; rows never overflow at 390px. CSS-only motion, reduced-motion aware. */

.lb-climb {
  --cream:#F1E3CF; --card:#FFFCF6; --line:#EBDFCB;
  --hink:#2B2431; --hink2:#6D6474; --hink3:#A99FAB;
  --violet:#7C5CF6; --violet-d:#6D28D9; --teal:#12B5A0;
  --flame1:#FB8C28; --flame2:#F0431F; --coral:#F4557A;
  --sh:0 1px 2px rgba(80,50,20,.05), 0 12px 28px -14px rgba(90,58,24,.20);
  --sh-lg:0 2px 6px rgba(80,50,20,.07), 0 28px 54px -24px rgba(90,58,24,.30);
  --hr:24px;
  --disp:var(--font-bricolage-src), "Bricolage Grotesque", var(--font-sans), sans-serif;
  max-width:900px; margin:0 auto; padding:22px 18px 60px; color:var(--hink);
  display:flex; flex-direction:column; gap:16px;
}
.lb-climb .disp, .lb-climb h1, .lb-climb .lb-ped-nm, .lb-climb .lb-ped-xp,
.lb-climb .lb-rk, .lb-climb .lb-nm, .lb-climb .lb-n, .lb-climb .lb-spot-rankbig,
.lb-climb .lb-spot-name, .lb-climb .lb-bt, .lb-climb .lb-ped-rank { font-family:var(--disp); letter-spacing:-.01em; }

/* ── header ── */
.lb-head { position:relative; overflow:hidden; border-radius:var(--hr); padding:26px 30px 24px; box-shadow:var(--sh-lg);
  background:radial-gradient(135% 165% at 8% 0%, #FFE3C2 0%, #FFD2E0 46%, #E7D9FF 100%); }
.lb-head::after { content:""; position:absolute; right:-70px; top:-80px; width:250px; height:250px; border-radius:50%;
  background:radial-gradient(circle at 40% 40%, rgba(255,255,255,.55), transparent 62%); }
.lb-eyebrow { position:relative; display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,.66);
  border:1px solid rgba(255,255,255,.75); border-radius:999px; padding:7px 14px 7px 12px; font-weight:800; font-size:12.5px;
  letter-spacing:.02em; color:#9333EA; margin-bottom:12px; }
.lb-dot { width:8px; height:8px; border-radius:50%; background:#9333EA; box-shadow:0 0 0 4px rgba(147,51,234,.16); }
.lb-head h1 { position:relative; font-weight:800; font-size:clamp(30px,6vw,44px); line-height:1; margin:0; color:var(--hink); }
.lb-head h1 em { font-style:normal; color:var(--violet-d); }
.lb-sub { position:relative; margin:10px 0 0; font-size:16px; font-weight:500; color:#65546F; max-width:54ch; line-height:1.5; }
.lb-filter { position:relative; margin-top:18px; display:flex; gap:8px; flex-wrap:wrap; }
.lb-chip { border:1px solid rgba(255,255,255,.7); background:rgba(255,255,255,.55); color:#6D5A78; font-weight:700; font-size:13.5px;
  border-radius:999px; padding:8px 16px; cursor:pointer; }
.lb-chip[data-on="true"] { background:var(--hink); color:#fff; border-color:transparent; box-shadow:0 10px 20px -10px rgba(43,36,49,.6); }

/* ── mascot ring shared by rows/spotlight ── */
.lb-face, .lb-spot-face { display:grid; place-items:center; border-radius:50%; }
.lb-face { box-shadow:0 0 0 2px var(--card), 0 0 0 4px var(--rc, var(--teal)); }
.lb-face .selena-wrap, .lb-spot-face .selena-wrap, .lb-ped-face .selena-wrap { border-radius:50%; overflow:hidden; }

/* ── podium ── */
.lb-podium { display:grid; grid-template-columns:1fr 1.18fr 1fr; align-items:end; gap:14px; }
.lb-ped { position:relative; border-radius:var(--hr); padding:16px 14px 18px; text-align:center; color:#fff; overflow:hidden;
  box-shadow:var(--sh-lg); animation:lb-float 4.8s ease-in-out infinite; }
.lb-ped::before { content:""; position:absolute; inset:0; background:linear-gradient(180deg, rgba(255,255,255,.22), transparent 36%); }
.lb-ped.p1 { background:linear-gradient(160deg,#FCD34D 0%,#F59E0B 62%,#EA8A04 100%); padding-top:30px; transform:translateY(-8px); }
.lb-ped.p2 { background:linear-gradient(160deg,#E2E8F0 0%,#AAB6C6 100%); animation-delay:.4s; }
.lb-ped.p3 { background:linear-gradient(160deg,#F0B584 0%,#C97B4A 100%); animation-delay:.8s; }
.lb-ped-rank { position:relative; font-weight:800; font-size:15px; opacity:.95; margin-bottom:8px; display:inline-block; }
.lb-ped-face { position:relative; margin:0 auto 10px; box-shadow:0 12px 26px -10px rgba(0,0,0,.4), 0 0 0 4px rgba(255,255,255,.55); border-radius:50%; }
.lb-ped-nm { position:relative; font-weight:800; font-size:17px; line-height:1.15; }
.lb-ped-role { position:relative; font-weight:800; font-size:11px; letter-spacing:.06em; text-transform:uppercase; opacity:.9; margin-top:2px; }
.lb-ped-xp { position:relative; font-weight:800; font-size:24px; margin-top:8px; }
.lb-ped.p1 .lb-ped-xp { font-size:30px; }
.lb-ped-xp small { font-size:12px; font-weight:800; opacity:.85; letter-spacing:.04em; }
.lb-ped-crest { position:relative; margin-top:9px; display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,.9);
  border-radius:999px; padding:5px 11px 5px 7px; font-weight:800; font-size:11px; letter-spacing:.03em; color:var(--hink); }
.lb-crown { position:absolute; top:-4px; left:50%; transform:translateX(-50%); width:46px; height:34px; z-index:3;
  filter:drop-shadow(0 6px 10px rgba(180,120,10,.5)); }
.lb-shine { position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen;
  background:linear-gradient(115deg, transparent 40%, rgba(255,255,255,.55) 48%, transparent 56%);
  background-size:250% 100%; background-position:150% 0; animation:lb-shine 4.6s ease-in-out infinite; }
@keyframes lb-shine { 0%,58%{background-position:150% 0;} 100%{background-position:-90% 0;} }
@keyframes lb-float { 0%,100%{transform:translateY(0);} 50%{transform:translateY(-6px);} }
.lb-ped.p1 { animation-name:lb-float-hi; }
@keyframes lb-float-hi { 0%,100%{transform:translateY(-8px);} 50%{transform:translateY(-15px);} }

/* ── rivalry spotlight ── */
.lb-spot { position:relative; border-radius:var(--hr); background:var(--card); border:1px solid var(--line); box-shadow:var(--sh-lg);
  padding:20px 22px; overflow:hidden; display:grid; grid-template-columns:auto 1fr auto; gap:18px; align-items:center; }
.lb-spot::before { content:""; position:absolute; left:0; top:0; bottom:0; width:6px; background:linear-gradient(180deg,#8B5CF6,#EC4899 60%,#FB923C); }
.lb-spot.is-hidden { grid-template-columns:1fr auto; }
.lb-spot-title { font-family:var(--disp); font-weight:800; font-size:18px; margin:0; }
.lb-spot-hint { font-size:13.5px; color:var(--hink2); margin:4px 0 0; }
.lb-spot-you { display:flex; align-items:center; gap:14px; }
.lb-spot-rankbig { font-weight:800; font-size:40px; line-height:.9; color:var(--violet-d); }
.lb-spot-rankbig small { display:block; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:var(--hink3); }
.lb-spot-name { font-weight:800; font-size:19px; }
.lb-spot-tags { display:flex; gap:8px; align-items:center; margin-top:4px; font-size:12px; font-weight:700; color:var(--hink2); flex-wrap:wrap; }
.lb-tierchip { display:inline-flex; align-items:center; gap:5px; border-radius:999px; padding:3px 10px 3px 7px; font-size:11px; font-weight:800; letter-spacing:.03em; }
.lb-rivals { display:flex; flex-direction:column; gap:11px; min-width:0; }
.lb-rival { display:flex; flex-direction:column; gap:5px; }
.lb-rlbl { font-size:13.5px; font-weight:600; color:var(--hink2); }
.lb-rlbl b { color:var(--hink); }
.lb-rlbl .up { color:var(--violet-d); font-weight:800; }
.lb-rlbl .dn { color:#C2410C; font-weight:800; }
.lb-gapbar { height:9px; border-radius:999px; background:#F1E7D7; overflow:hidden; box-shadow:inset 0 1px 2px rgba(120,80,40,.12); }
.lb-gapbar > span { display:block; height:100%; border-radius:999px; }
.lb-gapbar.ahead > span { background:linear-gradient(90deg,#8B5CF6,#EC4899); animation:lb-grow 1.1s cubic-bezier(.2,.9,.3,1.2) both; }
.lb-gapbar.behind > span { background:linear-gradient(90deg,#FDBA74,#F43F5E); }
@keyframes lb-grow { from { transform:scaleX(0); transform-origin:left; } }
.lb-spot-cta { display:flex; flex-direction:column; gap:9px; }

/* ── buttons ── */
.lb-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; font-weight:800; font-size:14px; padding:12px 18px;
  border-radius:14px; border:none; cursor:pointer; text-decoration:none; font-family:inherit; white-space:nowrap; }
.lb-btn.primary { background:var(--hink); color:#fff; box-shadow:0 14px 26px -12px rgba(43,36,49,.7); }
.lb-btn.ghost { background:#F6EFE3; color:#6D5A78; border:1px solid var(--line); }
.lb-btn:disabled { opacity:.55; cursor:default; box-shadow:none; }

/* ── tier band ── */
.lb-band-group { display:flex; flex-direction:column; gap:9px; }
.lb-band { display:flex; align-items:center; gap:10px; margin:6px 2px 0; }
.lb-bt { font-weight:800; font-size:14px; letter-spacing:.02em; }
.lb-band-line { flex:1; height:1px; background:linear-gradient(90deg,var(--line),transparent); }
.lb-band-cnt { font-size:11.5px; font-weight:800; color:var(--hink3); letter-spacing:.04em; }

/* ── rows ── */
.lb-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:9px; }
.lb-row { display:grid; grid-template-columns:34px 52px 1fr auto; align-items:center; gap:14px;
  background:var(--card); border:1px solid var(--line); border-radius:18px; padding:11px 16px 11px 12px; box-shadow:var(--sh);
  transition:transform .16s ease, box-shadow .16s ease; }
.lb-row:hover { transform:translateY(-2px); box-shadow:var(--sh-lg); }
.lb-rk { font-weight:800; font-size:18px; color:var(--hink3); text-align:center; font-variant-numeric:tabular-nums; }
.lb-face { width:52px; height:52px; }
.lb-meta { min-width:0; }
.lb-nm { font-weight:800; font-size:16px; display:flex; align-items:center; gap:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.lb-youtag { flex:0 0 auto; font-size:10px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; color:#fff; background:var(--violet); border-radius:999px; padding:2px 8px; }
.lb-sub2 { display:flex; align-items:center; gap:9px; margin-top:3px; font-size:12px; font-weight:700; color:var(--hink2); flex-wrap:wrap; }
.lb-rolechip { color:var(--violet-d); background:#F1ECFF; border-radius:999px; padding:2px 9px; font-weight:800; letter-spacing:.02em; }
.lb-streak { color:#C2410C; white-space:nowrap; }
.lb-lvl { color:var(--hink3); white-space:nowrap; }
.lb-val { text-align:right; min-width:120px; }
.lb-n { font-weight:800; font-size:18px; font-variant-numeric:tabular-nums; }
.lb-n small { font-size:11px; font-weight:800; color:var(--hink3); letter-spacing:.04em; }
.lb-xpbar { height:6px; width:120px; border-radius:999px; background:#F1E7D7; overflow:hidden; margin:6px 0 0 auto; }
.lb-xpbar > span { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#12B5A0,#7C5CF6); }
.lb-row[data-you] { border-color:transparent; box-shadow:0 0 0 2px var(--violet), var(--sh-lg);
  background:linear-gradient(180deg,#FBF7FF,#FFFCF6); animation:lb-youglow 3.4s ease-in-out infinite; }
@keyframes lb-youglow { 0%,100%{box-shadow:0 0 0 2px var(--violet), var(--sh);} 50%{box-shadow:0 0 0 2px var(--violet), 0 0 22px -2px rgba(124,92,246,.45), var(--sh-lg);} }

/* ── settings (demoted) ── */
.lb-settings { border-radius:var(--hr); background:var(--card); border:1px solid var(--line); box-shadow:var(--sh); padding:16px 20px;
  display:flex; align-items:center; gap:16px; flex-wrap:wrap; margin-top:6px; }
.lb-sh { font-family:var(--disp); font-weight:800; font-size:14px; color:var(--hink2); }
.lb-set-lbl { font-size:12.5px; color:var(--hink3); font-weight:700; }
.lb-grow { flex:1; }
.lb-switch { flex:0 0 auto; width:48px; height:27px; border-radius:999px; border:0; padding:3px; background:var(--surface-tonal,#EFE7DA);
  box-shadow:inset 0 0 0 1px var(--line); cursor:pointer; transition:background .18s ease; }
.lb-switch[data-on="true"] { background:var(--violet); box-shadow:0 6px 14px -6px rgba(124,92,246,.6); }
.lb-switch:disabled { opacity:.55; cursor:default; }
.lb-switch-knob { display:block; width:21px; height:21px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.25);
  transition:transform .2s cubic-bezier(.2,.9,.3,1.3); }
.lb-switch[data-on="true"] .lb-switch-knob { transform:translateX(21px); }
.lb-field { display:flex; gap:6px; }
.lb-name-input { border:1px solid var(--line); border-radius:12px; background:#FBF6EC; padding:9px 12px; font-size:14px; font-family:inherit; color:var(--hink); min-width:150px; }
.lb-name-input:focus-visible { outline:2px solid var(--violet); outline-offset:1px; }
.lb-edit { text-decoration:none; }

.lb-empty { color:var(--hink2); text-align:center; padding:2.5rem 1rem; font-size:16px; }

/* ── responsive ── */
@media (max-width:720px) {
  .lb-spot { grid-template-columns:1fr; }
  .lb-podium { gap:10px; }
  .lb-ped-nm { font-size:15px; }
  .lb-n small { display:none; }
}
@media (max-width:420px) { .lb-sub2 .lb-lvl { display:none; } }

/* ── reduced motion ── */
@media (prefers-reduced-motion:reduce) {
  .lb-ped, .lb-shine, .lb-row[data-you], .lb-gapbar.ahead > span { animation:none !important; }
  .lb-ped { transform:none !important; }
  .lb-ped.p1 { transform:translateY(-8px) !important; }
}
html[data-motion="reduce"] .lb-ped,
html[data-motion="reduce"] .lb-shine,
html[data-motion="reduce"] .lb-row[data-you],
html[data-motion="reduce"] .lb-gapbar.ahead > span { animation:none !important; }
html[data-motion="reduce"] .lb-ped { transform:none !important; }
html[data-motion="reduce"] .lb-ped.p1 { transform:translateY(-8px) !important; }
```

- [ ] **Step 2: Add the warm canvas hook to `frontend/src/aurora/aurora.css`**

Immediately after the `.aurora-main:has(.aurora-home) .aurora-mesh { display: none; }` line (~line 76), insert:

```css
/* Leaderboard "The Climb" warm canvas — same warm bleed as Home, scoped to .lb-climb. */
.aurora-main:has(.lb-climb) {
  background:
    radial-gradient(72% 58% at 6% -8%, #FBDDBE 0%, transparent 54%),
    radial-gradient(64% 54% at 102% -4%, #F7D3C4 0%, transparent 52%),
    radial-gradient(80% 60% at 50% 116%, #EFD7C9 0%, transparent 60%),
    #F1E3CF;
}
.aurora-main:has(.lb-climb) .aurora-mesh { display: none; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/leaderboard.css frontend/src/aurora/aurora.css
git commit -m "feat(leaderboard): warm-premium 'The Climb' stylesheet + scoped warm canvas"
```

---

### Task 4: `LeaderboardHeader.tsx`

**Files:**
- Create: `frontend/src/aurora/components/leaderboard/LeaderboardHeader.tsx`

- [ ] **Step 1: Write the component**

```tsx
/* Header banner: eyebrow, "The Climb" title, a live hook line, and the role filter tabs. */
export function LeaderboardHeader({
  roles, role, onRole, hook,
}: {
  roles: string[];
  role: string | null;
  onRole: (r: string | null) => void;
  hook: string;
}) {
  return (
    <header className="lb-head">
      <span className="lb-eyebrow"><span className="lb-dot" aria-hidden /> Cohort leaderboard · Season 1</span>
      <h1>The <em>Climb</em></h1>
      <p className="lb-sub">{hook}</p>
      {roles.length > 1 && (
        <div className="lb-filter" role="tablist" aria-label="Filter by role">
          <button type="button" role="tab" aria-selected={role === null} className="lb-chip" data-on={role === null} onClick={() => onRole(null)}>All</button>
          {roles.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={role === r} className="lb-chip" data-on={role === r} onClick={() => onRole(r)}>{r}</button>
          ))}
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/LeaderboardHeader.tsx
git commit -m "feat(leaderboard): header banner with role filter tabs"
```

---

### Task 5: `Podium.tsx`

**Files:**
- Create: `frontend/src/aurora/components/leaderboard/Podium.tsx`

- [ ] **Step 1: Write the component**

```tsx
/* Top-3 podium. Visual order is 2nd · 1st · 3rd so the champion sits center + tallest.
   Each pedestal carries the student's <Selena> headshot, XP, and their XP-tier crest. */
import { Selena } from "@/aurora/avatar/Selena";
import { tierForXp } from "@/aurora/leaderboard/tiers";
import { TierCrest, ChampionCrown } from "./crests";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";

const PLACE = ["p1", "p2", "p3"];
const LABEL = ["Champion", "2nd", "3rd"];
const ORDER = [1, 0, 2]; // render 2nd, then 1st (center), then 3rd

export function Podium({ podium }: { podium: LeaderboardEntry[] }) {
  if (podium.length === 0) return null;
  return (
    <section className="lb-podium" data-testid="podium" aria-label="Top performers">
      {ORDER.filter((i) => i < podium.length).map((i) => {
        const e = podium[i];
        const tier = tierForXp(e.xp);
        return (
          <div key={e.rank} className={`lb-ped ${PLACE[i]}`} data-testid="podium-slot">
            <div className="lb-shine" aria-hidden />
            {i === 0 && <ChampionCrown />}
            <span className="lb-ped-rank">{LABEL[i]}</span>
            <span className="lb-ped-face">
              <Selena portraitUrl={e.portrait_url} background={e.avatar_config?.background} size={i === 0 ? 104 : 76} />
            </span>
            <div className="lb-ped-nm">{e.name}</div>
            <div className="lb-ped-role">{e.role}</div>
            <div className="lb-ped-xp">{e.xp.toLocaleString()}<small> XP</small></div>
            <span className="lb-ped-crest"><TierCrest tier={tier} size={15} /> {tier.name}</span>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS. (If `background` errors because `AvatarConfig.background` is a string union, it is still assignable to `<Selena>`'s `background?: string`; no cast needed.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/Podium.tsx
git commit -m "feat(leaderboard): top-3 podium with crown, tier crests, Selena headshots"
```

---

### Task 6: `RivalrySpotlight.tsx`

**Files:**
- Create: `frontend/src/aurora/components/leaderboard/RivalrySpotlight.tsx`

- [ ] **Step 1: Write the component**

```tsx
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
            <div className="lb-rlbl"><span className="up">▲ {above.gap.toLocaleString()} XP</span> to overtake <b>{above.name} (#{above.rank})</b>{reachesPodium ? " — and reach the podium" : ""}</div>
            <div className="lb-gapbar ahead"><span style={{ width: `${gapPct(above.gap)}%` }} /></div>
          </div>
        ) : (
          <div className="lb-rival">
            <div className="lb-rlbl">👑 You&apos;re on top{below ? <> — <b>{below.gap.toLocaleString()} XP</b> clear of #{below.rank}</> : ""}</div>
          </div>
        )}
        {below && (
          <div className="lb-rival">
            <div className="lb-rlbl"><b>{below.name} (#{below.rank})</b> is <span className="dn">{below.gap.toLocaleString()} XP</span> behind — keep climbing</div>
            <div className="lb-gapbar behind"><span style={{ width: `${gapPct(below.gap)}%` }} /></div>
          </div>
        )}
      </div>

      <div className="lb-spot-cta">
        <a className="lb-btn primary" href="/flashcards">⚡ Earn XP</a>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/RivalrySpotlight.tsx
git commit -m "feat(leaderboard): rivalry spotlight (overtake gap + chaser + podium reach)"
```

---

### Task 7: `TierBand.tsx` + `LeaderboardRow.tsx`

**Files:**
- Create: `frontend/src/aurora/components/leaderboard/TierBand.tsx`
- Create: `frontend/src/aurora/components/leaderboard/LeaderboardRow.tsx`

- [ ] **Step 1: Write `TierBand.tsx`**

```tsx
/* A slim tier divider that groups the ranked rows into a Bronze→Diamond ladder. */
import { TierCrest } from "./crests";
import type { Tier } from "@/aurora/leaderboard/tiers";

export function TierBand({ tier, count }: { tier: Tier; count: number }) {
  return (
    <div className="lb-band">
      <TierCrest tier={tier} size={18} />
      <span className="lb-bt" style={{ color: tier.ink }}>{tier.name}</span>
      <span className="lb-band-line" aria-hidden />
      <span className="lb-band-cnt">{tier.min.toLocaleString()}+ XP · {count}</span>
    </div>
  );
}
```

- [ ] **Step 2: Write `LeaderboardRow.tsx`**

```tsx
/* One ranked row (rank 4+): rank chip, tier-ringed Selena, meta, and an XP count-up
   with a bar drawn relative to the cohort leader. Highlights the viewer's own row. */
"use client";
import { Selena } from "@/aurora/avatar/Selena";
import { useCountUp } from "@/hooks/useCountUp";
import { tierForXp } from "@/aurora/leaderboard/tiers";
import type { LeaderboardEntry } from "@/hooks/useLeaderboard";
import type { CSSProperties } from "react";

export function LeaderboardRow({ e, topXp }: { e: LeaderboardEntry; topXp: number }) {
  const tier = tierForXp(e.xp);
  const { ref, display } = useCountUp<HTMLSpanElement>(e.xp);
  const pct = topXp > 0 ? Math.max(4, Math.round((e.xp / topXp) * 100)) : 0;
  return (
    <li className="lb-row" data-testid="lb-row" data-you={e.is_you || undefined}>
      <span className="lb-rk">{e.rank}</span>
      <span className="lb-face" style={{ "--rc": tier.c2 } as CSSProperties}>
        <Selena portraitUrl={e.portrait_url} background={e.avatar_config?.background} size={52} />
      </span>
      <span className="lb-meta">
        <span className="lb-nm">{e.name}{e.is_you && <span className="lb-youtag">You</span>}</span>
        <span className="lb-sub2">
          {e.role && <span className="lb-rolechip">{e.role}</span>}
          {e.streak_days > 0 && <span className="lb-streak">🔥 {e.streak_days}d</span>}
          <span className="lb-lvl">Lv {e.level}</span>
        </span>
      </span>
      <span className="lb-val">
        <span className="lb-n" ref={ref}>{display}<small> XP</small></span>
        <span className="lb-xpbar"><span style={{ width: `${pct}%` }} /></span>
      </span>
    </li>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/TierBand.tsx frontend/src/aurora/components/leaderboard/LeaderboardRow.tsx
git commit -m "feat(leaderboard): tier band divider + premium ranked row (count-up + leader-relative XP bar)"
```

---

### Task 8: `BoardSettings.tsx`

**Files:**
- Create: `frontend/src/aurora/components/leaderboard/BoardSettings.tsx`

- [ ] **Step 1: Write the component**

```tsx
/* Demoted board controls: show/hide toggle, optional display name, Edit-Selena entry.
   All D7 functionality, kept visually subordinate so the board is the hero. */
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function BoardSettings({
  youHidden, displayName, pending, onToggle, onSaveName,
}: {
  youHidden: boolean;
  displayName: string | null;
  pending: boolean;
  onToggle: (hidden: boolean) => void;
  onSaveName: (name: string) => void;
}) {
  const [draft, setDraft] = useState(displayName ?? "");
  useEffect(() => { setDraft(displayName ?? ""); }, [displayName]);
  const dirty = draft.trim() !== (displayName ?? "");
  return (
    <section className="lb-settings" aria-label="Board settings">
      <span className="lb-sh">Board settings</span>
      <span className="lb-set-lbl">Show me on the board</span>
      <button
        type="button" role="switch" aria-checked={!youHidden} aria-label="Show me on the board"
        data-testid="lb-hide-switch" className="lb-switch" data-on={!youHidden}
        disabled={pending} onClick={() => onToggle(!youHidden)}
      >
        <span className="lb-switch-knob" />
      </button>
      <span className="lb-grow" />
      <div className="lb-field">
        <input
          className="lb-name-input" type="text" maxLength={40} aria-label="Display name"
          placeholder="Display name (optional)" value={draft} onChange={(ev) => setDraft(ev.target.value)}
        />
        <button type="button" className="lb-btn ghost" disabled={!dirty || pending} onClick={() => onSaveName(draft.trim())}>Save</button>
      </div>
      <Link href="/studio" className="lb-btn ghost lb-edit" data-testid="edit-selena">Edit Selena</Link>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/leaderboard/BoardSettings.tsx
git commit -m "feat(leaderboard): demoted board-settings bar (hide toggle, display name, Edit Selena)"
```

---

### Task 9: Rewrite `Leaderboard.tsx` (compose + podium celebration)

**Files:**
- Modify (full rewrite): `frontend/src/aurora/screens/Leaderboard.tsx`

- [ ] **Step 1: Replace the file entirely**

```tsx
"use client";
/* Leaderboard "The Climb" (ricoe D7 refresh). Everyone-by-default XP board, dramatized:
   podium (top 3), a live rivalry spotlight, XP tiers (Bronze→Diamond), glowing tiered
   rows, and demoted settings. All gamification derives client-side from the existing
   /api/leaderboard payload — no backend change. */
import { useEffect, useMemo, useState } from "react";
import confetti from "canvas-confetti";
import { useLeaderboard, useSetLeaderboardPrefs } from "@/hooks/useLeaderboard";
import { computeRivals, splitPodium, bandRows } from "@/aurora/leaderboard/tiers";
import { LeaderboardHeader } from "@/aurora/components/leaderboard/LeaderboardHeader";
import { Podium } from "@/aurora/components/leaderboard/Podium";
import { RivalrySpotlight } from "@/aurora/components/leaderboard/RivalrySpotlight";
import { TierBand } from "@/aurora/components/leaderboard/TierBand";
import { LeaderboardRow } from "@/aurora/components/leaderboard/LeaderboardRow";
import { BoardSettings } from "@/aurora/components/leaderboard/BoardSettings";

export function Leaderboard() {
  const [role, setRole] = useState<string | null>(null);
  const { data, isLoading } = useLeaderboard(role);
  const prefs = useSetLeaderboardPrefs();

  const entries = data?.entries ?? [];
  const roles = data?.roles ?? [];
  const youHidden = data?.you_hidden ?? false;
  const you = entries.find((e) => e.is_you);

  const rivals = useMemo(() => computeRivals(entries, you), [entries, you]);
  const { podium, rest } = useMemo(() => splitPodium(entries), [entries]);
  const bands = useMemo(() => bandRows(rest), [rest]);
  const topXp = entries[0]?.xp ?? 0;

  const hook = useMemo(() => {
    if (youHidden) return "You're hidden — show yourself to join the climb.";
    if (you && rivals?.above && rivals.above.rank <= 3) return `Everyone in your cohort, ranked by total XP. You're ${rivals.above.gap.toLocaleString()} XP from the podium.`;
    if (you && rivals?.above) return `Everyone in your cohort, ranked by total XP. ${rivals.above.gap.toLocaleString()} XP to your next rank.`;
    return "Everyone in your cohort, ranked by total XP. Study daily to climb — your Selena rides along.";
  }, [you, rivals, youHidden]);

  // One-time celebration when the viewer is on the podium. Reduced-motion + once per
  // browser session; never fires for the (common) off-podium case.
  useEffect(() => {
    if (!you || you.rank > 3) return;
    const reduce = document.documentElement.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || sessionStorage.getItem("eyebot_lb_podium_celebrated") === "1") return;
    sessionStorage.setItem("eyebot_lb_podium_celebrated", "1");
    confetti({ particleCount: 90, spread: 70, origin: { y: 0.35 }, colors: ["#7C5CF6", "#12B5A0", "#FB8C28", "#F4557A"] });
  }, [you]);

  return (
    <div className="lb-climb" data-testid="leaderboard-root">
      <LeaderboardHeader roles={roles} role={role} onRole={setRole} hook={hook} />

      {isLoading && !data ? (
        <p className="lb-empty">Loading the board…</p>
      ) : entries.length === 0 ? (
        <p className="lb-empty" data-testid="lb-empty">
          The board&apos;s warming up — once your cohort starts earning XP, everyone shows up here.
        </p>
      ) : (
        <>
          <Podium podium={podium} />
          <RivalrySpotlight you={you} rivals={rivals} youHidden={youHidden} onShow={() => prefs.mutate({ hidden: false })} />
          {bands.map((band) => (
            <div key={band.tier.id} className="lb-band-group">
              <TierBand tier={band.tier} count={band.rows.length} />
              <ol className="lb-list">
                {band.rows.map((e) => <LeaderboardRow key={`${e.rank}-${e.name}`} e={e} topXp={topXp} />)}
              </ol>
            </div>
          ))}
        </>
      )}

      <BoardSettings
        youHidden={youHidden}
        displayName={data?.display_name ?? null}
        pending={prefs.isPending}
        onToggle={(hidden) => prefs.mutate({ hidden })}
        onSaveName={(name) => prefs.mutate({ display_name: name })}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/screens/Leaderboard.tsx
git commit -m "feat(leaderboard): compose 'The Climb' (podium + spotlight + tier bands + settings) with podium confetti"
```

---

### Task 10: Rewrite the harness leaderboard section + expand the mock cohort

**Files:**
- Modify: `frontend/tests/aurora_assert.mjs` (replace the block from the comment `// Leaderboard (RICOE v2, D7):` through the line restoring the viewport after the 390px overflow check — currently ~lines 556–610)

- [ ] **Step 1: Replace the leaderboard block**

Find the block that starts with `// Leaderboard (RICOE v2, D7): everyone by default, ranked by XP, with Selena headshots.` and ends just before the `// daily check-in (auth group, no rail)` comment. Replace the ENTIRE block with:

```js
// Leaderboard "The Climb" (ricoe D7 refresh): podium (top 3) + rivalry spotlight + XP
// tiers + glowing tiered rows. The GET mock honours ?role= and reflects the hide state
// so the filter + hide toggle are real behavioral verifies; prefs POST flips the flag.
let lbHidden = false;
const LB_ROWS = [
  { name: "Aisha R.",   role: "OT", xp: 12480, level: 24, streak_days: 31, avatar_config: { background: "galaxy" }, portrait_url: PORTRAIT_PNG, is_you: false },
  { name: "Wei Jie T.", role: "OA", xp: 10240, level: 22, streak_days: 18, avatar_config: { background: "mist" }, portrait_url: null, is_you: false },
  { name: "Priya N.",   role: "OT", xp: 7720,  level: 18, streak_days: 12, avatar_config: null, portrait_url: null, is_you: false },
  { name: "You",        role: "OA", xp: 7660,  level: 17, streak_days: 9,  avatar_config: { background: "peach" }, portrait_url: null, is_you: true },
  { name: "Marcus L.",  role: "OT", xp: 7635,  level: 17, streak_days: 6,  avatar_config: null, portrait_url: PORTRAIT_PNG, is_you: false },
  { name: "Siti N.",    role: "OA", xp: 6120,  level: 15, streak_days: 22, avatar_config: null, portrait_url: null, is_you: false },
  { name: "Daniel O.",  role: "OT", xp: 5540,  level: 14, streak_days: 0,  avatar_config: null, portrait_url: null, is_you: false },
];
await navCtx.route("**/api/leaderboard**", (r) => {
  if (r.request().method() === "POST") { // /prefs — flip the hide flag from the body
    try { const b = JSON.parse(r.request().postData() || "{}"); if (typeof b.hidden === "boolean") lbHidden = b.hidden; } catch { /* noop */ }
    return r.fulfill(JSON_OK({ ok: true }));
  }
  const role = new URL(r.request().url()).searchParams.get("role");
  let rows = LB_ROWS.filter((e) => !(lbHidden && e.is_you));
  if (role) rows = rows.filter((e) => e.role === role);
  const entries = rows.map((e, i) => ({ ...e, rank: i + 1 }));
  return r.fulfill(JSON_OK({ entries, you_hidden: lbHidden, display_name: null, roles: ["OA", "OT"] }));
});
await np.goto(base + "/leaderboard", { waitUntil: "domcontentloaded" });
await np.waitForSelector('[data-testid="podium-slot"]', { timeout: 15000 });
const lbH1 = await np.locator("main h1").count();
if (lbH1 !== 1) { console.error(`FAIL: leaderboard main h1 count = ${lbH1}`); process.exit(1); }
if ((await np.locator('[data-testid="podium-slot"]').count()) !== 3) { console.error("FAIL: leaderboard podium did not render 3 slots"); process.exit(1); }
if ((await np.locator('[data-testid="lb-row"]').count()) !== 4) { console.error("FAIL: expected 4 ranked rows below the podium"); process.exit(1); }
if ((await np.locator('[data-testid="leaderboard-root"] .selena-img[src^="data:"]').count()) < 1) {
  console.error("FAIL: leaderboard did not render any student's real rendered portrait"); process.exit(1);
}
const youRow = np.locator('[data-testid="lb-row"][data-you]');
if ((await youRow.count()) !== 1 || !(await youRow.innerText()).includes("You")) {
  console.error("FAIL: current user's row not highlighted on the leaderboard"); process.exit(1);
}
const spot = np.locator('[data-testid="rivalry-spotlight"]');
if ((await spot.count()) !== 1) { console.error("FAIL: rivalry spotlight missing"); process.exit(1); }
if (!(await spot.innerText()).toLowerCase().includes("overtake")) { console.error("FAIL: rivalry spotlight is not showing the overtake gap"); process.exit(1); }
if ((await np.locator('[data-testid="edit-selena"]').count()) < 1) { console.error("FAIL: Edit Selena entry missing on the leaderboard (ricoe §7)"); process.exit(1); }
console.log("PASS: Leaderboard 'The Climb' — podium, rivalry spotlight, tiered rows, you-row highlight, real portrait, Edit Selena");

// role filter narrows the WHOLE board (podium + rows) and drops the other role.
await np.locator('.lb-filter .lb-chip:has-text("OT")').click();
await np.waitForFunction(() => document.querySelectorAll('[data-testid="podium-slot"], [data-testid="lb-row"]').length === 4, { timeout: 8000 });
console.log("PASS: Leaderboard — role filter narrows the board");
await np.locator('.lb-filter .lb-chip:has-text("All")').click();
await np.waitForFunction(() => document.querySelectorAll('[data-testid="podium-slot"], [data-testid="lb-row"]').length === 7, { timeout: 8000 });

// hide toggle (D7 opt-out): flipping it off removes the viewer's own row from the board.
await np.locator('[data-testid="lb-hide-switch"]').click();
await np.waitForFunction(() => document.querySelectorAll('[data-testid="lb-row"][data-you]').length === 0, { timeout: 8000 });
console.log("PASS: Leaderboard — hide toggle removes you from the board");

await np.setViewportSize({ width: 390, height: 844 });
await np.waitForTimeout(250);
const lbOverflow = await np.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
if (lbOverflow > 2) { console.error(`FAIL: /leaderboard horizontal overflow at 390px = ${lbOverflow}px`); process.exit(1); }
console.log("PASS: Leaderboard — no horizontal overflow at 390px");
await np.setViewportSize({ width: 1440, height: 900 });
```

- [ ] **Step 2: Build the standalone harness bundle and run the leaderboard assertions**

Per [[project_harness_local_server]] and the memory harness gotcha, run against an already-warm server:

```bash
bash scripts/start-harness.sh aurora
```

Expected: the run reaches the leaderboard `PASS` lines above with exit 0. If the cold-nav flake hits (first nav to `/cases`), re-run the assert against the warm server:

```bash
node frontend/tests/aurora_assert.mjs http://127.0.0.1:3000
```

Expected: all `PASS:` lines including the four new `Leaderboard 'The Climb'` lines; exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/aurora_assert.mjs
git commit -m "test(leaderboard): harness asserts 'The Climb' — podium, spotlight, tiers, filter, hide; expanded cohort"
```

---

### Task 11: Art pipeline scaffold (registry + generator + pytest) — keyless

**Files:**
- Create: `tools/leaderboard/__init__.py` (empty)
- Create: `tools/leaderboard/crest_art.py`
- Create: `tools/leaderboard/generate_crests.py`
- Test: `tests/test_crest_registry.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_crest_registry.py`:

```python
from tools.leaderboard.crest_art import CRESTS, prompt


def test_all_five_tiers_and_crown_present():
    assert set(CRESTS) == {"bronze", "silver", "gold", "platinum", "diamond", "crown"}


def test_prompts_are_nonempty_and_chroma_keyed():
    for cid, crest in CRESTS.items():
        p = prompt(crest)
        assert isinstance(p, str) and len(p) > 40, cid
        assert "#00B140" in p, cid
        assert crest["desc"].split()[0] in p or crest["name"].split()[0].lower() in p.lower(), cid
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest tests/test_crest_registry.py -q`
Expected: FAIL — `ModuleNotFoundError: tools.leaderboard.crest_art`.

- [ ] **Step 3: Write `tools/leaderboard/__init__.py` (empty) and `tools/leaderboard/crest_art.py`**

`tools/leaderboard/crest_art.py`:

```python
"""Leaderboard tier-crest + champion-crown emblems for "The Climb" — Nano-Banana flash,
PAID + go-ahead-gated. Standalone emblems (reference=False) rendered on flat chroma-green
then keyed to alpha + normalised to 512². Mirrors tools/brand/logo_poses.py."""

BG_KEY = (0, 177, 64)  # #00B140 flat chroma-green

CRESTS: dict[str, dict] = {
    "bronze": {"name": "Bronze", "desc": "a warm copper-bronze shield medallion with a faceted amber gem at its center"},
    "silver": {"name": "Silver", "desc": "a cool polished silver shield medallion with a faceted pale-blue gem at its center"},
    "gold": {"name": "Gold", "desc": "a radiant gold shield medallion with a faceted amber gem at its center"},
    "platinum": {"name": "Platinum", "desc": "a bright teal-cyan platinum shield medallion with a faceted aqua gem at its center"},
    "diamond": {"name": "Diamond", "desc": "a luminous violet diamond crest set with a large brilliant-cut violet gem"},
    "crown": {"name": "Champion crown", "desc": "a warm gold champion's crown with soft rounded jewels, for the top player"},
}


def prompt(crest: dict) -> str:
    return (
        f"A single premium game-UI achievement emblem: {crest['desc']}. "
        "Soft rounded enamel-and-gem style, gentle studio lighting, subtle bevel and inner "
        "glow, friendly and polished (not sharp or aggressive), centered, consistent with a "
        "warm, cute, modern learning app. Flat solid chroma-green (#00B140) background, no "
        "text, no border, no watermark, no extra objects."
    )
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m pytest tests/test_crest_registry.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Write `tools/leaderboard/generate_crests.py`**

```python
#!/usr/bin/env python3
"""Generate the leaderboard tier crests + champion crown via Nano-Banana flash — PAID,
go-ahead-gated. reference=False (standalone emblems), keyed to transparency + normalised
to 512². Output lands in .tmp/leaderboard-crests/ for review; --install copies approved
crests into frontend/public/brand/tiers/*.webp. Mirrors tools/brand/generate_poses.py.

Usage:
    python tools/leaderboard/generate_crests.py --estimate            # prints prompts, NO calls
    python tools/leaderboard/generate_crests.py --generate [--only gold,crown]
    python tools/leaderboard/generate_crests.py --install
"""
import argparse
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # repo root, so `tools.*` resolves by path

from PIL import Image

from tools.avatar import generate_sprites
from tools.leaderboard.crest_art import BG_KEY, CRESTS, prompt
from tools.shared import keying
from tools.shared.gemini_client import MOCK_MODE

MODEL = generate_sprites.MODELS["flash"]  # nano-banana flash only
ROOT = Path(__file__).resolve().parents[2]
TMP_DIR = ROOT / ".tmp" / "leaderboard-crests"
PUBLIC_DIR = ROOT / "frontend" / "public" / "brand" / "tiers"


def run_estimate() -> None:
    print(f"ESTIMATE — {len(CRESTS)} crest(s) via {MODEL} (reference=False, keyed to alpha)")
    print("Rough cost: flash image output bills a few cents each; confirm current pricing before the batch.\n")
    for cid, crest in CRESTS.items():
        print(f"— {cid}:\n    {prompt(crest)}\n")


def generate_one(cid: str) -> Path | None:
    if MOCK_MODE:
        raise RuntimeError("generate_one needs a live GEMINI_API_KEY; refusing to fabricate art in MOCK_MODE")
    data = generate_sprites.generate_image_bytes(prompt(CRESTS[cid]), model=MODEL, reference=False)
    if not data:
        print(f"  [{cid}] no image generated")
        return None
    keyed = keying.normalize_512(keying.despill_green(keying.key_out(Image.open(io.BytesIO(data)), BG_KEY)))
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    out = TMP_DIR / f"{cid}.png"
    keyed.save(out)
    print(f"  [{cid}] saved {out} ({out.stat().st_size:,} bytes, keyed+normalised)")
    return out


def run_generate(only: list[str] | None) -> None:
    for cid in (only or list(CRESTS)):
        if cid not in CRESTS:
            print(f"  [{cid}] unknown crest, skipping")
            continue
        generate_one(cid)


def run_install() -> int:
    srcs = sorted(TMP_DIR.glob("*.png"))
    if not srcs:
        print(f"nothing to install — {TMP_DIR} is empty (run --generate first)", file=sys.stderr)
        return 1
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for src in srcs:
        cid = src.stem
        if cid not in CRESTS:
            continue
        Image.open(src).save(PUBLIC_DIR / f"{cid}.webp", "WEBP")
        print(f"  installed {cid}.webp")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    only = [x for x in args.only.split(",") if x] or None
    if args.estimate:
        run_estimate()
    elif args.generate:
        run_generate(only)
    elif args.install:
        sys.exit(run_install())
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Verify `--estimate` runs keyless (no paid call)**

Run: `python tools/leaderboard/generate_crests.py --estimate`
Expected: prints 6 prompts, makes no network call, exits 0.

- [ ] **Step 7: Commit**

```bash
git add tools/leaderboard/__init__.py tools/leaderboard/crest_art.py tools/leaderboard/generate_crests.py tests/test_crest_registry.py
git commit -m "feat(leaderboard): tier-crest art pipeline (registry + gated flash generator) + registry test"
```

---

### Task 12: Full verification gate

- [ ] **Step 1: Backend tests**

Run: `python -m pytest -q`
Expected: all green (existing suite + the new `test_crest_registry.py`).

- [ ] **Step 2: Frontend typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: typecheck clean; build succeeds (Next standalone output).

- [ ] **Step 3: Pure-logic unit harness**

Run: `node --experimental-strip-types frontend/tests/leaderboard_logic.mjs`
Expected: `PASS: leaderboard tiers + standings`.

- [ ] **Step 4: Full aurora visual harness (behavioral verify)**

Run: `bash scripts/start-harness.sh aurora`
Expected: exit 0, every `PASS:` line including the four leaderboard lines. On a cold-nav flake, re-run `node frontend/tests/aurora_assert.mjs http://127.0.0.1:3000` against the warm server.

- [ ] **Step 5: Manual eyeball (optional but recommended)**

With the harness server warm, open `http://127.0.0.1:3000/leaderboard` and confirm: podium reads gold/silver/bronze with a crown on #1; the spotlight shows the overtake gap; tier bands separate rows; your row glows; no horizontal scroll at a narrow width.

---

### Task 13: Design lock + memory + ship the core to main

**Files:**
- Modify: `docs/design-locks.md`
- Modify: memory (`MEMORY.md` + the relevant memory file)

- [ ] **Step 1: Add the Leaderboard lock entry to `docs/design-locks.md`**

Append after the last lock section:

```markdown
## Leaderboard "The Climb" — LOCKED 2026-07-10 (ricoe D7 refresh)
Warm-premium gamified board scoped under `.lb-climb` (home palette + Bricolage, soft
shadows, gradient banner, `:has(.lb-climb)` warm canvas). Four layers, all derived
client-side from the existing `/api/leaderboard` payload (no backend/DB change):
**podium** (top 3, gold/silver/bronze, crown + champion glow on #1, tier crests),
**rivalry spotlight** (`computeRivals`: exact XP to overtake the person above — flagged
when it reaches the podium — plus the chaser below; handles #1 / last / hidden),
**XP tiers** Bronze<2000 · Silver 2000 · Gold 4500 · Platinum 7000 · Diamond 10000
(`tiers.ts`, banded rows + crests), and **glowing tiered rows** (count-up XP + leader-
relative bar, violet you-row). Settings (hide toggle, display name, Edit Selena) are
demoted to one slim bar. Tier crests + champion crown are generated Nano-Banana-flash
webp with committed SVG fallbacks (`crests.tsx`). CSS-only motion, frozen under reduced
motion; 390px-safe; one-time podium confetti (session-scoped, reduced-motion-gated).
- **Preserved D7 behavior**: everyone-by-default, XP-only rank, opt-out hide, optional
  display name, role filter, real `<Selena>` headshots (default-mascot fallback), the
  "Edit Selena" entry.
- **Acceptance criteria when refining**: reads as the `.aurora-home` family; podium +
  spotlight + tiers + glowing you-row all present; every D7 behavior intact; zero
  backend/DB change; motion fully frozen under reduced motion; 390px-safe; WCAG-legible;
  crests degrade to committed SVG if a webp is missing. Spec:
  docs/superpowers/specs/2026-07-10-leaderboard-the-climb-design.md.
- **Out of scope**: real weekly leagues (promotion/relegation/reset — needs backend),
  rank-movement arrows (needs history).
```

- [ ] **Step 2: Update memory**

Update the `project_ricoe_v2.md` memory file (and its `MEMORY.md` index line) to note: "D7 LEADERBOARD REDESIGNED 'The Climb' 2026-07-10 — warm-premium gamified (podium + rivalry spotlight + XP tiers Bronze→Diamond + glowing tiered rows), frontend-only from existing payload; `tiers.ts` pure math, `components/leaderboard/*`, `.lb-climb` namespace; SVG crests now, gated flash-webp swap pending; lock added to design-locks.md." Keep it one line in the index.

- [ ] **Step 3: Final pre-push verification (must be green)**

Run: `python -m pytest -q` and `cd frontend && npm run typecheck && npm run build`
Expected: all green. Do NOT push red (main auto-deploys to Render prod).

- [ ] **Step 4: Stage the task's files, commit, and push to main**

```bash
git add docs/design-locks.md MEMORY.md
# plus any memory file changed under the auto-memory dir
git commit -m "feat(leaderboard): ship 'The Climb' redesign — lock + memory (ricoe D7 refresh)"
git push origin main
```

---

### Task 14: (GATED, PAID) Generated crest art pass — swap in over SVG

**Do not start without explicit user go-ahead.** Live flash image generation costs money and burns prod quota.

**Files:**
- Modify: `frontend/src/aurora/components/leaderboard/crests.tsx`
- Add (generated, not hand-written): `frontend/public/brand/tiers/{bronze,silver,gold,platinum,diamond,crown}.webp`

- [ ] **Step 1: Show prompts + count; get go-ahead**

Run: `python tools/leaderboard/generate_crests.py --estimate`
Present the 6 prompts and expected count/cost to the user. Proceed only on an explicit "go".

- [ ] **Step 2: Generate (PAID) — requires a live `GEMINI_API_KEY`**

Run: `python tools/leaderboard/generate_crests.py --generate`
Expected: 6 keyed+normalised PNGs in `.tmp/leaderboard-crests/`.

- [ ] **Step 3: Review the art**

Open `.tmp/leaderboard-crests/*.png`. Confirm each crest is on-brand (soft, premium, tier-colored, cleanly keyed — no green halo). Regenerate any weak one: `python tools/leaderboard/generate_crests.py --generate --only <id>`. Per [[feedback_generated_imagery_medical]], reject wrong-but-pretty.

- [ ] **Step 4: Install to webp**

Run: `python tools/leaderboard/generate_crests.py --install`
Expected: `frontend/public/brand/tiers/{...}.webp` written.

- [ ] **Step 5: Flip `crests.tsx` to prefer webp with SVG fallback**

Replace `crests.tsx` with the webp-preferring version (an `<img>` that falls back to the SVG on error, mirroring `<Selena>`):

```tsx
/* Tier crest + champion crown emblems. Prefer the generated webp; on a missing/failed
   asset, fall back to the inline SVG so the board is never broken art. Presentational,
   rendered inside client trees (mirrors <Selena>). */
"use client";
import { useState } from "react";
import type { Tier } from "@/aurora/leaderboard/tiers";

export function TierCrest({ tier, size = 16 }: { tier: Tier; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <svg className="lb-crest" width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
        <path d="M6 3h12l4 6-10 12L2 9z" fill={tier.c2} />
        <path d="M6 3h12l4 6H2z" fill={tier.c1} />
      </svg>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- generated raster; no next/image on standalone */
    <img className="lb-crest" src={`/brand/tiers/${tier.id}.webp`} alt="" width={size} height={size} onError={() => setBroken(true)} />
  );
}

export function ChampionCrown() {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <svg className="lb-crown" viewBox="0 0 48 34" aria-hidden focusable="false">
        <path d="M4 30h40l-3-19-9 8-8-14-8 14-9-8z" fill="#FDE68A" stroke="#F59E0B" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="24" cy="6" r="3" fill="#FBBF24" />
        <circle cx="5" cy="10" r="2.4" fill="#FBBF24" />
        <circle cx="43" cy="10" r="2.4" fill="#FBBF24" />
      </svg>
    );
  }
  /* eslint-disable-next-line @next/next/no-img-element -- generated raster; no next/image on standalone */
  return <img className="lb-crown" src="/brand/tiers/crown.webp" alt="" onError={() => setBroken(true)} />;
}
```

- [ ] **Step 6: Verify**

Run: `cd frontend && npm run typecheck && npm run build`
Then `bash scripts/start-harness.sh aurora` (expect exit 0; the crests now render as webp). Eyeball `/leaderboard` to confirm the generated crests look premium and the crown sits on #1.

- [ ] **Step 7: Commit + push**

```bash
git add frontend/src/aurora/components/leaderboard/crests.tsx frontend/public/brand/tiers/
git commit -m "feat(leaderboard): install generated tier crests + champion crown (paid flash), SVG fallback kept"
git push origin main
```

---

## Self-review

**Spec coverage:**
- Aesthetic (warm palette, Bricolage, canvas hook) → Task 3. ✔
- Podium → Task 5. Rivalry spotlight (all edge cases) → Task 6. Tiers + bands → Tasks 1, 7. Rows (count-up, leader-relative bar, you-glow) → Task 7. Settings demoted → Task 8. Header + role filter + hook → Task 4, 9. ✔
- Pure logic + TDD harness → Task 1. Aurora harness + expanded mock → Task 10. pytest registry → Task 11. Full verify → Task 12. ✔
- Generated art (scaffold-first, gated paid) → Tasks 11 (pipeline) + 14 (gated swap). ✔
- Lock entry + memory → Task 13. ✔
- No backend/DB change, no `PERSIST_SCHEMA_VERSION` bump → payload untouched (`useLeaderboard.ts` unmodified). ✔

**Placeholder scan:** No "TBD"/"handle edge cases" left; every code step has complete content. ✔

**Type consistency:** `tierForXp`, `computeRivals` (returns `Rivals` with `{above,below}` of `RivalGap`), `splitPodium` (`{podium,rest}`), `bandRows` (`{tier,rows}[]`) are defined in Task 1 and consumed with those exact shapes in Tasks 5–9. `TierCrest`/`ChampionCrown` signatures match between Task 2 (SVG) and Task 14 (webp). `<Selena>` props (`portraitUrl`, `background`, `size`) match its real signature. `useCountUp<HTMLSpanElement>` returns `{ref, display}` and the ref attaches to the XP `<span>`. Harness selectors (`podium-slot`, `lb-row`, `rivalry-spotlight`, `lb-hide-switch`, `edit-selena`) match the components. ✔

**Note on the podium celebration:** confetti fires only when the viewer is top-3 (rare) and is session- + reduced-motion-gated, so it never disrupts the harness (mock "You" is rank 4).
