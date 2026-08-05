# Home HUD (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Home as a game HUD wired to the Phase 1 loop — re-materialising
every object in The League's STRUCK language, with the fold owned by a status bar, a
quest board, the chest and a live rank strip.

**Architecture:** Three zones under the existing `.aurora-home` — THE DECK (new, above
the fold), THE MODES (`FeatureCarousel`, frames restruck only), THE RECORD (`StreakTile`
+ `LumenLadder`, demoted). All new pure logic lands in one dependency-free module tested
by a Node logic harness; all new network state lands in one hook; all new material lands
as four lip depths in `home.css`. Nothing is deleted, so eight existing harnesses keep
their selectors.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, plain CSS
(`home.css`, `hm-` namespace), Playwright harnesses, Node 24 type-stripping for logic
harnesses.

**Spec:** `docs/superpowers/specs/2026-08-05-home-hud-phase2-design.md`

**A stated deviation from the usual plan format.** Tasks 1-4 and 9 carry complete code,
because they are where this feature can silently lie to a student — the leak guard, the
unknown-is-not-zero rule, the SGT clock, the claim ordering, the gate itself. Tasks 5-8
and 10 carry **exact contracts instead of exact markup**: file, testid, props, class
names, material depth, and every behavioural rule — but not full JSX and CSS. That is
deliberate. The visual skin is the deliverable a world-class frontend pass is *for*, and
a plan that dictated every pixel would lock it to a guess made before anything was on
screen. Every bound that matters is instead pinned by the harness in Task 4, which is
written first and fails until the work is right.

---

## Context an implementer needs

**The diagnosis is material, not colour.** Home's own tokens are the evidence, in
`frontend/src/aurora/home.css:17-19`:

```css
--sh:0 1px 2px rgba(80,50,20,.05), 0 12px 28px -14px rgba(90,58,24,.20);
--sh-lg:0 2px 6px rgba(80,50,20,.07), 0 28px 54px -24px rgba(90,58,24,.30);
--sheen:linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0) 48%);
```

Blurred shadows at 5–30% alpha, and a gloss wash. Plus `.hm-chip` at line 36 carrying
`border:1px solid #F1DCB2`. `leaderboard.css:15-19` names exactly that combination as
"the house style of a generated dashboard" and lists the five moves that defeat it.
**We are not changing hues. We are changing surfaces.**

**Backend is done and live.** `GET /api/home` returns:

```json
{
  "quests": [{"kind":"adaptive","title":"Clear 2 decks in Gonioscopy","target":2,
              "reward_xp":40,"progress":1,"complete":false,"claimed":false}],
  "chest":  {"claimed": false, "key": "xp2x", "label": "2x Lumens for 20 minutes"},
  "boost":  {"multiplier": 2.0, "until": "2026-08-05T14:22:00+08:00"},
  "league": {"rank":7,"pool_size":24,"promote_count":3,
             "division_name":"Silver","xp_to_promotion":120}
}
```

Any of the four top-level values may be `null` (a failed read). `POST
/api/home/chest/claim` takes no body and returns `{ok, already_claimed, drop}`. `POST
/api/home/quest/claim` takes `{kind}` and returns `{ok, already_claimed, reward_xp?}`.

⚠ **The payload hands you the chest's drop before it is claimed** — `key` and `label`
are computed either way, because the roll is a pure function of `(student_id, date)`.
Rendering them on a sealed chest spoils the only ceremony the app has. Task 1 builds the
guard; Task 4 gates it.

**Progress stays on `/api/progress`.** `useProgress()` already provides level, xp,
xp_today, daily_goal, coins_earned and `streak_detail`. Home now runs two queries.

---

## File Structure

| File | Responsibility |
|---|---|
| **Create** `frontend/src/aurora/lib/hud.ts` | Every pure HUD decision: the chest leak guard, streak-at-risk, boost remaining, countdown formatting, quest rollup. Dependency-free — no React, no DOM. |
| **Create** `frontend/tests/hud_logic.mjs` | Node unit test for the above. Auto-discovered by `npm run test:logic`. |
| **Create** `frontend/src/hooks/useHome.ts` | `useHome()` + `useClaimChest()` + `useClaimQuest()`. The only file that knows the endpoint shapes. |
| **Create** `frontend/src/aurora/components/home/StatusBar.tsx` | Level · XP-to-next meter · streak-at-risk · boost timer. |
| **Create** `frontend/src/aurora/components/home/QuestBoard.tsx` | The three rows + claim buttons. |
| **Create** `frontend/src/aurora/components/home/ChestTile.tsx` | Sealed / spent tile. Owns the claim call and the "just claimed" transition. |
| **Create** `frontend/src/aurora/components/home/ChestCeremony.tsx` | The full-screen reveal. Presentational + focus management only. |
| **Create** `frontend/src/aurora/components/home/RankStrip.tsx` | League standing; replaces the `.hm-lb` candy pill. |
| **Create** `frontend/tests/home_hud_assert.mjs` | The screen gate: fold budget, no leak, no hairlines, solid backgrounds, reduced motion, touch targets. |
| **Modify** `frontend/src/aurora/screens/Dashboard.tsx` | Rewire to three zones. `StreakTile` moves down. |
| **Modify** `frontend/src/aurora/home.css` | STRUCK tokens + the four lip depths + every new object's skin. |
| **Modify** `frontend/src/aurora/components/home/GreetingHero.tsx` | Drop `.hm-lb` (RankStrip replaces it); the headline shrinks via CSS only. |
| **Modify** `frontend/src/lib/queryClient.ts` | Exclude `["home"]` from the offline cache. |
| **Modify** `docs/design-locks.md` | Record the five superseded criteria. |

