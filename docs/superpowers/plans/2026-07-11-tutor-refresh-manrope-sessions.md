# Tutor Refresh — Manrope · Real Sessions · Motion Greeting · Dancing Mascot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the EyeBot tutor (`/chat`) sleeker and seamless — Manrope typography (mono labels kept), real reopenable localStorage-backed recent sessions (past 3), a fast motion-gradient greeting name, larger greeting + chatbox with smaller recent cards, no seeded in-chat greeting, and a brand-new dancing-Iris Veo mascot loop.

**Architecture:** Frontend-only except one paid Veo generation tool. Sessions persist client-side in `localStorage` via a pure, Node-testable module (`tutorSessions.ts`) — no backend, no DB migration. The dancing mascot reuses the existing Veo `probe→estimate→generate→install` machinery. Two workstreams: **A** (free, ships first, fully green keyless) and **B** (paid mascot, reviewed follow-on).

**Tech Stack:** Next.js 16 / React 19, Tailwind-4-in-CSS, `next/font/google`, Node type-stripping tests (`node --experimental-strip-types`), Playwright aurora harness, Python `google-genai` Veo (Workstream B).

**Spec:** `docs/superpowers/specs/2026-07-11-tutor-refresh-manrope-sessions-design.md`

---

## Conventions

- **Commits:** commit at the end of every task (commands given per task). **Push** only at the two green gates — end of Workstream A (Task 7) and end of Workstream B (Task B3) — since `main` auto-deploys to Render prod. Each task individually leaves the app green.
- **Commit trailer:** end every commit message body with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Frontend unit tests** run with `node --experimental-strip-types frontend/tests/<file>.mjs` (dependency-free modules, imported directly from `../src/...ts`).
- **Stage only this feature's files** — the tree carries unrelated dirty files (`mandy.md`, `rodtang.md`).
- **Known harness state:** `frontend/tests/aurora_assert.mjs` has a PRE-EXISTING unrelated red at the flashcards-D2 back-face assertion, which runs AFTER the tutor block. The tutor assertions (lines ~189-220) run and pass before it. Verification watches for the `PASS: Tutor greeting landing …` line and the absence of any `FAIL: Tutor …` line — the overall run may still exit 1 at the pre-existing flashcards red (out of scope).

---

## File structure

| File | Responsibility |
|------|----------------|
| `frontend/src/aurora/lib/tutorSessions.ts` | **New.** Pure localStorage session store (types, load/save/upsert/prune, topic/preview derivation). No React. |
| `frontend/tests/tutor_sessions_assert.mjs` | **New.** Node unit test for the store. |
| `frontend/src/app/layout.tsx` | Add Manrope `next/font`; drop Figtree if orphaned. |
| `frontend/src/aurora/aurora.css` | `.aurora-chat` font → Manrope; motion-gradient name; sizing; (B) mascot stage. |
| `frontend/src/aurora/screens/Tutor.tsx` | Remove seeded greeting; session persist/reopen; landing reads localStorage. |
| `frontend/src/aurora/components/TutorLanding.tsx` | Real session cards (past 3), remove STARTERS; (B) video mascot. |
| `frontend/tests/aurora_assert.mjs` | Font gate → Manrope; empty-state assert; (B) mascot asserts. |
| `docs/design-locks.md` | Refine tutor lock. |
| `tools/media/tutor_mascot.py` | **New (B).** Veo dance config (prompt, iris.png ref, models). |
| `tools/media/generate_tutor_mascot.py` | **New (B).** Square-frame builder + probe/estimate/generate/install. |
| `frontend/public/media/loops/tutor-mascot.{mp4,jpg}` | **New (B).** Installed clip + poster (after paid gen). |

---

# WORKSTREAM A — Core refresh (free)

## Task 1: Pure localStorage session store (`tutorSessions.ts`) — TDD

**Files:**
- Create: `frontend/src/aurora/lib/tutorSessions.ts`
- Test: `frontend/tests/tutor_sessions_assert.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/tutor_sessions_assert.mjs`:

```js
/* Unit test for the pure tutor-session store. Run with Node type stripping:
 *   node --experimental-strip-types frontend/tests/tutor_sessions_assert.mjs
 * (tutorSessions.ts is dependency-free so it imports in isolation.) */
import assert from "node:assert";
import {
  deriveTopic, derivePreview, loadSessions, saveSessions,
  upsertSession, recentSessions, storageKey, MAX_STORED,
} from "../src/aurora/lib/tutorSessions.ts";

// in-memory Storage double
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}
const mk = (id, updatedAt, messages = []) =>
  ({ id, startedAt: updatedAt, updatedAt, topic: "", preview: "", messages });

// 1) deriveTopic / derivePreview
assert.strictEqual(deriveTopic([]), "New chat");
assert.strictEqual(deriveTopic([{ type: "ai", id: "a", text: "hi" }]), "New chat");
assert.strictEqual(
  deriveTopic([{ type: "user", id: "u", text: "  How do I   measure IOP?  " }]),
  "How do I measure IOP?");
assert.ok(deriveTopic([{ type: "user", id: "u", text: "x".repeat(90) }]).length <= 60);
assert.strictEqual(derivePreview([]), "");
assert.strictEqual(derivePreview([{ type: "user", id: "u", text: "q" }]), "");
assert.strictEqual(
  derivePreview([{ type: "ai", id: "a1", text: "first" }, { type: "ai", id: "a2", text: "last reply" }]),
  "last reply");

// 2) upsertSession replaces by id, newest-first, no dupes
let list = [mk("a", 100), mk("b", 200)];
list = upsertSession(list, mk("a", 300));
assert.deepStrictEqual(list.map((s) => s.id), ["a", "b"]);
assert.strictEqual(list.length, 2);
list = upsertSession(list, mk("c", 50));
assert.deepStrictEqual(list.map((s) => s.id), ["a", "b", "c"]);

// 3) recentSessions slices newest 3
const many = [mk("1", 1), mk("2", 2), mk("3", 3), mk("4", 4), mk("5", 5)];
assert.deepStrictEqual(recentSessions(many, 3).map((s) => s.id), ["5", "4", "3"]);

// 4) saveSessions prunes to MAX_STORED (newest kept); load round-trips
const store = fakeStorage();
const big = Array.from({ length: MAX_STORED + 4 }, (_, i) => mk(`s${i}`, i));
saveSessions("stu1", big, store);
const loaded = loadSessions("stu1", store);
assert.strictEqual(loaded.length, MAX_STORED);
assert.strictEqual(loaded[0].id, `s${MAX_STORED + 3}`);
assert.ok(!loaded.some((s) => s.id === "s0"));

// 5) round-trip preserves messages (reopen fidelity)
const msgs = [{ type: "user", id: "u1", text: "hello" }, { type: "ai", id: "a1", text: "hi there" }];
const store2 = fakeStorage();
saveSessions("stu2", [{ id: "x", startedAt: 1, updatedAt: 2, topic: "t", preview: "p", messages: msgs }], store2);
assert.deepStrictEqual(loadSessions("stu2", store2)[0].messages, msgs);

// 6) tolerant load: absent / bad JSON / non-array / bad shape -> []
assert.deepStrictEqual(loadSessions("nope", fakeStorage()), []);
assert.deepStrictEqual(loadSessions("bad", fakeStorage({ [storageKey("bad")]: "{not json" })), []);
assert.deepStrictEqual(loadSessions("obj", fakeStorage({ [storageKey("obj")]: '{"a":1}' })), []);

// 7) per-user key isolation
const s3 = fakeStorage();
saveSessions("A", [mk("onlyA", 1)], s3);
assert.deepStrictEqual(loadSessions("B", s3), []);
assert.strictEqual(loadSessions("A", s3)[0].id, "onlyA");

console.log("PASS: tutor sessions store");
```

