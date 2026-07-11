# Tutor Refresh — Manrope · Real Sessions · Motion Greeting

**Date:** 2026-07-11
**Surface:** Tutor feature (`/chat` → `.aurora-chat`): landing (`TutorLanding`) + chat (`Tutor`).
**Type:** Frontend-only. No backend, no DB migration.

## Goal

Six changes to the tutor feature — a sleeker, seamless surface:

1. All reading/prose/UI text in the tutor feature uses **Manrope** (mono readout
   labels stay JetBrains Mono).
2. "Recent sessions" on the landing become **real, reopenable tutor conversations**
   (past 3), persisted in the browser. Zero sessions → nothing shown.
3. Landing greeting + chatbox are **larger**; recent-sessions block is **smaller**.
4. The greeting **name** is a **fast motion gradient**.
5. **Remove the in-chat greeting** — the thread's first bubble is the user's own
   first message.
6. The landing mascot becomes a **brand-new dancing Iris** Veo loop — cute, funny,
   ridiculous, fast — replacing the reused static `iris.png`.

## Decisions (locked with the user, 2026-07-11)

- **Session storage = browser only (localStorage)**, keyed to the logged-in student.
  No backend endpoint, no Supabase table, no migration. Trade-off accepted:
  per-device / per-browser; lost on cache clear; no cross-device sync.
- **Font scope = keep mono labels.** Manrope replaces the tutor's reading sans
  (currently Figtree); the small monospace readout labels (JetBrains Mono, electric
  indigo — the "Live Wire" accent) are preserved.
- **Landing mascot = a brand-new, tutor-only dancing Iris Veo loop.** Distinct from
  Home's calm gentle-bob loop: energetic, cute, funny, ridiculous, *fast* dance.
  Same character (Iris/iris.png, image-to-video — honors the brand lock), same
  ~216px slot. Paid Veo render, go-ahead given.
- **Greeting sub-line stays** (the rotating learning-humour line under the name).

## Workstreams

- **A — Core refresh (free, ships first):** fonts, real localStorage sessions,
  remove in-chat greeting, motion-gradient name, sizing. No paid calls; fully
  testable keyless. Lands and verifies green on its own.
- **B — Dancing Iris mascot (paid, reviewed follow-on):** scaffold the `<video>`
  wiring + fallback (green), adapt the Veo tool, run the paid `--generate`, review,
  `--install`. Sequenced after A so the free work isn't blocked on video gen.

## Current state (verified 2026-07-11)

- Route `/chat` → `frontend/src/app/(shell)/chat/page.tsx` → `<CheckInGuard><Tutor/></CheckInGuard>`.
- `frontend/src/aurora/screens/Tutor.tsx` owns a `phase` state machine
  (`"landing" | "leaving" | "chat"`, line 56). Renders `<TutorLanding>` while
  `phase !== "chat"` (lines 187-201), else the chat thread (lines 203-262).
- **Chat thread is ephemeral.** `messages` is plain `useState` seeded with
  `INITIAL_MESSAGES` (one canned AI bubble, lines 28-30/41). Never persisted to
  backend, localStorage, IndexedDB, or the React Query cache. Reload wipes it.
- **"Recent sessions" today** come from `useProgress().sessions` (backend
  `GET /api/progress`), which returns **metadata only** (`topic`, 200-char
  `summary`, `mode` hardcoded `"chat"`) — and those rows are actually written by
  **OSCE case completions**, not tutor chats (the tutor UI never calls
  `/api/end-session`). `resumeSession` (Tutor.tsx:76-77) seeds a *new* message from
  the summary; it does **not** reopen the real conversation.
- `TutorLanding.tsx`: `recent = sessions.slice(0, 5)` (line 65); when empty, falls
  back to a hardcoded `STARTERS` array (lines 18-23) under a "Try one of these"
  header (lines 116-120).