---

## Task 1: `hud.ts` — every pure decision, and its unit test

**Files:**
- Create: `frontend/src/aurora/lib/hud.ts`
- Test: `frontend/tests/hud_logic.mjs`

Five pure functions. `sgtMsToMidnight` uses a **fixed +08:00 offset**, never the
browser's local midnight — students are in SGT and a device in another timezone must not
be told its own day is ending. SGT has no DST, so the offset is a constant.

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/hud_logic.mjs`:

```js
/* Pure unit test for the Home HUD's decisions. hud.ts is dependency-free — no React,
   no DOM — so every rule that could lie to a student is testable without a browser.
   Run under Node type stripping:
     node --experimental-strip-types frontend/tests/hud_logic.mjs */
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  chestReveal, sgtMsToMidnight, streakRisk, boostRemaining, formatCountdown, questRollup,
} from "../src/aurora/lib/hud.ts";

// ── the chest must not leak its prize ────────────────────────────────────────
// GET /api/home returns key+label even when unclaimed, because the roll is pure.
const sealed = { claimed: false, key: "xp2x", label: "2x Lumens for 20 minutes" };
assert.deepStrictEqual(chestReveal(sealed, false), { sealed: true, label: null },
  "an unclaimed chest reveals NOTHING, however much the payload hands us");
assert.deepStrictEqual(chestReveal(sealed, true),
  { sealed: false, label: "2x Lumens for 20 minutes" },
  "this session's own claim reveals it");
assert.deepStrictEqual(chestReveal({ ...sealed, claimed: true }, false),
  { sealed: false, label: "2x Lumens for 20 minutes" },
  "an already-claimed chest shows what it paid");
assert.deepStrictEqual(chestReveal(null, false), { sealed: true, label: null },
  "a failed read is sealed, never an openable chest that cannot pay");

// ── midnight is SGT's, not the device's ──────────────────────────────────────
// 2026-08-05T16:00:00Z is 2026-08-06T00:00:00+08:00 — exactly SGT midnight.
assert.strictEqual(sgtMsToMidnight(Date.parse("2026-08-05T16:00:00Z")), 86_400_000,
  "at SGT midnight a whole day remains");
assert.strictEqual(sgtMsToMidnight(Date.parse("2026-08-05T15:00:00Z")), 3_600_000,
  "23:00 SGT leaves one hour");
// The two assertions above only prove sgtMsToMidnight is a pure function of nowMs —
// they say nothing about which timezone the arithmetic actually used, because
// Date.parse(...) and `new Date(...).getTime()` both collapse to the identical epoch
// ms BEFORE the function ever runs. A device-local-midnight implementation passes a
// same-epoch-ms comparison too, and on a box whose own TZ happens to be +08:00 it
// passes even the two assertions above — which is exactly this dev box, so "green
// locally" was never evidence for the fixed-offset property. The only real gate is
// asking a process whose OS timezone genuinely is NOT +08:00 what it computes.
//
// Spawns real `node` children pinned to two different TZs via the environment (never
// a shell — execFileSync passes argv directly, so there is no quoting to get wrong),
// each importing hud.ts fresh and evaluating sgtMsToMidnight at the same instant used
// above. Proven by mutation: swapping the fixed +08:00 offset for `new Date(nowMs)`
// local-midnight arithmetic fails this loop under TZ=America/New_York while the two
// fixed-point assertions above keep passing.
const HUD_URL = pathToFileURL(path.join(import.meta.dirname, "../src/aurora/lib/hud.ts")).href;