- [ ] **Step 2: Run the test — verify it FAILS**

Run: `node --experimental-strip-types frontend/tests/tutor_sessions_assert.mjs`
Expected: FAIL — `Cannot find module '../src/aurora/lib/tutorSessions.ts'` (module not created yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/aurora/lib/tutorSessions.ts`:

```ts
/* Pure, dependency-free tutor-session store — persists the FULL /chat thread in
   localStorage so the landing can list recent conversations and reopen them intact.
   No React/next imports so it stays unit-testable via Node type-stripping (see
   frontend/tests/tutor_sessions_assert.mjs). Keyed per student; tolerant of corrupt
   or absent storage (always degrades to []). */

export interface StoredMessage { type: "ai" | "user"; id: string; text: string }
export interface StoredSession {
  id: string;
  startedAt: number;
  updatedAt: number;
  topic: string;    // deriveTopic(firstUserMessage) — card title
  preview: string;  // derivePreview(lastAssistantMessage) — card body
  messages: StoredMessage[];
}

/* Minimal Storage surface so tests can pass a double and the app passes window.localStorage. */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = "eyebot_tutor_sessions:";
export const MAX_STORED = 10;

export function storageKey(userId: string): string {
  return PREFIX + (userId && userId.length ? userId : "_");
}

export function deriveTopic(messages: StoredMessage[]): string {
  const first = messages.find((m) => m.type === "user");
  const t = (first?.text ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  return t.length > 60 ? t.slice(0, 59).trimEnd() + "…" : t;
}

export function derivePreview(messages: StoredMessage[]): string {
  let last: StoredMessage | undefined;
  for (const m of messages) if (m.type === "ai") last = m;
  const p = (last?.text ?? "").trim().replace(/\s+/g, " ");
  if (!p) return "";
  return p.length > 120 ? p.slice(0, 119).trimEnd() + "…" : p;
}

function isValidSession(s: unknown): s is StoredSession {
  const o = s as StoredSession | null;
  return !!o && typeof o.id === "string" && typeof o.updatedAt === "number" && Array.isArray(o.messages);
}

const byNewest = (a: StoredSession, b: StoredSession) => b.updatedAt - a.updatedAt;

export function loadSessions(userId: string, storage: KVStorage): StoredSession[] {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSession);
  } catch {
    return [];
  }
}

export function saveSessions(userId: string, sessions: StoredSession[], storage: KVStorage): void {
  const pruned = [...sessions].sort(byNewest).slice(0, MAX_STORED);
  try {
    storage.setItem(storageKey(userId), JSON.stringify(pruned));
  } catch {
    // quota: keep fewer and retry once, then give up silently (never throw into chat flow)
    try { storage.setItem(storageKey(userId), JSON.stringify(pruned.slice(0, Math.max(1, MAX_STORED - 5)))); }
    catch { /* give up */ }
  }
}

export function upsertSession(sessions: StoredSession[], session: StoredSession): StoredSession[] {
  return [session, ...sessions.filter((s) => s.id !== session.id)].sort(byNewest);
}

export function recentSessions(sessions: StoredSession[], n = 3): StoredSession[] {
  return [...sessions].sort(byNewest).slice(0, n);
}
```

- [ ] **Step 4: Run the test — verify it PASSES**

Run: `node --experimental-strip-types frontend/tests/tutor_sessions_assert.mjs`
Expected: `PASS: tutor sessions store`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/lib/tutorSessions.ts frontend/tests/tutor_sessions_assert.mjs
git commit -m "feat(tutor): pure localStorage session store + unit test"
```

---

## Task 2: Fonts → Manrope (mono labels kept)

**Files:**
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/aurora/aurora.css` (the `.aurora-chat` `--font-sans` override)
- Modify: `frontend/tests/aurora_assert.mjs` (font gate)

- [ ] **Step 1: Add Manrope to `layout.tsx`**

Edit the `next/font/google` import (line 3) to add `Manrope`:

```ts
import { Inter, JetBrains_Mono, Outfit, Playfair_Display, Bricolage_Grotesque, Manrope } from "next/font/google";
```

(Note: `Figtree` is removed from the import — Step 4 confirms it's orphaned.)

Replace the Figtree instantiation block (currently lines 48-56) with a Manrope block:

```ts
/* Manrope — the reading sans for the Tutor/Chat surface. Scoped to `.aurora-chat`
   via --font-sans (see aurora.css); the "Mono + Electric" accent labels (var(--font-mono))
   stay JetBrains Mono. Loaded here so the CSS var is available app-wide. */
const manrope = Manrope({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-manrope-src",
  display: "swap",
});
```

Update the `<html>` className (line 87), replacing `${figtree.variable}` with `${manrope.variable}`:

```tsx
      className={`${sans.variable} ${mono.variable} ${display.variable} ${flourish.variable} ${homeDisplay.variable} ${manrope.variable}`}
```

- [ ] **Step 2: Point `.aurora-chat` reading sans at Manrope**

In `frontend/src/aurora/aurora.css`, replace the Figtree override comment + line (currently lines 1422-1426):

Old:
```css
  /* Reading sans on the Tutor/Chat surface = Figtree (Google-Sans / Gemini analog),
     scoped here so the "Mono + Electric" accent labels (var(--font-mono)) are untouched.
     .tl-hello inherits, .tl-sub / .aurora-chat-name set no family, .aurora-composer-field
     uses var(--font-sans) — all resolve to Figtree under this override. */
  --font-sans: var(--font-figtree-src), system-ui, sans-serif;
```
New:
```css
  /* Reading sans on the Tutor/Chat surface = Manrope, scoped here so the "Mono + Electric"
     accent labels (var(--font-mono)) are untouched. .tl-hello inherits, .tl-sub /
     .aurora-chat-name set no family, .aurora-composer-field uses var(--font-sans) — all
     resolve to Manrope under this override. */
  --font-sans: var(--font-manrope-src), system-ui, sans-serif;