- **Fonts:** all via `next/font/google` in `frontend/src/app/layout.tsx`. Figtree
  instantiated at lines 51-56 as `--font-figtree-src`, applied on `<html>`
  (line 87). `.aurora-chat` locally overrides `--font-sans` to Figtree
  (`aurora.css:1426`) and applies it (`:1430`); `--font-mono` (JetBrains) is left
  alone so mono labels stay mono. Harness gates the Figtree scope at
  `frontend/tests/aurora_assert.mjs:214-217` (fails if `.tl-hello` computed
  `fontFamily` doesn't match `/figtree/i`).
- Greeting name: `.tl-hello em` already has a **static** text gradient
  (`aurora.css:1635-1636`). Rotating landing greeting comes from the pure
  `frontend/src/aurora/lib/tutorGreeting.ts` (untouched by this work).

## Changes

### 1. Fonts → Manrope (mono preserved)

- `layout.tsx`: add `Manrope` to the `next/font/google` import; instantiate mirroring
  the Figtree block (`weight: ["400","500","600","700"], subsets:["latin"],
  variable:"--font-manrope-src", display:"swap"`); add `${manrope.variable}` to the
  `<html>` className.
- `aurora.css`: change the `.aurora-chat` `--font-sans` override (line ~1426) from
  `var(--font-figtree-src), ...` to `var(--font-manrope-src), ...`. Leave
  `--font-mono` untouched.
- Remove the Figtree `next/font` import **only if** a repo grep confirms the tutor
  was its sole consumer (orphan created by this change). Otherwise leave it.
- Brand "EyeBot" wordmark (CoBrand) is unaffected per the branding lock.

### 2. Real recent sessions (localStorage, reopenable)

New pure module `frontend/src/aurora/lib/tutorSessions.ts` (no React; same shape as
`tutorGreeting.ts` so it is Node-testable):

```ts
export interface StoredMessage { type: "ai" | "user"; id: string; text: string }
export interface StoredSession {
  id: string;
  startedAt: number;
  updatedAt: number;
  topic: string;      // deriveTopic(firstUserMessage)
  preview: string;    // derivePreview(lastAssistantMessage)
  messages: StoredMessage[];
}
const KEY = (userId: string) => `eyebot_tutor_sessions:${userId}`;
const MAX_STORED = 10;

export function loadSessions(userId, storage): StoredSession[]   // tolerant: bad/absent JSON → []
export function saveSessions(userId, sessions, storage): void    // prune to MAX_STORED, newest first
export function upsertSession(sessions, session): StoredSession[] // replace by id else prepend; move to front; re-sort by updatedAt desc
export function deriveTopic(messages): string                    // first user msg text, trimmed ~60 chars, else "New chat"
export function derivePreview(messages): string                  // last ai msg text, trimmed ~120 chars, else ""
export function recentSessions(sessions, n = 3): StoredSession[] // slice newest n
```

- **userId** comes from `useAuth()` user id/sub if present; else a stable fallback
  key (`"_"`). (Verify the field name against `AuthContext` during implementation.)
- **Message normalization:** the live thread uses a discriminated union with
  different content fields (AI = `content`, user = `text`, `Tutor.tsx:24-26`).
  `tutorSessions` stores a normalized `{type, id, text}`; `Tutor.tsx` maps to/from
  the live `Message` shape at the persistence and reopen boundaries.

`Tutor.tsx` wiring:

- Add `activeSessionId: string | null` state and a `userId` from `useAuth()`.
- On the **first user message** of a fresh chat: mint `activeSessionId`
  (`Date.now()`-based id via existing id scheme) — recorded so the session appears
  even if the user leaves immediately after.
- **Persist** the current thread (normalized) via `upsertSession` +
  `saveSessions` at two points only: (a) right after appending a user message,
  (b) right after an assistant reply finishes streaming (final content). **Not**
  per-token. `updatedAt = now`, `topic`/`preview` re-derived.
- The landing reads `recentSessions(loadSessions(userId), 3)` and passes it to
  `TutorLanding` (replacing `progress?.sessions`). `useProgress` may still be used
  for achievements; only its `.sessions` stops feeding the recent list.
- **Reopen** (`resumeSession` rewritten): load the clicked record's `messages`
  (mapped back to live `Message` shape) into `messages` state, set
  `activeSessionId` to that record's id, flip `phase → "chat"`. Continued messages
  upsert the same record (moving it to the front).

`TutorLanding.tsx`:

- `recent = sessions.slice(0, 3)`.
- Card content from the real record: title = `topic`, one-line body = `preview`,
  foot = `ago(updatedAt)`. Drop the redundant per-session mode tag (all are tutor
  chats now).
- **Remove the `STARTERS` array and its fallback branch.** When `recent.length === 0`,
  render nothing for the recent block (no header, no pills).

### 3. Remove the in-chat greeting

- Delete `INITIAL_MESSAGES`; initialize `messages` to `[]`. The thread's first
  bubble becomes the user's typed message. Reopened threads start on the user's
  original first message. Confirm nothing (render or harness) assumes a non-empty
  seeded thread.

### 4. Motion-gradient name (fast)

- `.tl-hello em`: wide multi-stop electric/Gemini text gradient with
  `background-size: ~300%` and a fast `@keyframes` animating `background-position`
  (~1.5s loop). Under `@media (prefers-reduced-motion: reduce)`, freeze to a static
  gradient (no animation). Keep `background-clip: text` / transparent fill.

### 5. Sizing

- **Bigger:** `.tl-hello` (e.g. `clamp(40px, 6vw, 72px)`), `.tl-sub` a step up, and
  the `.tl-prompt` chatbox (wider `width`, taller Composer min-height).
- **Smaller / less prominent:** `.tl-recent` width, `.tl-cards` grid (tighter
  `minmax` + gap), `.tl-card` padding and type scale.
- Exact values tuned against harness screenshots; the above are starting points.

### 6. Dancing Iris mascot — Veo loop (Workstream B, paid)

Replace the static `.tl-iris` `<img src="/brand/iris.png">` on the landing with a
brand-new, tutor-only **dancing Iris** video loop — energetic, cute, funny,
ridiculous, fast — distinct from Home's calm greeting loop.

- **Generation tool:** reuse the proven Veo machinery in
  `tools/media/generate_greeting_loop.py` (probe→estimate→generate→install;
  `generate_videos` with `last_frame == first_frame` for a seamless loop; poll +
  download + install; refuses in `MOCK_MODE`; go-ahead-gated). Add a **tutor
  variant** — new config `tools/media/tutor_mascot.py` (`PROMPT`, `IMAGE_REF =
  iris.png`, `CANDIDATE_MODELS` — same Veo ids, confirmed live via `--probe`) and a
  `generate_tutor_mascot.py` (or a `--variant tutor` flag on the existing tool)
  that builds a **square 1:1** conditioning frame with the mascot centered on a
  subtle spotlight-disc background blended to the tutor surface (not Home's
  landscape warm gradient), and installs to
  `frontend/public/media/loops/tutor-mascot.mp4` + `.jpg` poster.
- **Prompt intent:** one-eyed teal-and-cream Iris doing a goofy, bouncy,
  squash-and-stretch, spinning, *fast* dance; exaggerated cartoon motion; final
  frame identical to first for a perfect loop; no camera movement, no text, no
  extra characters, stays in frame.
- **Frontend:** `.tl-iris` becomes `<video autoplay loop muted playsInline
  poster="/brand/iris.png">` inside a rounded stage (`.tl-iriswrap`), ~216px. If the
  video is absent (keyless/harness) or `prefers-reduced-motion: reduce`, it shows
  the `iris.png` poster (frozen) — the landing never depends on the video.
- **Placeholder-first:** ship the wiring with `iris.png` as poster/fallback (green,
  keyless) before any paid call; then run `--probe`/`--estimate`/`--generate`,
  review the clip, `--install`.
- **Perf:** short muted loop, square, compressed; ~216px display so keep the source
  modest. Autoplay muted + `playsInline` for mobile.

## Data flow

```
first user send ─▶ mint activeSessionId ─▶ append user msg ─▶ upsert+save (topic/preview)
                                              │
                                       POST /api/chat (SSE, unchanged, stateless)
                                              ▼
                              assistant stream completes ─▶ upsert+save (updated preview)

landing mount ─▶ loadSessions(userId) ─▶ recentSessions(_,3) ─▶ cards
card click ─▶ load record.messages ─▶ set messages + activeSessionId ─▶ phase=chat (full thread restored)
```

The `/api/chat` request/stream is unchanged and remains stateless — persistence is
purely client-side and additive.

## Error handling / edge cases

- Corrupt/absent localStorage → `loadSessions` returns `[]` (try/catch, shape guard).
- Quota exceeded on write → drop the oldest stored session and retry once; if it
  still fails, no-op (never throw into the chat flow).
- No `userId` from auth → fallback key; sessions still work for the session.
- Empty thread (user leaves before any message) → no record written.
- Reopening then sending continues the same record (front of list, updated preview).

## Testing

- **TDD:** write `frontend/tests/tutor_sessions_assert.mjs` **first** (Node
  type-stripping unit test, like `tutor_greeting_assert.mjs`), covering: upsert
  replace-by-id + move-to-front; `saveSessions` prune to `MAX_STORED`; `recentSessions`
  slice-3; `deriveTopic`/`derivePreview` (including empty → `"New chat"` / `""`);
  reopen round-trip (store → load → same messages); tolerant load (bad JSON → `[]`).
  Watch it fail, then implement.
- **Harness (`aurora_assert.mjs`):** update the Figtree gate (214-217) → `/manrope/i`;
  remove any assertion tied to the seeded AI bubble or `STARTERS`; add an
  empty-recent check (no fallback pills). If feasible, seed localStorage and assert a
  card reopens to the full thread. Pre-existing unrelated red at the flashcards D2
  back-face assert is out of scope — verify tutor assertions pass and nothing else
  regresses. Run against a warm standalone server per the harness recipe.
- **Mascot (Workstream B):** the `<video>` must degrade to the `iris.png` poster
  when the clip is absent (keyless harness) or under reduced motion — assert the
  poster/fallback renders so the harness stays green without the paid asset. Verify
  the installed loop plays + loops seamlessly by eye before shipping B.
- **ship-check:** the "real recent sessions + reopen restores full thread" state
  invariant is covered by the reopen round-trip unit test plus the harness reopen
  check.

## Files touched

| File | Change |
|------|--------|
| `frontend/src/app/layout.tsx` | Add Manrope next/font; register on `<html>`; drop Figtree if orphaned |
| `frontend/src/aurora/aurora.css` | `.aurora-chat` `--font-sans` → Manrope; `.tl-hello` size + `em` motion gradient + keyframes + reduced-motion; `.tl-sub`/`.tl-prompt` bigger; `.tl-recent`/`.tl-cards`/`.tl-card` smaller; remove orphaned `.tl-starter*` if STARTERS gone |
| `frontend/src/aurora/lib/tutorSessions.ts` | **New** pure localStorage session store |
| `frontend/tests/tutor_sessions_assert.mjs` | **New** unit test (written first) |
| `frontend/src/aurora/screens/Tutor.tsx` | Remove `INITIAL_MESSAGES`; active session id; persist on send + stream-end; landing reads localStorage; reopen restores thread |
| `frontend/src/aurora/components/TutorLanding.tsx` | `slice(0,3)`; real card data; remove `STARTERS` fallback |
| `frontend/tests/aurora_assert.mjs` | Manrope gate; drop seeded-bubble/STARTERS asserts; empty-recent + reopen checks |
| `docs/design-locks.md` | Refine tutor lock: reading font → Manrope, motion-gradient name, real-sessions behavior, dancing mascot |
| **B** `frontend/src/aurora/components/TutorLanding.tsx` | `.tl-iris` `<img>` → `<video>` (poster iris.png) in a rounded stage |
| **B** `frontend/src/aurora/aurora.css` | `.tl-iriswrap` rounded spotlight stage; `.tl-iris` video sizing; reduced-motion poster freeze |
| **B** `tools/media/tutor_mascot.py` | **New** Veo config: dance prompt, iris.png ref, square frame |
| **B** `tools/media/generate_tutor_mascot.py` (or `--variant tutor`) | **New/extended** square frame builder + generate/install to `media/loops/tutor-mascot.*` |
| **B** `frontend/public/media/loops/tutor-mascot.{mp4,jpg}` | **New** installed clip + poster (after paid gen) |

## Out of scope

- Cross-device / server-side session sync (localStorage per the decision).
- Changes to `/api/chat`, `/api/progress`, `/api/end-session`, or `chat_sessions`.
- The rotating landing-greeting humour engine (`tutorGreeting.ts`) — unchanged.
- Home's greeting Veo loop / `GreetingHero` — untouched; the tutor gets its own
  separate, more energetic loop.
- A brand-new mascot *character* — the dance animates the existing Iris (iris.png)
  per the brand lock; it is a new *loop*, not a new character.
- The pre-existing unrelated flashcards D2 harness red.