function sgtMsToMidnightUnderTZ(tz) {
  return Number(execFileSync(
    process.execPath,
    ["--experimental-strip-types", "-e",
     `import(${JSON.stringify(HUD_URL)}).then(m => ` +
       `process.stdout.write(String(m.sgtMsToMidnight(${Date.parse("2026-08-05T15:00:00Z")}))));`],
    { env: { ...process.env, TZ: tz }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ));
}

for (const tz of ["America/New_York", "Etc/GMT-8"]) {
  assert.strictEqual(sgtMsToMidnightUnderTZ(tz), 3_600_000,
    `sgtMsToMidnight must return the same 1h-to-midnight answer under TZ=${tz} as under ` +
    "SGT — the +08:00 offset is a fixed constant, not the runtime's local midnight");
}

// ── streak risk is informative, and silent once the day is done ──────────────
const t = Date.parse("2026-08-05T15:00:00Z"); // 23:00 SGT
assert.strictEqual(streakRisk(true, t).atRisk, false, "a finished day is never at risk");
assert.strictEqual(streakRisk(false, t).atRisk, true, "an unfinished day late on is at risk");
assert.strictEqual(streakRisk(false, t).msLeft, 3_600_000, "and it reports the real time left");
assert.strictEqual(streakRisk(undefined, t).atRisk, false,
  "an UNKNOWN day is not an at-risk day — a failed read must not invent an alarm");

// ── the boost countdown ──────────────────────────────────────────────────────
assert.strictEqual(boostRemaining("2026-08-05T23:20:00+08:00", t), 1_200_000, "20 minutes left");
assert.strictEqual(boostRemaining("2026-08-05T22:00:00+08:00", t), 0, "an expired boost is 0, never negative");
assert.strictEqual(boostRemaining(null, t), 0, "no boost is 0");
assert.strictEqual(boostRemaining("not-a-date", t), 0, "an unparseable stamp is 0, not NaN");

// ── countdown formatting ─────────────────────────────────────────────────────
assert.strictEqual(formatCountdown(3_600_000), "1h 00m");
assert.strictEqual(formatCountdown(1_200_000), "20:00");
assert.strictEqual(formatCountdown(61_000), "1:01");
assert.strictEqual(formatCountdown(0), "0:00");
assert.strictEqual(formatCountdown(-5), "0:00", "never renders a negative clock");

// ── the quest rollup NEVER fabricates zeros ──────────────────────────────────
const qs = [
  { kind: "adaptive", complete: true,  claimed: true },
  { kind: "breadth",  complete: true,  claimed: false },
  { kind: "stretch",  complete: false, claimed: false },
];
assert.deepStrictEqual(questRollup(qs), { done: 2, total: 3, claimable: 1 });
assert.strictEqual(questRollup(null), null,
  "a failed read is UNKNOWN, not '0/3 done' — that is the lie this codebase guards against");
assert.strictEqual(questRollup([]), null, "and so is an empty set: there are always three");

console.log("PASS: hud_logic");
```

- [ ] **Step 2: Run it to watch it fail**

```bash
node --experimental-strip-types frontend/tests/hud_logic.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` for `../src/aurora/lib/hud.ts`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/aurora/lib/hud.ts`:

```ts
/* The Home HUD's pure decisions. No React, no DOM, no network — so every rule that
   could lie to a student is unit-testable (frontend/tests/hud_logic.mjs).

   The recurring rule here: an UNKNOWN is never a ZERO. A failed read renders as
   "couldn't load", never as "0/3 quests" or "no streak" — Home painting a failure as
   fact is a bug this app has already shipped once. */

/** SGT is UTC+8 with no DST, so the day boundary is arithmetic, not a locale lookup.
 *  Deliberately NOT the device's local midnight: a student travelling, or a laptop on
 *  the wrong timezone, must still be told when SNEC's day ends. */
const SGT_OFFSET_MS = 8 * 60 * 60_000;

export interface ChestState { claimed: boolean; key: string; label: string }
export interface QuestRow {
  kind: string; title: string; target: number; reward_xp: number;
  progress: number; complete: boolean; claimed: boolean;
}

/** How much of the chest the DOM is allowed to know.
 *
 *  GET /api/home returns `key` and `label` even when the chest is sealed — the roll is
 *  a pure function of (student_id, date), so the endpoint computes it either way. That
 *  is harmless as data and fatal as UI: rendering the label on a sealed chest spoils
 *  the one ceremony the app has. Everything downstream reads THIS, never `chest.label`. */
export function chestReveal(
  chest: ChestState | null | undefined,
  justClaimedThisSession: boolean,
): { sealed: boolean; label: string | null } {
  if (!chest) return { sealed: true, label: null };
  const open = chest.claimed || justClaimedThisSession;
  return open ? { sealed: false, label: chest.label } : { sealed: true, label: null };
}

/** Milliseconds until the next SGT midnight. */
export function sgtMsToMidnight(nowMs: number): number {
  const sinceSgtDayStart = (nowMs + SGT_OFFSET_MS) % 86_400_000;
  return 86_400_000 - sinceSgtDayStart;
}

/** The loss-aversion Phase 1 chose instead of hearts: a deadline, not a lockout.
 *  `doneToday` undefined means the progress read failed — which is NOT a reason to
 *  raise an alarm. Silence is the honest state for an unknown. */
export function streakRisk(
  doneToday: boolean | undefined,
  nowMs: number,
): { atRisk: boolean; msLeft: number } {
  const msLeft = sgtMsToMidnight(nowMs);
  return { atRisk: doneToday === false, msLeft };
}

/** Milliseconds of XP boost left. Clamped at 0 — an expired or unparseable stamp is
 *  "no boost", never a negative clock. */
export function boostRemaining(until: string | null | undefined, nowMs: number): number {
  if (!until) return 0;
  const end = Date.parse(until);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - nowMs);
}

/** "1h 04m" over an hour, "M:SS" under it. Never negative. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** null means UNKNOWN — render "couldn't load", never "0/3".
 *  An empty array is also unknown: the backend always generates exactly three quests,
 *  so zero of them means the read degraded, not that the student has no work. */
export function questRollup(
  quests: Pick<QuestRow, "complete" | "claimed">[] | null | undefined,
): { done: number; total: number; claimable: number } | null {
  if (!quests || quests.length === 0) return null;
  return {
    done: quests.filter((q) => q.complete).length,
    total: quests.length,
    claimable: quests.filter((q) => q.complete && !q.claimed).length,
  };
}
```

- [ ] **Step 4: Run it green**

```bash
node --experimental-strip-types frontend/tests/hud_logic.mjs
```

Expected: `PASS: hud_logic`.

- [ ] **Step 5: Confirm the logic runner discovered it**

```bash
cd frontend && npm run test:logic
```

Expected: the run lists `hud_logic.mjs` among the harnesses and exits 0. If it is not
listed, it was not discovered and gates nothing — stop and fix that before continuing.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/lib/hud.ts frontend/tests/hud_logic.mjs && git commit -m "feat(home): pure HUD logic — the chest may not leak its prize"
```

---

## Task 2: `useHome` — the network seam

**Files:**
- Create: `frontend/src/hooks/useHome.ts`
- Modify: `frontend/src/lib/queryClient.ts:35`

No unit test: this file is a thin TanStack wrapper whose only logic is invalidation, and
the behaviour that matters (a claim moves the numbers) is a behavioural assertion in
Task 11. Testing it in isolation would mean mocking `fetch` and TanStack to assert that
TanStack works.

- [ ] **Step 1: Create the hook**

Create `frontend/src/hooks/useHome.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChestState, QuestRow } from "@/aurora/lib/hud";