```

- [ ] **Step 3: Update the harness font gate**

In `frontend/tests/aurora_assert.mjs`, update the tutor reading-sans gate (currently lines 214-217):

Old:
```js
// Tutor reading sans = Figtree (Google-Sans / Gemini analog), scoped to .aurora-chat.
const tlFont = await np.locator('[data-testid="tutor-landing"] .tl-hello')
```
Change the comment and the assertion (line 217):
```js
// Tutor reading sans = Manrope, scoped to .aurora-chat (mono accent labels stay JetBrains).
```
```js
if (!/manrope/i.test(tlFont)) { console.error(`FAIL: Tutor hello not Manrope (fontFamily=${tlFont})`); process.exit(1); }
```

- [ ] **Step 4: Confirm Figtree is orphaned and remove it**

Run: `git grep -n -i figtree -- frontend/ ':!frontend/design-system'`
Expected after Steps 1-3: matches ONLY in comments/none in code (the `--font-figtree-src` var + `Figtree` import are gone). If any live consumer remains (a `var(--font-figtree-src)` outside `.aurora-chat`), leave Figtree in `layout.tsx` instead and note it. Otherwise the removal in Step 1 stands.

- [ ] **Step 5: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both PASS (no unused-import error for Figtree; Manrope resolves).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/layout.tsx frontend/src/aurora/aurora.css frontend/tests/aurora_assert.mjs
git commit -m "feat(tutor): Manrope reading sans on .aurora-chat (mono labels kept)"
```

---

## Task 3: Remove the seeded in-chat greeting

**Files:**
- Modify: `frontend/src/aurora/screens/Tutor.tsx`

- [ ] **Step 1: Delete `INITIAL_MESSAGES` and start the thread empty**

Remove the constant (currently lines 28-30):
```ts
const INITIAL_MESSAGES: Message[] = [
  { type: "ai", id: "1", content: "I'm here whenever you're ready. What would you like to think through today?" },
];
```

Change the `messages` initializer (currently line 41):
Old: `const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);`
New: `const [messages, setMessages] = useState<Message[]>([]);`

- [ ] **Step 2: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS. (The thread renders no bubbles until the user sends; `.aurora-chat-inner > :first-child { margin-top: auto }` handles the empty/first bubble. The landing is unaffected.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/screens/Tutor.tsx
git commit -m "feat(tutor): drop seeded AI greeting — first bubble is the user's message"
```

---

## Task 4: Real recent sessions — persist, list (past 3), reopen

**Files:**
- Modify: `frontend/src/aurora/screens/Tutor.tsx`
- Modify: `frontend/src/aurora/components/TutorLanding.tsx`
- Modify: `frontend/tests/aurora_assert.mjs` (empty-state assert)

- [ ] **Step 1: Rewrite `TutorLanding.tsx` to render real session cards (past 3), no STARTERS**

Replace the whole file with:

```tsx
"use client";
/* TutorLanding — the tutor's greeting home. Shown as the empty state of /chat: an
   ever-changing hello opener + cheeky sub (learning humour), a big centred prompt, and
   the student's real recent tutor conversations (localStorage) to reopen. Submitting or
   reopening a session cross-fades into the live chat thread — the constellation canvas
   behind everything is shared, so the transition reads as one continuous surface. */
import { pickTutorGreeting } from "@/aurora/lib/tutorGreeting";
import type { StoredSession } from "@/aurora/lib/tutorSessions";
import Link from "next/link";
import { Icon } from "@/aurora/icons";
import { Composer } from "@/aurora/components/Composer";
import { CoBrand } from "@/aurora/components/CoBrand";

function ago(ts: number): string {
  const d = Date.now() - ts;
  if (!Number.isFinite(d) || d < 0) return "";
  const m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function TutorLanding({
  firstName, input, onChange, onSend, disabled, sessions, onResume, openerSeed, subSeed, leaving = false,
}: {
  firstName: string;
  input: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  sessions: StoredSession[];
  onResume: (s: StoredSession) => void;
  openerSeed: number;
  subSeed: number;
  leaving?: boolean;
}) {
  // Hello opener + cheeky sub both come from the pure engine, chosen by seeds the parent
  // (Tutor) rotates per visit with no immediate repeats. 0/0 on first render is stable.
  const greeting = pickTutorGreeting(openerSeed, subSeed);
  const recent = sessions.slice(0, 3);

  return (
    <div className="tutor-landing" data-testid="tutor-landing" data-leaving={leaving || undefined}>
      <div className="tl-top">
        <Link href="/dashboard" className="aurora-chat-back" aria-label="Back to dashboard">
          <Icon.back size={24} />
        </Link>
        {/* Complete the EyeBot + SNEC lockup on the immersive Tutor's landing — the rail
            that normally carries it is hidden here (Branding lock, ricoe §6.6 / E2). */}
        <CoBrand className="tl-cobrand" />
      </div>

      <div className="tl-hero">
        {/* Selena greets — the SAME iris.png mascot as Home (default look only; ricoe A3).
            Workstream B swaps this <img> for the dancing Veo loop. */}
        <div className="tl-iriswrap" aria-hidden>
          <span className="tl-irisfloor" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tl-iris" src="/brand/iris.png" alt="" width={216} height={216} />
        </div>
        <h1 className="tl-hello">{greeting.before}<em>{firstName}</em>{greeting.after}</h1>
        <p className="tl-sub">{greeting.sub}</p>
        <div className="tl-prompt">
          <Composer value={input} onChange={onChange} onSend={onSend} disabled={disabled}
            placeholder="Ask EyeBot anything…" />
        </div>
      </div>

      {recent.length > 0 && (
        <div className="tl-recent">
          <h2 className="tl-recent-h">Pick up where you left off</h2>
          <div className="tl-cards">
            {recent.map((s) => (
              <button key={s.id} type="button" className="tl-card" onClick={() => onResume(s)}>
                <span className="tl-card-topic">{s.topic}</span>
                {s.preview && <span className="tl-card-sum">{s.preview}</span>}
                <span className="tl-card-foot">
                  <span className="tl-card-when">{ago(s.updatedAt)}</span>
                  <span className="tl-card-go">Resume →</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

(Removes: `RecentSession` interface, `STARTERS`, `prettyTopic`, `modeMeta`, the string-`ago`, `onStarter`, and the empty-state fallback branch.)

- [ ] **Step 2: Wire persistence + reopen into `Tutor.tsx`**

**2a. Imports** — replace the `TutorLanding`/`useProgress` imports (currently lines 19, 22):

Old:
```ts
import { TutorLanding, type RecentSession } from "@/aurora/components/TutorLanding";
```
New:
```ts
import { TutorLanding } from "@/aurora/components/TutorLanding";
import {
  loadSessions, saveSessions, upsertSession, recentSessions,
  deriveTopic, derivePreview, type StoredSession, type StoredMessage,
} from "@/aurora/lib/tutorSessions";
```
Delete the `useProgress` import (currently line 22): `import { useProgress } from "@/hooks/useProgress";`

**2b. Remove the progress hook usage** — delete (currently line 50): `const { data: progress } = useProgress();`

**2c. Add session state + a persist helper + the recent-sessions read.** Immediately after `const firstName = …` (currently line 51), add:

```ts
  const userId = user?.studentId || user?.email || "_";
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [recent, setRecent] = useState<StoredSession[]>([]);
  // Load this student's recent conversations for the landing (client-only).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setRecent(recentSessions(loadSessions(userId, window.localStorage), 3));
  }, [userId]);

  // Persist the full thread (normalized) to localStorage under `sid`, upserting to the front.
  const persistThread = (thread: Message[], sid: string) => {
    if (typeof window === "undefined") return;
    const stored: StoredMessage[] = thread.map((m) =>
      m.type === "ai" ? { type: "ai", id: m.id, text: m.content } : { type: "user", id: m.id, text: m.text });
    const now = Date.now();
    const existing = loadSessions(userId, window.localStorage);
    const prior = existing.find((s) => s.id === sid);
    const session: StoredSession = {
      id: sid,
      startedAt: prior?.startedAt ?? now,
      updatedAt: now,
      topic: deriveTopic(stored),
      preview: derivePreview(stored),
      messages: stored,
    };
    saveSessions(userId, upsertSession(existing, session), window.localStorage);
  };
```

**2d. Rewrite `resumeSession`** (currently lines 76-77) to restore the real thread and stop calling the old summary-seed path:

Old:
```ts
  const resumeSession = (s: RecentSession) =>
    startWith(`Let's pick up where I left off on ${s.topic}.${s.summary ? ` Earlier: ${s.summary}` : ""} Can we go a bit deeper?`);
```
New:
```ts
  const resumeSession = (s: StoredSession) => {
    const restored: Message[] = s.messages.map((m) =>
      m.type === "ai" ? { type: "ai", id: m.id, content: m.text } : { type: "user", id: m.id, text: m.text });
    setMessages(restored);
    setActiveSessionId(s.id);
    setPhase("chat");
  };
```

**2e. Delete the now-unused `startWith`** (currently line 75): `const startWith = (text: string) => { … };`
(Only `resumeSession` and the removed `onStarter` used it; both are gone. `startFromLanding` stays.)

**2f. Mint the session id + persist inside `sendMessage`.** In `sendMessage` (currently starts line 99), after the guard and building `userMsg` (currently lines 100-103), insert the session id and the first persist. Change this region:

Old:
```ts
    const text = (override ?? input).trim();
    if (!text || isTyping || streamingId) return;
    const userMsg: UserMessage = { type: "user", id: Date.now().toString(), text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
```
New:
```ts
    const text = (override ?? input).trim();
    if (!text || isTyping || streamingId) return;
    const sid = activeSessionId ?? `sess-${Date.now()}`;
    if (!activeSessionId) setActiveSessionId(sid);
    const userMsg: UserMessage = { type: "user", id: Date.now().toString(), text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    // Persist immediately so the session appears even if the user leaves before a reply.
    persistThread(messages.concat(userMsg), sid);
```

**2g. Accumulate the assistant reply and persist on completion.** Add an accumulator before the `try` (currently line 125, `const aiMsgId = …`):

After:
```ts
    const aiMsgId = `ai-${Date.now() + 1}`;
```
add:
```ts
    let aiContent = "";
```

Inside the SSE chunk handler, where `parsed.text` is appended to state (currently lines 154-161), also grow the accumulator. Change:

Old:
```ts
            if (parsed.text) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last.type === "ai" && last.id === aiMsgId)
                  return [...prev.slice(0, -1), { ...last, content: last.content + parsed.text }];
                return prev;
              });
            }
```
New:
```ts
            if (parsed.text) {
              aiContent += parsed.text;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last.type === "ai" && last.id === aiMsgId)
                  return [...prev.slice(0, -1), { ...last, content: last.content + parsed.text }];
                return prev;
              });
            }
```

After the streaming `while` loop closes successfully — i.e. right after the `while (true) { … }` block ends (currently just before the closing brace of the `try`, after line 164) — persist the completed thread:

```ts
      persistThread(messages.concat(userMsg, { type: "ai", id: aiMsgId, content: aiContent }), sid);
```

In the `catch` block (currently lines 165-171), after the `setMessages(...)` that writes `FALLBACK_CONTENT`, persist the fallback thread so a failed turn is still recorded:

```ts
      persistThread(messages.concat(userMsg, { type: "ai", id: aiMsgId, content: FALLBACK_CONTENT }), sid);
```

(Both use the closure `messages` = thread before this turn, which is correct: first turn `[] → [user, ai]`; later turns include the prior thread.)

**2h. Feed the landing from localStorage + drop the removed props.** In the `<TutorLanding …>` JSX (currently lines 188-200), change `sessions` and remove `onStarter`:

Old:
```tsx
          sessions={(progress?.sessions ?? []) as RecentSession[]}
          onResume={resumeSession}
          onStarter={startWith}
```
New:
```tsx
          sessions={recent}
          onResume={resumeSession}
```

- [ ] **Step 3: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS. If TS flags an unused `SUGGESTIONS`/`StoredMessage`/etc., confirm each is used (`StoredMessage` is used in `persistThread`; `SUGGESTIONS` is still used by the in-chat followups). Resolve any genuinely-unused symbol left by the edits.

- [ ] **Step 4: Add an empty-state harness assertion (no STARTERS fallback)**

In `frontend/tests/aurora_assert.mjs`, immediately AFTER the Manrope font-gate line (the `if (!/manrope/i.test(tlFont)) …` from Task 2 Step 3), add:

```js
// Recent sessions are real localStorage conversations now — with none seeded (harness),
// the landing shows NOTHING there (no hardcoded starter pills, no empty-state cards).
if ((await np.locator('[data-testid="tutor-landing"] .tl-starter').count()) !== 0) {
  console.error("FAIL: tutor landing still renders hardcoded STARTERS"); process.exit(1);
}
```

- [ ] **Step 5: Behavioral verify on the running app (reopen restores the full thread)**

Start the dev API + frontend (or use the harness standalone server), then in a browser / Playwright drive `/chat`:
1. Type a message, send, wait for a reply.
2. Navigate back to `/chat` (remount the landing).
3. Confirm a real card appears titled with your first message + a preview of the reply.
4. Click it → the FULL prior thread renders (your message + the reply), and it's continuable.
5. Send another message in the reopened chat → returning to the landing shows the SAME card (not a duplicate), moved to the top with an updated preview.

Record the observation. (This exercises the state invariant behaviorally, complementing the Task 1 unit test — required by /ship-check.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/screens/Tutor.tsx frontend/src/aurora/components/TutorLanding.tsx frontend/tests/aurora_assert.mjs
git commit -m "feat(tutor): real reopenable localStorage sessions (past 3), drop STARTERS"
```

---

## Task 5: Fast motion-gradient greeting name

**Files:**
- Modify: `frontend/src/aurora/aurora.css`

- [ ] **Step 1: Animate the name gradient**

Replace the static gradient rule (currently lines 1635-1636):

Old:
```css
.tl-hello em { font-style: normal; background: linear-gradient(100deg, #4285F4, #9B72F6 48%, #EC4899);
  -webkit-background-clip: text; background-clip: text; color: transparent; }
```
New:
```css
.tl-hello em { font-style: normal;
  background: linear-gradient(100deg, #4285F4, #9B72F6 28%, #EC4899 50%, #9B72F6 72%, #4285F4);
  background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: tl-name-flow 1.2s linear infinite; }
@keyframes tl-name-flow { to { background-position: -300% 0; } }
/* Freeze the name gradient under reduced motion (app toggle + OS preference). */
html[data-motion="reduce"] .tl-hello em { animation: none; background-position: 0 0; }
@media (prefers-reduced-motion: reduce) { .tl-hello em { animation: none; background-position: 0 0; } }
```

(The gradient starts and ends on `#4285F4`, so scrolling 300% loops seamlessly.)

- [ ] **Step 2: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "feat(tutor): fast motion-gradient greeting name (reduced-motion safe)"
```

---

## Task 6: Sizing — bigger greeting + chatbox, smaller recent cards

**Files:**
- Modify: `frontend/src/aurora/aurora.css`

- [ ] **Step 1: Enlarge the hero (greeting + sub + chatbox)**

Replace the hero type + prompt rules. Change `.tl-hello` (currently line 1633-1634):

Old:
```css
.tl-hello { font-family: inherit; font-size: clamp(34px, 5.2vw, 58px); font-weight: 700; letter-spacing: -0.03em;
  line-height: 1.05; margin: 0; color: var(--mono-ink); }
```
New:
```css
.tl-hello { font-family: inherit; font-size: clamp(40px, 6.2vw, 74px); font-weight: 700; letter-spacing: -0.03em;
  line-height: 1.04; margin: 0; color: var(--mono-ink); }
```

Change `.tl-sub` (currently line 1637):

Old:
```css
.tl-sub { margin: 14px 0 0; font-size: clamp(15px, 1.7vw, 19px); color: var(--mono-ink-2); font-weight: 500; }
```
New:
```css
.tl-sub { margin: 16px 0 0; font-size: clamp(16px, 1.9vw, 21px); color: var(--mono-ink-2); font-weight: 500; }
```

Change the prompt block (currently lines 1638-1641):

Old:
```css
.tl-prompt { width: min(680px, 100%); margin: 26px auto 0; }
.tl-prompt .aurora-composer { border-radius: 22px; padding: 10px 10px 10px 20px; min-height: 62px; align-items: center;
  box-shadow: 0 18px 44px -22px rgba(60, 60, 120, 0.4); }
.tl-prompt .aurora-composer-field { font-size: 16.5px; }
```
New:
```css
.tl-prompt { width: min(760px, 100%); margin: 30px auto 0; }
.tl-prompt .aurora-composer { border-radius: 24px; padding: 12px 12px 12px 22px; min-height: 70px; align-items: center;
  box-shadow: 0 18px 44px -22px rgba(60, 60, 120, 0.4); }
.tl-prompt .aurora-composer-field { font-size: 18px; }
```

- [ ] **Step 2: Shrink + calm the recent-sessions block**

Change `.tl-recent` (currently line 1645):

Old:
```css
.tl-recent { flex: 1 1 auto; width: min(1100px, 100%); margin: 0 auto; padding: 8px 0 40px; }
```
New:
```css
.tl-recent { flex: 1 1 auto; width: min(760px, 100%); margin: 0 auto; padding: 4px 0 40px; }
```

Change `.tl-recent-h` (currently line 1646):

Old:
```css
.tl-recent-h { font-size: 15px; font-weight: 700; color: var(--mono-ink-2); letter-spacing: -0.01em; margin: 0 0 14px; }
```
New:
```css
.tl-recent-h { font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--mono-ink-3); margin: 0 0 10px; }
```

Change `.tl-cards` (currently line 1647):

Old:
```css
.tl-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(212px, 1fr)); gap: 14px; }
```
New:
```css
.tl-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
```

Change `.tl-card` (currently lines 1648-1651):

Old:
```css
.tl-card { display: flex; flex-direction: column; gap: 7px; align-items: flex-start; text-align: left;
  padding: 16px 16px 14px; border-radius: 18px; background: var(--mono-card); border: 1px solid var(--mono-line);
  cursor: pointer; box-shadow: 0 1px 2px rgba(20, 20, 40, 0.04);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s; }
```
New:
```css
.tl-card { display: flex; flex-direction: column; gap: 5px; align-items: flex-start; text-align: left;
  padding: 12px 13px 11px; border-radius: 14px; background: var(--mono-card); border: 1px solid var(--mono-line);
  cursor: pointer; box-shadow: 0 1px 2px rgba(20, 20, 40, 0.04);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s; }
```

Change `.tl-card-topic` and `.tl-card-sum` (currently lines 1657-1659):

Old:
```css
.tl-card-topic { font-weight: 700; font-size: 15.5px; color: var(--mono-ink); letter-spacing: -0.01em; }
.tl-card-sum { font-size: 13px; color: var(--mono-ink-2); line-height: 1.4; display: -webkit-box;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
```
New:
```css
.tl-card-topic { font-weight: 700; font-size: 13.5px; color: var(--mono-ink); letter-spacing: -0.01em;
  display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.tl-card-sum { font-size: 12px; color: var(--mono-ink-2); line-height: 1.4; display: -webkit-box;
  -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
```

Change `.tl-card-when` (currently line 1661):

Old:
```css
.tl-card-when { font-size: 11.5px; color: var(--mono-ink-3); font-weight: 600; }
```
New:
```css
.tl-card-when { font-size: 11px; color: var(--mono-ink-3); font-weight: 600; }
```

- [ ] **Step 3: Remove the now-orphaned tag + starter CSS**

Task 4 removed the mode tags (`.tl-card-tag*`) and the `.tl-starter*` pills from the markup. Delete their rules (currently lines 1653-1656 and 1665-1668):

```css
.tl-card-tag { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 4px 9px; border-radius: 999px; }
.tl-card-tag.tutor { color: #5B5BFF; background: rgba(91, 91, 255, 0.1); }
.tl-card-tag.case { color: #0C8F7E; background: rgba(18, 181, 160, 0.12); }
.tl-card-tag.flash { color: #C2410C; background: rgba(251, 146, 60, 0.14); }
```
```css
.tl-starters { display: flex; flex-wrap: wrap; gap: 10px; }
.tl-starter { padding: 10px 16px; border-radius: 999px; border: 1px solid var(--mono-line); background: var(--mono-card);
  font-size: 14px; font-weight: 600; color: var(--mono-ink); cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
.tl-starter:hover { border-color: rgba(91, 91, 255, 0.5); transform: translateY(-2px); }
```

(Leave `.tl-starters`? No — both `.tl-starters` and `.tl-starter*` are orphaned; remove all four lines. Keep `.tl-card-foot`, `.tl-card-when`, `.tl-card-go` — still used.)

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "feat(tutor): larger greeting + chatbox, smaller recent cards; drop orphaned CSS"
```

---

## Task 7: Docs + full green gate + push Workstream A

**Files:**
- Modify: `docs/design-locks.md`

- [ ] **Step 1: Refine the tutor design lock**

Open `docs/design-locks.md`, find the tutor "Mono + Electric / Live Wire" lock. Append a refinement note (match the file's existing entry style) naming the criteria changed:

```
- 2026-07-11 refinement (within the Mono+Electric lock): reading sans Figtree → **Manrope**
  (mono accent labels unchanged); the greeting **name** is a fast motion-gradient (frozen
  under reduced motion); recent sessions are **real reopenable localStorage conversations**
  (past 3; nothing shown when empty — STARTERS removed); no seeded in-chat AI greeting
  (first bubble is the user's); greeting + chatbox enlarged, recent cards shrunk. The
  landing mascot becomes a brand-new dancing-Iris Veo loop (Workstream B) with iris.png as
  the poster/fallback.
```

- [ ] **Step 2: Frontend unit tests green**

Run:
```
node --experimental-strip-types frontend/tests/tutor_sessions_assert.mjs
node --experimental-strip-types frontend/tests/tutor_greeting_assert.mjs
```
Expected: `PASS: tutor sessions store` and `PASS: tutor greeting engine`.

- [ ] **Step 3: Typecheck + build green**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both PASS.

- [ ] **Step 4: Aurora harness — tutor block green**

Build + serve the standalone harness server and run the assert against the warm server (per the harness recipe / `/harness` skill):
```
bash scripts/start-harness.sh aurora
```
or, against an already-warm server:
```
node frontend/tests/aurora_assert.mjs http://127.0.0.1:3000
```
Expected: the output contains `PASS: Tutor greeting landing …` and NO `FAIL: Tutor …` line (the Manrope gate + empty-state assert pass). The run may still exit 1 later at the PRE-EXISTING flashcards-D2 back-face red — confirm that failure is the same one present on `main` before this work (baseline it first if unsure) and is unrelated to the tutor.

- [ ] **Step 5: Backend tests unaffected (sanity)**

Run: `python -m pytest -q`
Expected: PASS (no backend files changed in Workstream A; this guards against accidental breakage).

- [ ] **Step 6: Commit docs + push Workstream A to main**

```bash
git add docs/design-locks.md
git commit -m "docs(tutor): refine Mono+Electric lock — Manrope, motion name, real sessions"
git push origin main
```
(Workstream A is now green on prod. `main` auto-deploys to Render.)

---

# WORKSTREAM B — Dancing Iris mascot (paid Veo loop)

## Task B1: Frontend scaffold — video mascot with iris.png fallback (green, keyless)

**Files:**
- Modify: `frontend/src/aurora/components/TutorLanding.tsx`
- Modify: `frontend/src/aurora/aurora.css`
- Modify: `frontend/tests/aurora_assert.mjs`

- [ ] **Step 1: Swap the `.tl-iris` `<img>` for a `<video>` with poster fallback**

In `TutorLanding.tsx`, add a video ref + reduced-motion-safe autoplay effect. Add to the imports at the top:

```tsx
import { useEffect, useRef } from "react";
```

Inside `TutorLanding`, before the `return`, add:

```tsx
  const vidRef = useRef<HTMLVideoElement>(null);
  // Autoplay the dance only when motion is allowed; otherwise the poster (iris.png) shows.
  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    const reduce = typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) void v.play().catch(() => {});
  }, []);
```

Replace the mascot markup (the `.tl-iriswrap` block) with:

```tsx
        <div className="tl-iriswrap" aria-hidden>
          <span className="tl-irisfloor" />
          {/* Brand-new dancing Iris (Veo loop). iris.png is the poster + fallback, so the
              landing renders identically with no clip (keyless/harness) or reduced motion. */}
          <video ref={vidRef} className="tl-iris" poster="/brand/iris.png"
            loop muted playsInline preload="metadata" width={216} height={216}>
            <source src="/media/loops/tutor-mascot.mp4" type="video/mp4" />
          </video>
        </div>
```

(No `autoPlay` attribute — the effect starts playback only when motion is allowed.)

- [ ] **Step 2: Style the rounded mascot stage**

In `aurora.css`, replace the `.tl-iris` rule + its wave keyframes + the two `.tl-iris` reduced-motion rules (currently lines 1617-1632):

Old:
```css
.tl-iris { position: relative; width: 216px; height: 216px; transform-origin: 50% 92%;
  animation: tl-iris-wave 3.6s ease-in-out infinite; }
@keyframes tl-iris-wave {
  0%   { transform: translateY(0) rotate(-1deg); }
  14%  { transform: translateY(-7px) rotate(1.5deg); }
  27%  { transform: translateY(0) rotate(-1deg); }
  35%  { transform: translateY(-3px) rotate(9deg); }
  43%  { transform: translateY(-3px) rotate(-5deg); }
  51%  { transform: translateY(-3px) rotate(9deg); }
  59%  { transform: translateY(-3px) rotate(-4deg); }
  67%  { transform: translateY(0) rotate(-1deg); }
  83%  { transform: translateY(-7px) rotate(1.5deg); }
  100% { transform: translateY(0) rotate(-1deg); }
}
@media (prefers-reduced-motion: reduce) { .tl-iris { animation: none; } }
html[data-motion="reduce"] .tl-iris { animation: none; }
```
New:
```css
/* Dancing Iris video sits in a soft rounded "stage" (the Veo clip bakes an ivory spotlight,
   so this disc blends into the tutor surface). object-fit: cover center-crops whatever
   aspect the clip ships at. iris.png poster shows with no clip / under reduced motion. */
.tl-iris { position: relative; display: block; width: 216px; height: 216px;
  border-radius: 32px; overflow: hidden; object-fit: cover; object-position: 50% 50%;
  background: #F2F0E8; }
```

- [ ] **Step 3: Update the harness mascot assertions**

In `frontend/tests/aurora_assert.mjs`, the tutor mascot block (currently lines 206-213) asserts an `<img>` src + the `tl-iris-wave` animation. Replace that block:

Old:
```js
// A waving Selena greets above the hello (Branding lock, 2026-07-06) — the SAME iris.png
// mascot as the Home greeting card (identical look, per Caleb), running the wave animation.
const iris = np.locator('[data-testid="tutor-landing"] .tl-iris');
if ((await iris.count()) < 1) { console.error("FAIL: waving Selena greeter missing on the Tutor landing"); process.exit(1); }
const irisSrc = (await iris.getAttribute("src")) ?? "";
if (!/\/brand\/iris\.png/.test(irisSrc)) { console.error(`FAIL: Tutor mascot is not the homepage iris.png (src=${irisSrc})`); process.exit(1); }
const waveAnim = await iris.evaluate((el) => getComputedStyle(el).animationName).catch(() => "");
if (waveAnim !== "tl-iris-wave") { console.error(`FAIL: Selena not waving (animationName=${waveAnim})`); process.exit(1); }
```
New:
```js
// Dancing Iris greets above the hello (Branding lock) — a Veo <video> anchored to the
// homepage iris.png as its poster/fallback (no clip needed keyless: the poster renders).
const iris = np.locator('[data-testid="tutor-landing"] .tl-iris');
if ((await iris.count()) < 1) { console.error("FAIL: Iris mascot missing on the Tutor landing"); process.exit(1); }
const irisPoster = (await iris.getAttribute("poster")) ?? (await iris.getAttribute("src")) ?? "";
if (!/\/brand\/iris\.png/.test(irisPoster)) { console.error(`FAIL: Tutor mascot not anchored to iris.png (poster=${irisPoster})`); process.exit(1); }
```

(Also update the PASS log at line 220 wording from "waving Selena" to "dancing Iris" if desired — optional.)

- [ ] **Step 4: Typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 5: Harness — tutor block still green (poster fallback)**

Run the harness assert (warm server) as in Task 7 Step 4.
Expected: `PASS: Tutor greeting landing …`, no `FAIL: Tutor …` — the `<video>` has no `/media/loops/tutor-mascot.mp4` yet, so the `iris.png` poster renders and the anchor assertion passes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/aurora/components/TutorLanding.tsx frontend/src/aurora/aurora.css frontend/tests/aurora_assert.mjs
git commit -m "feat(tutor): mascot <video> stage with iris.png poster fallback (clip TBD)"
```

---

## Task B2: Veo tutor-mascot generation tool (no paid call yet)

**Files:**
- Create: `tools/media/tutor_mascot.py`
- Create: `tools/media/generate_tutor_mascot.py`

Pattern-match the existing `tools/media/greeting_loop.py` + `tools/media/generate_greeting_loop.py` (probe/estimate/generate/install; `generate_videos` with `last_frame == first_frame`; `MOCK_MODE` refusal). The only differences: a **square-ish** conditioning frame with the mascot centered on an **ivory spotlight** (not Home's landscape warm gradient), a **fast-dance** prompt, and a dest of `frontend/public/media/loops/tutor-mascot.{mp4,jpg}`.

- [ ] **Step 1: Write the config**

Create `tools/media/tutor_mascot.py`:

```python
"""Veo tutor-mascot config — image-to-video from iris.png (PAID, gated).

A brand-new, tutor-ONLY dancing Iris loop for the /chat landing: cute, funny,
ridiculous, FAST — distinct from Home's calm greeting loop. Veo can't emit alpha,
so the conditioning frame bakes a soft IVORY spotlight matching the tutor surface
(.aurora-chat), and the clip is shown in a rounded stage (object-fit: cover). The
exact Veo model id is confirmed by the capability probe (varies by key).
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IMAGE_REF = ROOT / "frontend" / "public" / "brand" / "iris.png"

PROMPT = (
    "Seamless looping animation of this one-eyed teal-and-cream EyeBot mascot doing a "
    "goofy, adorable, ridiculous FAST little dance, centered in frame: it bounces and "
    "wiggles with springy squash-and-stretch, does a quick spin and a playful bop, its "
    "single eye blinking cheekily — exaggerated bouncy cartoon energy, high tempo, always "
    "staying centered and fully in frame. The final frame is identical to the first for a "
    "perfect loop. Soft warm studio lighting on a calm ivory spotlight background. No "
    "camera movement, no zoom, no pan, no text, no extra characters."
)

# candidate model ids to probe, best-first (confirm live before spending)
CANDIDATE_MODELS = (
    "veo-3.1-fast-generate-preview",
    "veo-3.0-fast-generate-001",
    "veo-3.0-generate-001",
)

# Known-good aspect on this key (greeting loop shipped 16:9); the square stage
# center-crops via object-fit: cover. Switch to "9:16" after review if the crop is tight.
ASPECT = "16:9"
```

- [ ] **Step 2: Write the generator**

Create `tools/media/generate_tutor_mascot.py` (mirrors `generate_greeting_loop.py`, with a centered ivory-spotlight frame + tutor dest):

```python
#!/usr/bin/env python3
"""Veo tutor-mascot loop — PAID, go-ahead-gated. Image-to-video from iris.png.

Heavily gated like the greeting loop: --probe (cheap) and --estimate (no calls)
first; --generate spends; --install copies the reviewed clip into the web app.
Refuses in MOCK_MODE.

Usage:
    python tools/media/generate_tutor_mascot.py --probe
    python tools/media/generate_tutor_mascot.py --estimate
    python tools/media/generate_tutor_mascot.py --generate --model <id>
    python tools/media/generate_tutor_mascot.py --install
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.media.tutor_mascot import ASPECT, CANDIDATE_MODELS, IMAGE_REF, PROMPT
from tools.shared.gemini_client import MOCK_MODE, _API_KEYS

ROOT = Path(__file__).resolve().parents[2]
TMP = ROOT / ".tmp" / "tutor-mascot"
DEST = ROOT / "frontend" / "public" / "media" / "loops"


def _client():
    from google import genai
    return genai.Client(api_key=_API_KEYS[0])


def run_probe() -> int:
    if MOCK_MODE:
        print("MOCK_MODE — cannot probe; candidates:", ", ".join(CANDIDATE_MODELS))
        return 2
    c = _client()
    hits = [m.name for m in c.models.list() if "veo" in (m.name or "").lower()]
    print("Veo models on this key:", hits or "(none found)")
    return 0 if hits else 1


def _build_frame() -> Path:
    """Center the transparent iris.png on a soft ivory spotlight (matches .aurora-chat),
    16:9 with the mascot CENTERED and generous margin so a square center-crop always
    contains the dance. This is the conditioning first/last frame (and the poster)."""
    from PIL import Image, ImageFilter

    W, H = 1280, 720
    canvas = (0xF2, 0xF0, 0xE8)   # tutor ivory (.aurora-chat gradient top)
    edge = (0xEB, 0xE9, 0xE0)     # tutor ivory (gradient bottom)

    def _mix(a, b, t):
        return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

    GW, GH = 192, 108
    cx, cy = 0.5 * GW, 0.42 * GH      # spotlight centred, a touch high
    rx, ry = 0.62 * GW, 0.72 * GH
    small = Image.new("RGB", (GW, GH))
    sp = small.load()
    for y in range(GH):
        for x in range(GW):
            d = (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) ** 0.5
            sp[x, y] = _mix(canvas, edge, min(1.0, d))
    bg = small.resize((W, H), Image.LANCZOS).convert("RGBA")

    mascot = Image.open(IMAGE_REF).convert("RGBA")
    target_h = int(H * 0.62)
    scale = target_h / mascot.height
    m = mascot.resize((round(mascot.width * scale), target_h), Image.LANCZOS)
    mx = W // 2 - m.width // 2
    my = int(H * 0.52) - m.height // 2
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = Image.new("RGBA", (int(m.width * 0.8), 48), (70, 40, 22, 80))
    shadow.paste(sd, (mx + (m.width - sd.width) // 2, my + m.height - 22), sd)
    shadow = shadow.filter(ImageFilter.GaussianBlur(15))
    bg.alpha_composite(shadow)
    bg.alpha_composite(m, (mx, my))

    TMP.mkdir(parents=True, exist_ok=True)
    frame = TMP / "tutor-frame.jpg"
    bg.convert("RGB").save(frame, "JPEG", quality=92)
    bg.convert("RGB").save(TMP / "tutor-mascot.jpg", "JPEG", quality=88)  # poster
    print(f"  built conditioning frame {frame} ({W}x{H}, mascot centred)")
    return frame


def run_generate(model: str) -> int:
    if MOCK_MODE:
        print("ERROR: MOCK_MODE — no key.", file=sys.stderr)
        return 2
    from google.genai import types

    c = _client()
    frame_path = _build_frame()
    first = types.Image.from_file(location=str(frame_path))
    cfg = dict(
        number_of_videos=1,
        aspect_ratio=ASPECT,
        negative_prompt="text, letters, watermark, logo, extra characters, camera movement, "
        "zoom, pan, morphing, distortion, flicker, mascot leaving frame",
    )
    print(f"submitting {model} (image-to-video, seamless first==last)…")
    try:
        op = c.models.generate_videos(
            model=model, prompt=PROMPT, image=first,
            config=types.GenerateVideosConfig(last_frame=first, **cfg),
        )
    except Exception as e:  # noqa: BLE001 — submission failed = not billed; fall back
        print(f"  last_frame rejected ({type(e).__name__}: {str(e)[:120]}); retrying without it…")
        op = c.models.generate_videos(
            model=model, prompt=PROMPT, image=first, config=types.GenerateVideosConfig(**cfg),
        )
    print("  submitted; polling …")
    while not op.done:
        time.sleep(10)
        op = c.operations.get(op)
    if op.error:
        print(f"  generation FAILED: {op.error}", file=sys.stderr)
        return 1
    resp = op.response or op.result
    vids = getattr(resp, "generated_videos", None) or []
    if not vids:
        print(f"  no video returned (filtered? {getattr(resp, 'rai_media_filtered_reasons', None)})", file=sys.stderr)
        return 1
    c.files.download(file=vids[0].video)
    out = TMP / "tutor-mascot.mp4"
    vids[0].video.save(str(out))
    print(f"saved {out} ({out.stat().st_size:,} bytes) + poster tutor-mascot.jpg — review before --install")
    return 0


def run_install() -> int:
    src = TMP / "tutor-mascot.mp4"
    if not src.exists():
        print(f"missing {src} (run --generate)", file=sys.stderr)
        return 1
    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "tutor-mascot.mp4").write_bytes(src.read_bytes())
    poster = TMP / "tutor-mascot.jpg"
    if poster.exists():
        (DEST / "tutor-mascot.jpg").write_bytes(poster.read_bytes())
    print("installed tutor-mascot.mp4 (+ poster) to frontend/public/media/loops/")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--estimate", action="store_true")
    ap.add_argument("--generate", action="store_true")
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--model", default=CANDIDATE_MODELS[0])
    a = ap.parse_args()
    if a.probe:
        return run_probe()
    if a.install:
        return run_install()
    if a.generate:
        return run_generate(a.model)
    print("ESTIMATE — 1 Veo clip, image=iris.png, aspect", ASPECT, ", model (default):", a.model)
    print("Veo bills per second of video — CONFIRM current pricing before --generate.\n")
    print(PROMPT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2b: Verify the frame builder works keyless (no paid call)**

Run: `python -c "import sys; sys.argv=['x']; from tools.media.generate_tutor_mascot import _build_frame; print(_build_frame())"`
Expected: prints a path under `.tmp/tutor-mascot/tutor-frame.jpg` and the file exists (a centered Iris on ivory). This proves the PIL frame + iris.png ref resolve. (Open the jpg to eyeball the composition.)

- [ ] **Step 3: Verify `--estimate` runs keyless**

Run (MOCK is auto when `GEMINI_API_KEY` unset): `python tools/media/generate_tutor_mascot.py --estimate`
Expected: prints the ESTIMATE header + the dance PROMPT, exit 0, NO network call.

- [ ] **Step 4: Backend tests still green**

Run: `python -m pytest -q`
Expected: PASS (new files are import-safe; nothing imported them into the suite).

- [ ] **Step 5: Commit**

```bash
git add tools/media/tutor_mascot.py tools/media/generate_tutor_mascot.py
git commit -m "feat(media): Veo tutor dancing-mascot generator (estimate/probe/generate/install)"
```

---

## Task B3: PAID Veo generation → review → install → push (go-ahead required)

> **STOP — paid step.** This spends real Veo quota. The user has given go-ahead in principle; still show the clip and get explicit OK before `--install`. Requires `GEMINI_API_KEY` in `.env` (never commit it).

**Files:**
- Create (installed asset): `frontend/public/media/loops/tutor-mascot.{mp4,jpg}`

- [ ] **Step 1: Probe the key for a live Veo model**

Run: `python tools/media/generate_tutor_mascot.py --probe`
Expected: prints `Veo models on this key: [ … ]`. Pick the best available id (prefer the `CANDIDATE_MODELS` order). If none, STOP and report — the key lacks Veo access.

- [ ] **Step 2: Generate (PAID)**

Run: `python tools/media/generate_tutor_mascot.py --generate --model <confirmed-id>`
Expected: submits, polls, `saved …/.tmp/tutor-mascot/tutor-mascot.mp4 … + poster`. If it fails/filters, re-read the error; retry once with a different candidate model only with continued go-ahead.

- [ ] **Step 3: Review the clip with the user**

Open `.tmp/tutor-mascot/tutor-mascot.mp4`. Confirm: it's recognizably Iris, the dance is cute/funny/ridiculous/fast, it stays centered (survives the square crop), the ivory background blends, and the loop is seamless (first≈last). If the crop is tight or motion drifts, adjust `ASPECT` to `"9:16"` in `tutor_mascot.py` (or tune the PROMPT) and regenerate — **with go-ahead** (another paid call). Get explicit OK to install.

- [ ] **Step 4: Install**

Run: `python tools/media/generate_tutor_mascot.py --install`
Expected: `installed tutor-mascot.mp4 (+ poster) to frontend/public/media/loops/`.

- [ ] **Step 5: Verify in the running app**

Serve the app (dev or harness standalone) and open `/chat`. Confirm the mascot now DANCES (the `<video>` plays the installed loop), and that under reduced motion / with the file removed it falls back to the iris.png poster. Confirm the loop has no jarring seam.

- [ ] **Step 6: Green gate + push**

Run:
```
cd frontend && npm run typecheck && npm run build
node frontend/tests/aurora_assert.mjs http://127.0.0.1:3000   # tutor block green (poster asserts still hold)
```
Expected: PASS / `PASS: Tutor greeting landing …`.

```bash
git add frontend/public/media/loops/tutor-mascot.mp4 frontend/public/media/loops/tutor-mascot.jpg
git commit -m "feat(tutor): install dancing-Iris Veo mascot loop (paid, reviewed)"
git push origin main
```

---

## Self-review (author checklist — completed at plan-write time)

**Spec coverage:**
- Manrope (mono kept) → Task 2. ✓
- Real reopenable localStorage sessions, past 3, empty→nothing → Tasks 1 + 4. ✓
- Bigger greeting/chatbox, smaller cards → Task 6. ✓
- Fast motion-gradient name → Task 5. ✓
- Remove in-chat greeting → Task 3. ✓
- Dancing Iris Veo mascot (scaffold → tool → paid) → Tasks B1–B3. ✓
- Testing (TDD unit, harness gate, behavioral verify, ship-check) → Tasks 1, 4(Step 5), 7. ✓
- design-locks refinement → Task 7. ✓

**Type consistency:** `StoredSession`/`StoredMessage`/`KVStorage` defined in Task 1 are used identically in Tasks 4 (Tutor.tsx, TutorLanding.tsx). `persistThread`, `activeSessionId`, `recent`, `userId` introduced and consumed within Task 4. `aiContent` declared before the try and used in the loop + both persist sites. Harness `.tl-iris` poster assertion (B1) matches the `<video poster>` markup (B1). ✓

**Placeholder scan:** no TBD/TODO; every code step shows full code; commands have expected output. ✓