export interface LeagueStanding {
  rank: number; pool_size: number; promote_count: number;
  division_name: string; xp_to_promotion: number;
}
export interface BoostState { multiplier: number; until: string | null }

/* Every section is independently nullable: GET /api/home degrades per-section rather
   than failing whole, and a null must render as "couldn't load" — never as zeros. */
export interface HomeData {
  quests: QuestRow[] | null;
  chest: ChestState | null;
  boost: BoostState | null;
  league: LeagueStanding | null;
}

async function fetchHome(): Promise<HomeData> {
  const res = await fetch("/api/home", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch home");
  return res.json();
}

export function useHome() {
  return useQuery<HomeData>({
    queryKey: ["home"],
    queryFn: fetchHome,
    // Same liveness contract as ["progress"]: the quest tally must repaint the moment a
    // deck is cleared, and placeholderData keeps the last real values on screen during
    // the refetch rather than flashing to a skeleton.
    placeholderData: (prev) => prev,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
}

/** Claim today's chest. Idempotent server-side — the drop is pure over
 *  (student_id, date), so a retry cannot pay a different prize. */
export function useClaimChest() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; already_claimed: boolean; drop: { key: string; label: string } | null }>({
    mutationFn: async () => {
      const res = await fetch("/api/home/chest/claim", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Claim failed");
      return res.json();
    },
    // A chest drop can grant a streak freeze, which lives on the progress payload.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}

/** Claim a completed quest's XP. */
export function useClaimQuest() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; already_claimed: boolean; reward_xp?: number }, Error, string>({
    mutationFn: async (kind) => {
      const res = await fetch("/api/home/quest/claim", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) throw new Error("Claim failed");
      return res.json();
    },
    // The payout moves XP, which moves League rank — leaving ["progress"] or the rank
    // strip stale would show a student a reward that appears not to have landed.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["home"] });
      qc.invalidateQueries({ queryKey: ["progress"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
  });
}
```

- [ ] **Step 2: Keep the HUD out of the offline cache**

In `frontend/src/lib/queryClient.ts`, replace the body of `shouldPersistQueryKey`:

```ts
export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] !== "flashcards" && queryKey[0] !== "home";
}
```

And extend the doc comment above it with:

```
 *  ["home"] is excluded for the same reason: it is DAY-SCOPED. Rehydrating yesterday's
 *  cache paints yesterday's three quest titles and a chest that reads unclaimed, for
 *  one frame before the refetch lands. Correct-looking and wrong is the worst kind.
 *  No PERSIST_SCHEMA_VERSION bump: a key that is never persisted cannot be rehydrated,
 *  and no existing persisted shape changed.
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useHome.ts frontend/src/lib/queryClient.ts && git commit -m "feat(home): useHome — one query, two claims, never persisted"
```

---

## Task 3: STRUCK material tokens

**Files:**
- Modify: `frontend/src/aurora/home.css` (the `.aurora-home` token block, around line 8-25)

The four lip depths, ported from `leaderboard.css:259-261` so the two screens are
literally the same material. No new colours.

- [ ] **Step 1: Add the tokens**

Inside `.aurora-home { … }`, after the existing `--sh-lg` / `--pop` lines, add:

```css
  /* ── STRUCK material (Phase 2). The League's five moves, same tokens, so Home and
     The League read as one game. leaderboard.css:15-19 names Home's OLD construction —
     1px hairlines, blurred shadows, pastel fills, smooth washes — as the generated-
     dashboard house style. --sh / --sh-lg / --sheen above are exactly that and are
     retained ONLY for the objects Phase 2 does not restrike.

     THE LIP LADDER — exactly four depths. A fifth gets a lip only if another gives one
     up, or "material everywhere" collapses into "the whole page is buttons".
       structural  5px / 2.5px   .hm-deck .hm-board .hm-fcard .hm-panel
       medallion   3px / 2px     .hm-chest .hm-badge
       pill        2px / 2px     .hm-chip .hm-claim .hm-boost .hm-lb
       flat        none          .hm-quest rows, calendar cells, the canvas

     ⚠ NEVER 1px, and never 1.5px: Chrome snaps a used border-width to whole device
     pixels, so a 1.5px outline RENDERS as the banned hairline and getComputedStyle
     reports "1px". Differentiation comes from lip DEPTH, which is an offset and does
     not snap. Gated in home_hud_assert.mjs. */
  --mat-ink:#2A1F3D;      /* warm near-black violet — never grey, never #000 */
  --mat-out:2.5px;
  --mat-lip:5px;
```

- [ ] **Step 2: Add the three depth mixins**

Append a new section to `home.css` (order does not matter; put it before the media
queries). `--lip-c` is each object's own lip colour — a darker sibling of its fill.

```css
/* ── the struck depths ───────────────────────────────────────────────────────
   Move 2 of the five: a HARD LIP is an offset shadow with ZERO BLUR, plus a second
   shadow at the same offset carrying the outline as SPREAD — that second one is what
   wraps the keyline around the lip's left and right crescents instead of stopping
   where the box does. Blur may describe the ground; it may never describe an edge.
   The third (blurred) shadow is the GROUND, and is the only blur permitted. */
.aurora-home .struck-structural {
  border:var(--mat-out) solid var(--mat-ink);
  box-shadow:
    0 var(--mat-lip) 0 0 var(--lip-c, #D9CDB6),
    0 var(--mat-lip) 0 var(--mat-out) var(--mat-ink),
    0 calc(var(--mat-lip) + 8px) 14px -5px rgba(42,31,61,.34);
}
.aurora-home .struck-medallion {
  border:2px solid var(--mat-ink);
  box-shadow:
    0 3px 0 0 var(--lip-c, #D9CDB6),
    0 3px 0 2px var(--mat-ink),
    0 9px 12px -5px rgba(42,31,61,.32);
}
.aurora-home .struck-pill {
  border:2px solid var(--mat-ink);
  box-shadow: 0 2px 0 0 var(--lip-c, #D9CDB6), 0 2px 0 2px var(--mat-ink);
}
/* A pressed object loses its lip and sinks by exactly the lip's height — the press IS
   the depth being spent. */
.aurora-home .struck-pill:active,
.aurora-home .struck-medallion:active {
  transform:translateY(2px);
  box-shadow: 0 0 0 0 var(--lip-c, #D9CDB6), 0 0 0 2px var(--mat-ink);
}
```

- [ ] **Step 3: Restrike `.hm-chip` — the smallest and most-repeated offender**

Replace its `border:1px solid #F1DCB2;` and its `box-shadow:` with the pill depth. Keep
its gradient fill but give it a **hard stop** and a solid `background-color` (a
gradient-only box has none, so the contrast probe walks past it to the page and measures
nothing):

```css
.hm-chip { display:flex; align-items:center; gap:9px; --lip-c:#E3C489;
  background-color:#FCEAC8;
  background-image:linear-gradient(180deg,#FFF6E6 0%,#FFF6E6 46%,#FCEAC8 46%);
  border-radius:999px; padding:6px 8px 6px 16px; }
```

…and add `struck-pill` to its className in `Dashboard.tsx:100`.

- [ ] **Step 4: Verify the build still compiles**

```bash
cd frontend && npm run typecheck && npm run build
```

Expected: clean. (Memory: a memory-starved box needs `next build --webpack`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/home.css frontend/src/aurora/screens/Dashboard.tsx && git commit -m "feat(home): the four struck depths, and the level chip loses its hairline"
```

---

## Task 4: the failing screen harness

**Files:**
- Create: `frontend/tests/home_hud_assert.mjs`

Written **before** the deck exists, so it fails for the right reason and Tasks 5-9 have a
target. It is gated the moment it lands: `scripts/start-harness.sh` discovers any
`frontend/tests/*.mjs` that is not `_`-prefixed and contains `from "playwright"`, and the
opt-out list (`NOT_GATED`) holds only `visual_sweep.mjs`.

Read `frontend/tests/home_mobile_assert.mjs` first for the house pattern: the `bad()` /
`ok()` helpers, the mocked-API boot, and the `FAIL:` line convention (a harness that
crashes without printing `FAIL:` reads as a starved box, not a defect — see the
dev-box memory).

- [ ] **Step 1: Write the harness**

Create `frontend/tests/home_hud_assert.mjs`. Mock `/api/home` and `/api/progress` the
way `aurora_assert.mjs` mocks its routes, then assert:

```js
/* The Home HUD gate. Six bounds, each one a defect this screen can actually ship.

   Mock chest label is deliberately a string that appears NOWHERE else in the app, so
   the leak assertion cannot pass by accident. */
const SECRET = "ZZ-CHEST-SECRET-ZZ";

// 1. THE FOLD BUDGET — at 390x844 the deck's four objects are above the fold.
//    The League gates "ranks visible >= 8" rather than arguing about layout; this is
//    the same discipline. If it fails, the greeting shrinks — it has the least claim
//    on the fold.
for (const id of ["hud-status", "quest-row-0", "quest-row-1", "quest-row-2", "chest-tile"]) {
  const box = await p.locator(`[data-testid="${id}"]`).boundingBox();
  if (!box) bad(`${id} is not rendered at all`);
  else if (box.y + box.height > 844) bad(`${id} falls below the 390x844 fold (bottom ${Math.round(box.y + box.height)})`);
  else ok(`${id} is above the fold`);
}

// 2. A SEALED CHEST DOES NOT LEAK ITS DROP. The payload carries key+label even when
//    unclaimed (the roll is pure), so this is a real and invisible-in-review bug.
const leaked = await p.evaluate((s) => document.body.innerText.includes(s), SECRET);
if (leaked) bad("the sealed chest leaked its drop into the DOM");
else ok("sealed chest reveals nothing");

// 3. NO HAIRLINES ON THE DECK. Chrome snaps used border-width to whole device pixels,
//    so a 1.5px declaration renders as the banned 1px. Measure the USED value.
const thin = await p.evaluate(() => [...document.querySelectorAll(
  ".hm-deck, .hm-board, .hm-chest, .hm-claim, .hm-boost, .hm-chip, .hm-lb")]
  .filter((e) => { const w = parseFloat(getComputedStyle(e).borderTopWidth); return w > 0 && w < 2; })
  .map((e) => `${e.className}@${getComputedStyle(e).borderTopWidth}`));
if (thin.length) bad(`struck objects rendering a hairline border: ${thin.join(", ")}`);
else ok("no struck object renders a border under 2px");

// 4. EVERY STRUCK OBJECT DECLARES A SOLID background-color. A gradient-only box has
//    none, so the contrast probe walks past it to the page and measures nothing.
const noSolid = await p.evaluate(() => [...document.querySelectorAll(
  ".hm-deck, .hm-board, .hm-chest, .hm-claim, .hm-boost, .hm-chip, .hm-lb")]
  .filter((e) => { const bg = getComputedStyle(e).backgroundColor;
                   return !bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)"; })
  .map((e) => e.className));
if (noSolid.length) bad(`struck objects with no solid background-color: ${noSolid.join(", ")}`);
else ok("every struck object ends in a solid");

// 5. 0px HORIZONTAL PAGE OVERFLOW at 390px, and nothing rotates its own box (a rotated
//    square reports a bounding box 1.41x its width and escapes an overflow sweep even
//    under overflow:hidden — clipping stops the paint, not getBoundingClientRect).

// 6. TOUCH TARGETS >= 44px on every claim button and the chest.
```

Plus a **second page load under `prefers-reduced-motion: reduce`** asserting:

```js
// The shake, the burst and the confetti freeze. The two COUNTDOWNS DO NOT — a frozen
// clock lies about the time, and reduced motion is about vestibular safety, not about
// withholding information. Assert the chest's animation-name is "none" while the
// boost timer's text still changes across a 1.2s wait.
```

- [ ] **Step 2: Run it and watch it fail**

```bash
SKIP_BUILD=1 bash scripts/start-harness.sh serve
```

then

```bash
node frontend/tests/home_hud_assert.mjs
```

Expected: `FAIL: hud-status is not rendered at all` and four siblings. **A crash with no
`FAIL:` line is not a red test** — it means the harness or the box is broken. Fix that
first.

- [ ] **Step 3: Commit the red harness**

```bash
git add frontend/tests/home_hud_assert.mjs && git commit -m "test(home): the HUD gate — fold budget, no leaked drop, no hairlines"
```

---

## Task 5: StatusBar

**Files:**
- Create: `frontend/src/aurora/components/home/StatusBar.tsx`
- Modify: `frontend/src/aurora/home.css`

Level + rank, an XP-to-next meter, the streak-at-risk countdown, and the boost timer when
live. `data-testid="hud-status"`.

- [ ] **Step 1: Build it**

Props: `{ level, rank, xpInLevel, xpToNext, doneToday, boost }`. Rules:

- Numerals count up on arrival via the existing `useCountUp`
  (`frontend/src/hooks/useCountUp.ts`) — the same hook `TierBand.tsx` and
  `CaseSession.tsx` already use.
- The **boost timer and the streak countdown tick on a 1s interval**, and that interval
  keeps running under reduced motion. Only the pulse/glow around them freezes.
  Read the values through `boostRemaining` / `streakRisk` / `formatCountdown` from
  `hud.ts` — never inline the arithmetic.
- `streakRisk(doneToday, Date.now()).atRisk === false` renders **nothing** for the
  streak slot. Silence is the honest state for both "done" and "unknown".
- The boost slot renders only when `boost.multiplier > 1`.
- Clean up the interval on unmount.

Skin: `struck-structural` on the bar, `struck-pill` on the boost chip (gold — gold means
the mechanic), orange on the at-risk chip. `--lip-c` set per chip.

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/home/StatusBar.tsx frontend/src/aurora/home.css && git commit -m "feat(home): the status bar — level, XP, streak deadline, live boost"
```

---

## Task 6: QuestBoard

**Files:**
- Create: `frontend/src/aurora/components/home/QuestBoard.tsx`
- Modify: `frontend/src/aurora/home.css`

Three rows. `data-testid="quest-board"`, rows `quest-row-0..2`.

- [ ] **Step 1: Build it**

Props: `{ quests: QuestRow[] | null }`. Rules:

- `questRollup(quests) === null` → render the "couldn't load" state. **Never "0/3".**
- Each row: title, `progress / target` with a meter, `+N` reward.
- The claim button renders **only when `complete && !claimed`**, calls
  `useClaimQuest().mutate(kind)`, and is disabled while the mutation is pending — a
  double-tap must not fire two POSTs.
- A `claimed` row reads spent (dimmed, a check, no button).
- **The board is `struck-structural`; the rows are FLAT** — no lip, no outline,
  separated by a machined groove (a 2px `--mat-ink` line at low alpha, plus a 1px lit
  edge beneath it). This mirrors `.lg-row`, and it is the rule that stops the page
  becoming all buttons.
- Claim buttons are `struck-pill`, green (green means complete), ≥44px tall.

- [ ] **Step 2: Typecheck, then commit**

```bash
cd frontend && npm run typecheck
```

```bash
git add frontend/src/aurora/components/home/QuestBoard.tsx frontend/src/aurora/home.css && git commit -m "feat(home): the quest board — three rows, flat on a struck plate"
```

---

## Task 7: the chest and its ceremony

**Files:**
- Create: `frontend/src/aurora/components/home/ChestTile.tsx`
- Create: `frontend/src/aurora/components/home/ChestCeremony.tsx`
- Modify: `frontend/src/aurora/home.css`

The two rules here are correctness, not polish. Get them wrong and the app either spoils
its own ceremony or shows loot the server never granted.

- [ ] **Step 1: Build `ChestTile.tsx`**

`data-testid="chest-tile"`. Owns the claim; holds `justClaimed` in local state.

```tsx
const [justClaimed, setJustClaimed] = useState<string | null>(null);
const claim = useClaimChest();
const { sealed, label } = chestReveal(chest, justClaimed !== null);
```

Rules, each load-bearing:

1. **The ceremony opens from the mutation's success callback — never from
   `chest.claimed === false` on render.** A render-driven ceremony re-fires on every
   mount before the refetch settles. Show-once-per-day is a bug class this repo has
   already shipped.
2. **It opens only on `ok === true`.** On `ok === false`, or a thrown mutation, show an
   error — not a prize. Showing loot the server did not grant is the same lie as
   painting `0 XP` on a failed read.
3. **`already_claimed === true` does NOT open the ceremony.** It reconciles the tile to
   spent, silently. That is the repeat-claim path and it must be calm.
4. The tile renders `label` only via `chestReveal`. Never touch `chest.label` directly.
5. Sealed: `struck-medallion`, gold, with a shake animation. Spent: same material,
   desaturated, showing what it paid.

- [ ] **Step 2: Build `ChestCeremony.tsx`**

Presentational + focus management. `data-testid="chest-ceremony"`, `role="dialog"`,
`aria-modal="true"`, labelled by its heading. Esc closes; focus is trapped while open and
returned to the chest tile on close.

Sequence: struck chest lands → lid bursts → the drop card rises → confetti
(`@/fx/confetti`, already imported by `Dashboard.tsx:12`) → the boost timer is already
ticking in the status bar behind it, because the mutation invalidated `["home"]`.

Under `prefers-reduced-motion` / `data-motion=reduce`: **instant reveal.** No burst, no
shake, no confetti. Gate `confetti()` behind the same check the rest of the app uses.

- [ ] **Step 3: Typecheck, then commit**

```bash
cd frontend && npm run typecheck
```

```bash
git add frontend/src/aurora/components/home/ChestTile.tsx frontend/src/aurora/components/home/ChestCeremony.tsx frontend/src/aurora/home.css && git commit -m "feat(home): the chest — sealed until claimed, loud once, never on mount"
```

---

## Task 8: RankStrip

**Files:**
- Create: `frontend/src/aurora/components/home/RankStrip.tsx`
- Modify: `frontend/src/aurora/components/home/GreetingHero.tsx:67-74`
- Modify: `frontend/src/aurora/home.css:96-102`

Replaces the candy-gradient "See where you stand" pill with the real standing.

- [ ] **Step 1: Build `RankStrip.tsx`**

Props: `{ league: LeagueStanding | null }`. A `Link` to `/leaderboard`, keeping
**`className="hm-lb"` and `data-testid="greeting-leaderboard"`** — `home_mobile_assert.mjs`
and `aurora_assert.mjs` both reach for those, and keeping them is cheaper and more honest
than rewriting two gates for a control that still does exactly the same job.

Renders: `{division_name} · #{rank} of {pool_size}` and, when `xp_to_promotion > 0`,
`{n} XP to promotion`. On `rank <= promote_count`, say they are **in** the promotion zone
instead. `league === null` → a quiet "See where you stand" fallback, so a failed league
read still leaves the route reachable.

- [ ] **Step 2: Remove the old pill from GreetingHero**

Delete the `<Link href="/leaderboard" className="hm-lb" …>` block at
`GreetingHero.tsx:70-74` and the comment above it. Drop the now-unused `Link` and `Icon`
imports **only if nothing else in the file uses them** — check before deleting.

- [ ] **Step 3: Restrike `.hm-lb`**

Replace the saturated gradient + `0 10px 22px -8px` blurred shadow + `hm-lb-pulse`
animation with `struck-pill` material. Keep it one control, ≥44px tall. Remove the
`animation:hm-lb-pulse` line and the now-orphaned `@keyframes hm-lb-pulse` — that is an
orphan this change created, so removing it is in scope.

- [ ] **Step 4: Typecheck, then commit**

```bash
cd frontend && npm run typecheck
```

```bash
git add frontend/src/aurora/components/home/RankStrip.tsx frontend/src/aurora/components/home/GreetingHero.tsx frontend/src/aurora/home.css && git commit -m "feat(home): the rank strip — a real standing beats a tease"
```

---

## Task 9: rewire Dashboard into three zones

**Files:**
- Modify: `frontend/src/aurora/screens/Dashboard.tsx`
- Modify: `frontend/src/aurora/home.css`

⚠ **Re-Read `Dashboard.tsx` before editing** — if this task runs after a compaction, the
summary is not a Read.

- [ ] **Step 1: Rewire**

```
.hm-top                       unchanged (logo, level chip, Eyecon menu)
.hm-deck      NEW    StatusBar · GreetingHero(host) + QuestBoard · ChestTile + RankStrip
FeatureCarousel      unchanged, OUTSIDE both guards
.hm-record    was .hm-lower   StreakTile + LumenLadder
```

Rules:

- Add `const { data: home, isError: homeFailed } = useHome();` and pass the four
  sections down. `homeFailed && !home` is the HUD's unknown state — mirror the existing
  `progressUnknown` idiom at `Dashboard.tsx:38` exactly.
- **`FeatureCarousel` stays outside both guards.** The comment at
  `Dashboard.tsx:124-125` says why: it reads no progress, and a failed read must still
  leave Tutor, Virtual Patients and Flashcards reachable. Preserve that verbatim.
- `StreakTile` moves from `.hm-hero` into the record, **unchanged** — same props, same
  `data-testid="streak-tile"`. The streak *numeral* is not duplicated into the status
  bar; only the new at-risk countdown lives there, so two numerals can never disagree.
- `.hm-hero` is retired. `.hm-record` is a two-column grid on desktop, stacked on phone.

- [ ] **Step 2: Shrink the greeting headline — superseded criterion (c)**

`home.css:74` is `.hm-greet h1 { … font-size:62px; … }`. The 62px headline is the least
game-like object on the page and it is occupying the fold the quest board needs. Drop it
to roughly **34-38px** on desktop, scaling down at the existing breakpoints, and reduce
`.hm-greet`'s padding (`34px 44px 30px`) to match.

The greeting **engine** is untouched — `pickGreeting`, the day-of-year rotation and the
`<em>` accent word all stay exactly as they are. `greeting_assert.mjs` asserts the text,
not the size, and must stay green. `home_mobile_assert.mjs`'s `.hm-greet h1 ≤ 40% of
viewport height` bound gets easier to hold.

- [ ] **Step 3: Phone layout**

At the two existing `(pointer:coarse)` tiers (portrait `max-width:640px`, landscape
`max-height:480px`) the deck is one column: status bar, board, then chest + rank side by
side. Iris is already `display:none` on those tiers by the 2026-07-20 lock — leave that
rule alone; the host panel simply collapses to the greeting line.

⚠ Every media query needs a **height** term as well as width: a 932px landscape phone
clears any `min-width:860px` desktop breakpoint.

- [ ] **Step 4: Build and run the HUD harness — it should now go green**

```bash
bash scripts/start-harness.sh serve
```

```bash
node frontend/tests/home_hud_assert.mjs
```

Expected: every `ok:` line, no `FAIL:`. Bounds 3-6 may still fail — that is Task 10.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/screens/Dashboard.tsx frontend/src/aurora/home.css && git commit -m "feat(home): three zones — the deck owns the fold, the record moves down"
```

---

## Task 10: restrike the remaining objects until the material bounds pass

**Files:**
- Modify: `frontend/src/aurora/home.css`

Bounds 3-6 of the harness (no hairlines, solid backgrounds, reduced motion, touch
targets) drive this. Work until they are green.

- [ ] **Step 1: Restrike the surviving objects**

`.hm-fcard` (frame only — the coverflow mechanics and the mascot cut-outs are untouched),
`.hm-streak`, `.hm-panel`, `.hm-badge`. Each gets its ladder depth, an `--lip-c`, a
hard-stop fill and a solid `background-color`.

⚠ Restrike **`.hm-panel`** (`home.css:301`), not `.hm-panel--lumen`. The base class is
where `border:1px solid var(--line)` lives — the modifier only retints. Striking the
modifier would leave the hairline underneath it.

**Do not restrike:** the ~35 calendar cells or the quest rows. They are the repeated
elements and they stay flat.

- [ ] **Step 2: Reduced motion**

Every new animation — chest shake, lid burst, drop rise, count-up — freezes under
`prefers-reduced-motion: reduce` **and** `[data-motion="reduce"]`. Both signals, matching
the existing block in `home.css`.

**The two countdowns keep ticking.** Their text updates on the interval; only their
pulse/glow freezes.

- [ ] **Step 3: Run the harness to green**

```bash
node frontend/tests/home_hud_assert.mjs
```

Expected: no `FAIL:`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/aurora/home.css && git commit -m "feat(home): restrike the record and the mode cards; the repeated elements stay flat"
```

---

## Task 11: the full gate, the lock, and ship

**Files:**
- Modify: `docs/design-locks.md` (the Home / Dashboard section, ending line 511)

- [ ] **Step 1: Run every gate**

```bash
cd frontend && npm run typecheck && npm run build
```

```bash
bash scripts/start-harness.sh all
```

```bash
python -m pytest -q
```

⚠ **Count the harnesses.** A zero exit only means nothing that ran failed. `all`
discovers them; confirm the count did not collapse (`MIN_HARNESSES=15` is the floor, and
this change should ADD one). Read the list, not just the exit code.

The eight Home-touching harnesses — `aurora_assert`, `home_mobile_assert`,
`home_carousel_assert`, `hoverPause_logic`, `greeting_assert`, `display_name_assert`,
`fixed_overlay_assert`, `api_error_assert` — must each be **read**, not assumed. Nothing
was deleted, so their selectors survive; layout assertions may need updating, and
`home_mobile_assert`'s `.hm-greet h1 ≤ 40% of viewport` bound should now pass more
easily, not less.

- [ ] **Step 2: Behavioural verify on the running app**

Not optional — these are state invariants, and the standing rule is that such an
invariant needs a regression test **and** a behavioural check on the running app.

1. Open Home → the chest is sealed and its drop appears nowhere on screen.
2. Claim it → the ceremony fires once → the boost timer starts counting in the status bar.
3. **Reload → the tile is spent and the ceremony does NOT re-fire.**
4. Claim again via a second tab → `already_claimed`, same drop, no ceremony, no double pay.
5. Clear a flashcard deck → the matching quest's progress moves by exactly 1.
6. Complete and claim a quest → XP moves and the rank strip updates.
7. `/leaderboard` rank agrees with the strip.

- [ ] **Step 3: Record the superseded criteria**

Append to the Home / Dashboard section of `docs/design-locks.md` a
**"Game HUD (2026-08-05)"** amendment naming each of the five criteria the spec
supersedes — (a) toybox material, (b) `.hm-hero` layout, (c) the 62px headline, (d) the
candy leaderboard pill, (e) `.hm-lower` as a single column — and listing what is
explicitly preserved: every generated asset, the coverflow mechanics including
hover-pause, the vault's paged-frame-of-five, the month calendar's day-name-derived
offset, and the greeting engine.

- [ ] **Step 4: Ship**

```bash
git add docs/design-locks.md && git commit -m "docs(home): lock the game HUD — five criteria superseded, every asset preserved"
```

```bash
git fetch origin main && git rev-list --count HEAD..origin/main
```

Expect `0` (multiple sessions edit this repo and `main` gets force-pushed — never push
without confirming a fast-forward). Then:

```bash
git push origin main
```

- [ ] **Step 5: Confirm CI, not just the local gates**

```bash
gh run list --branch main --limit 1
```

`main` auto-deploys to Render prod. `cancelled` is not a pass — read the jobs.

---

## Notes on scope

- **No Python changes.** Phase 1's 1731 tests must stay green untouched. If a backend
  change feels necessary, stop and escalate — it means the payload contract moved.
- **No new generated assets.** Every raster on Home already exists.
- **Do not tune the Phase 1 constants** (quest targets, chest weights, the 20-minute
  boost). They are pure constants in `tools/gamification/`, and they are a data question
  to answer once real students hit them.
