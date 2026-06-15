# Socratic Tutor IG-DM Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the student Socratic Tutor (`/chat`) into a full-screen, Instagram-DM chat with a close-friend voice, a two-part (`💭` think + answer) reply format, and a tasteful CSS-only motion layer.

**Architecture:** Frontend is Next 16 (App Router, React 19, TS strict) in `frontend/`; motion is CSS-only (the MotionProvider is NOT mounted — GSAP fx wrappers crash). Backend is FastAPI in `tools/`; the tutor persona lives in one prompt string. The `/api/chat` SSE streaming contract, guardrails, RAG, and role focus are left untouched — only the prompt text and the chat UI change. A pure `parseReply` function splits the streamed reply into think/answer parts; the bubble renders them.

**Tech Stack:** Next.js 16.2.1, React 19.2, TypeScript 5, plain CSS (`aurora.css` + `motion.css`), FastAPI, Node 24.13 (runs `.ts` directly for the one unit test). No frontend unit-test runner exists — Playwright (`tests/visual_sweep.mjs`) is the visual harness.

**Spec:** `docs/superpowers/specs/2026-06-15-socratic-tutor-redesign-design.md`

**Commit/push policy:** Commit locally after each task (`git commit -F` here-doc — PowerShell mangles quoted messages). **Push once** at the end (Task 9) so `main` (which Render auto-deploys) does not deploy half-skinned intermediate states. Never commit `frontend/next-env.d.ts` (it auto-regenerates — `git checkout --` it). Commit trailer on every commit:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 1: `parseReply` — the two-part reply parser (pure function, TDD)

**Files:**
- Create: `frontend/src/aurora/lib/parseReply.ts`
- Test (temporary): `frontend/tests/_parsereply_check.ts`

- [ ] **Step 1: Write the failing test (temporary type-strip check)**

Create `frontend/tests/_parsereply_check.ts`:

```ts
import assert from "node:assert/strict";
import { parseReply } from "../src/aurora/lib/parseReply.ts";

// 1. plain greeting / non-teaching text → single answer bubble, no think
assert.deepEqual(parseReply("I'm here whenever you're ready."),
  { think: null, answer: "I'm here whenever you're ready." });

// 2. probe-only turn → think only, empty answer
assert.deepEqual(parseReply("💭 what muscle do you reckon is squeezing?"),
  { think: "what muscle do you reckon is squeezing?", answer: "" });

// 3. full two-part → think + answer
assert.deepEqual(parseReply("💭 good instinct — which muscle?\n\nit's the sphincter pupillae, the iris's circular muscle."),
  { think: "good instinct — which muscle?", answer: "it's the sphincter pupillae, the iris's circular muscle." });

// 4. mid-stream: lead still arriving, no blank line yet → think grows, no answer bubble
assert.deepEqual(parseReply("💭 good ins"),
  { think: "good ins", answer: "" });

// 5. mid-stream: blank line arrived but answer empty → still think only
assert.deepEqual(parseReply("💭 which muscle?\n\n"),
  { think: "which muscle?", answer: "" });

// 6. leading whitespace before the marker is tolerated
assert.deepEqual(parseReply("  💭 hint\n\nthe answer"),
  { think: "hint", answer: "the answer" });

console.log("parseReply: all cases passed");
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `frontend/`): `node --experimental-strip-types tests/_parsereply_check.ts`
Expected: FAIL — cannot resolve `../src/aurora/lib/parseReply.ts` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/src/aurora/lib/parseReply.ts`:

```ts
/* parseReply — split a streamed EyeBot reply into its two parts.
   Contract (see spec §4): a teaching reply starts with the literal 💭 marker +
   a space, then a short reflective lead; when the answer is given it follows after
   exactly one blank line. Plain/greeting/error text has no marker. Pure + streaming
   safe: call it on every render of the (possibly partial) streamed content. */
export interface ParsedReply {
  think: string | null;
  answer: string;
}

const THINK_MARKER = "💭";

function stripMarker(s: string): string {
  return s.replace(/^\s*💭\s*/, "");
}

export function parseReply(content: string): ParsedReply {
  const text = typeof content === "string" ? content : String(content ?? "");
  if (!text.trimStart().startsWith(THINK_MARKER)) {
    return { think: null, answer: text };
  }
  const sep = text.indexOf("\n\n");
  if (sep === -1) {
    return { think: stripMarker(text).trimEnd(), answer: "" };
  }
  return {
    think: stripMarker(text.slice(0, sep)).trim(),
    answer: text.slice(sep + 2).trim(),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (from `frontend/`): `node --experimental-strip-types tests/_parsereply_check.ts`
Expected: PASS — prints `parseReply: all cases passed`.
(If the engine ever rejects importing `.ts`, rerun with `node --experimental-transform-types tests/_parsereply_check.ts`.)

- [ ] **Step 5: Delete the temporary test, then commit the module**

The repo has no committed unit-test runner; this check is throwaway (the visual sweep is the durable harness). Delete it so it isn't committed:

```bash
rm frontend/tests/_parsereply_check.ts
git add frontend/src/aurora/lib/parseReply.ts
git commit -F - <<'EOF'
feat(tutor): parseReply — split streamed reply into 💭 think + answer

Pure, streaming-safe parser for the two-part tutor reply contract.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 2: `MessageBubble` — two-part IG render

**Files:**
- Modify (full rewrite): `frontend/src/aurora/components/MessageBubble.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `frontend/src/aurora/components/MessageBubble.tsx`:

```tsx
"use client";
/* MessageBubble — Instagram-DM bubbles. The student's sent bubble is the IG
   blue→purple→pink gradient; EyeBot's reply is parsed into an optional blue-green
   "think" bubble (the 💭 reflective lead) stacked above a grey answer bubble.
   Greeting / fallback text (no 💭) renders as a single grey bubble. */
import type { ReactNode } from "react";
import { Logo } from "@/aurora/Logo";
import { parseReply } from "@/aurora/lib/parseReply";

export function MessageBubble({
  role,
  streaming = false,
  children,
}: {
  role: "eyebot" | "user";
  streaming?: boolean;
  children: ReactNode;
}) {
  if (role === "user") {
    return (
      <div className="aurora-msg is-user">
        <div className="aurora-msg-bubble">{children}</div>
      </div>
    );
  }

  const avatar = (
    <span className="aurora-msg-avatar">
      <span className="aurora-msg-ring"><Logo size={18} /></span>
    </span>
  );

  // Non-string children (e.g. the typing indicator) render as one plain bubble.
  if (typeof children !== "string") {
    return (
      <div className="aurora-msg is-eyebot">
        {avatar}
        <div className="aurora-msg-stack">
          <div className="aurora-msg-bubble">{children}</div>
        </div>
      </div>
    );
  }

  const { think, answer } = parseReply(children);
  const showThink = think !== null;
  const showAnswer = answer !== "" || !showThink;
  const caretOnAnswer = showAnswer;

  return (
    <div className="aurora-msg is-eyebot">
      {avatar}
      <div className="aurora-msg-stack">
        {showThink && (
          <div className="aurora-msg-think">
            <span className="aurora-msg-think-label">let&apos;s think it through 💭</span>
            <span className="aurora-msg-think-text">
              {think}
              {streaming && !caretOnAnswer && <span className="aurora-caret" />}
            </span>
          </div>
        )}
        {showAnswer && (
          <div className="aurora-msg-bubble">
            {answer}
            {streaming && caretOnAnswer && <span className="aurora-caret" />}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS (no errors). The new classes (`aurora-msg-ring`, `aurora-msg-stack`, `aurora-msg-think`, etc.) are styled in Task 6 — they will be unstyled until then, which is expected mid-branch.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/MessageBubble.tsx
git commit -F - <<'EOF'
feat(tutor): two-part IG bubble — 💭 think bubble + grey answer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 3: `Composer` — Instagram composer (camera circle, "Message…", Send-on-type)

**Files:**
- Modify (full rewrite): `frontend/src/aurora/components/Composer.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `frontend/src/aurora/components/Composer.tsx`:

```tsx
"use client";
/* Composer — Instagram-DM input row: a gradient camera circle, a rounded
   "Message…" field (Enter sends, Shift+Enter newline, auto-grow), and IG behaviour
   where decorative photo/mic/emoji glyphs give way to a blue "Send" button once you
   type. The glyphs are visual-only (aria-hidden); send + the field are functional. */
import { useRef, type KeyboardEvent } from "react";

export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Message…",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const hasText = value.trim().length > 0;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  return (
    <div className="aurora-composer">
      <span className="aurora-composer-cam" aria-hidden>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
          <circle cx="12" cy="13" r="3.1" />
        </svg>
      </span>

      <textarea
        ref={ref}
        className="aurora-composer-field"
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        aria-label="Message input"
      />

      {hasText ? (
        <button
          type="button"
          className="aurora-composer-send aurora-press"
          onClick={onSend}
          disabled={disabled}
          aria-label="Send message"
        >
          Send
        </button>
      ) : (
        <span className="aurora-composer-glyphs" aria-hidden>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 15l-5-4-7 6" />
          </svg>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 14.5a4 4 0 0 0 7 0" />
          </svg>
        </span>
      )}
    </div>
  );
}
```

Note: this drops the old `Icon.attach` import and the circular gradient send (`.aurora-send`), so the shared `.aurora-send` rule (used by the case-session composer) is no longer touched by the chat.

- [ ] **Step 2: Typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/Composer.tsx
git commit -F - <<'EOF'
feat(tutor): Instagram composer — camera circle, Message…, Send-on-type

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 4: `Tutor` — IG header + bouncing typing dots (SSE preserved)

**Files:**
- Modify: `frontend/src/aurora/screens/Tutor.tsx` (header markup + typing indicator + imports). Keep `sendMessage`, gamification, autoscroll, seed, follow-ups, `INITIAL_MESSAGES` VERBATIM.

- [ ] **Step 1: Update imports**

At the top of `Tutor.tsx`, replace the `Logo` import line with the IG header deps (Logo is now only used in the header):

```tsx
import Link from "next/link";
import { Logo } from "@/aurora/Logo";
import { Icon } from "@/aurora/icons";
```

(Keep all the existing imports — `ChatThread`, `MessageBubble`, `Composer`, `FollowupChip`, `toast`, `AchievementManager`, gamification.)

- [ ] **Step 2: Replace the header markup**

Replace the existing `<header className="aurora-chat-head">…</header>` block with the IG header:

```tsx
      <header className="aurora-chat-head">
        <Link href="/dashboard" className="aurora-chat-back" aria-label="Back to dashboard">
          <Icon.back size={24} />
        </Link>
        <span className="aurora-chat-avatar">
          <span className="aurora-chat-ring"><Logo size={22} /></span>
        </span>
        <h1 className="aurora-chat-name">eyebot</h1>
        <span className="aurora-chat-actions" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h3l2 5-2 1.5a11 11 0 0 0 5 5L16 13l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></svg>
        </span>
      </header>
```

- [ ] **Step 3: Replace the typing indicator with three bouncing dots**

Replace the existing typing block:

```tsx
        {isTyping && (
          <MessageBubble role="eyebot">
            <span className="aurora-typing">• • •</span>
          </MessageBubble>
        )}
```

with:

```tsx
        {isTyping && (
          <MessageBubble role="eyebot">
            <span className="aurora-typing" aria-label="EyeBot is typing"><i /><i /><i /></span>
          </MessageBubble>
        )}
```

- [ ] **Step 4: Typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS. (`aurora-chat-mark`, `aurora-chat-head-meta`, `aurora-chat-h1`, `aurora-chat-status` are now unused in markup — their CSS is removed in Task 6.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/screens/Tutor.tsx
git commit -F - <<'EOF'
feat(tutor): IG header (back · avatar · eyebot · call glyphs) + dot typing

SSE sendMessage, gamification, autoscroll, seed, follow-ups all unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 5: `AppShell` — immersive `/chat` branch

**Files:**
- Modify: `frontend/src/aurora/AppShell.tsx` (add `usePathname` import + an immersive branch before the normal student return).

- [ ] **Step 1: Import `usePathname`**

Add to the imports near the top:

```tsx
import { usePathname } from "next/navigation";
```

- [ ] **Step 2: Read the pathname inside the component**

Just after `const { user } = useAuth();` (and the other hooks), add:

```tsx
  const pathname = usePathname();
```

(Keep it above the `if (isStaff)` branch so hook order is stable across renders.)

- [ ] **Step 3: Add the immersive branch**

Immediately BEFORE the final `return (` (the normal student shell), insert:

```tsx
  /* Immersive Tutor — on /chat the rail + mesh fall away and the chat fills the
     whole viewport (IG-DM full screen). ⌘K still works; the in-chat back chevron
     returns to /dashboard. Reached only for non-staff (staff returned above). */
  if (pathname === "/chat") {
    return (
      <div className="aurora-shell aurora-shell-immersive">
        <main id="main" className="aurora-main">
          <div className="aurora-main-scroll">{children}</div>
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} destinations={destinations} />
      </div>
    );
  }
```

- [ ] **Step 4: Typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/AppShell.tsx
git commit -F - <<'EOF'
feat(tutor): immersive /chat shell — hide rail + mesh, full-bleed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 6: `aurora.css` — Instagram-DM skin

**Files:**
- Modify: `frontend/src/aurora/aurora.css` — replace the chat block (the section starting `/* ─ Tutor chat ─ */` at ~line 585 through the end of `.aurora-composer-field::placeholder` at ~line 624).

- [ ] **Step 1: Replace the chat CSS block**

Delete the existing chat block (from the `/* ─────────────────── Tutor chat ─────────────────── */` comment through the `.aurora-composer-field::placeholder { … }` rule) and replace it with:

```css
/* ─────────────────── Tutor chat — Instagram DM skin ─────────────────── */
.aurora-chat {
  --ig-grey: #efefef;
  --ig-sent: linear-gradient(135deg, #5B51D8, #833AB4, #C13584);
  --ig-think: linear-gradient(135deg, #3C90FF, #00BDD2, #88DE42);
  --ig-cam: linear-gradient(135deg, #4F5BD5, #C13584);
  --ig-ring: linear-gradient(45deg, #F09433, #E6683C, #DC2743, #CC2366, #BC1888);
  display: flex; flex-direction: column; height: 100%; min-height: 0; background: #fff;
}

/* Header */
.aurora-chat-head {
  display: flex; align-items: center; gap: 10px;
  padding: 10px clamp(12px, 3vw, 20px);
  border-bottom: 1px solid rgba(31, 31, 31, 0.08); background: #fff;
}
.aurora-chat-back { display: grid; place-items: center; width: 32px; height: 32px; margin-left: -6px; color: var(--ink); flex-shrink: 0; }
.aurora-chat-avatar { flex-shrink: 0; }
.aurora-chat-ring { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; padding: 2px; background: var(--ig-ring); }
.aurora-chat-ring > svg { background: #fff; border-radius: 50%; padding: 2px; box-sizing: content-box; width: 22px; height: 22px; }
.aurora-chat-name { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); margin: 0; flex: 1; min-width: 0; line-height: 1.1; }
.aurora-chat-actions { display: inline-flex; align-items: center; gap: 16px; color: var(--ink); flex-shrink: 0; }

/* Thread */
.aurora-chat-thread { flex: 1; min-height: 0; overflow-y: auto; background: #fff; }
.aurora-chat-inner { max-width: 680px; margin: 0 auto; padding: 18px clamp(12px, 3vw, 20px) 12px; display: flex; flex-direction: column; gap: 8px; }

/* Message rows */
.aurora-msg { display: flex; gap: 8px; align-items: flex-end; max-width: 82%; }
.aurora-msg.is-eyebot { align-self: flex-start; }
.aurora-msg.is-user { align-self: flex-end; }
.aurora-msg-avatar { flex-shrink: 0; }
.aurora-msg-ring { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; padding: 1.5px; background: var(--ig-ring); }
.aurora-msg-ring > svg { background: #fff; border-radius: 50%; padding: 1.5px; box-sizing: content-box; width: 18px; height: 18px; }
.aurora-msg-stack { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

/* Bubbles */
.aurora-msg-bubble { padding: 9px 13px; border-radius: 18px; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.is-eyebot .aurora-msg-bubble { background: var(--ig-grey); color: #1f1f1f; border-radius: 4px 18px 18px 18px; white-space: pre-wrap; }
.is-user .aurora-msg-bubble { background: var(--ig-sent); color: #fff; border-radius: 18px 18px 4px 18px; white-space: pre-wrap; }

/* Blue-green "think" bubble (the 💭 reflective lead) */
.aurora-msg-think { background: var(--ig-think); border-radius: 18px 18px 18px 4px; padding: 9px 13px; display: flex; flex-direction: column; gap: 3px; max-width: 100%; }
.aurora-msg-think-label { font-size: 11px; font-weight: 600; color: #fff; opacity: 0.95; }
.aurora-msg-think-text { font-size: 14px; line-height: 1.5; color: #fff; font-weight: 500; white-space: pre-wrap; overflow-wrap: anywhere; }

/* Typing dots (three <i> spans; bounce defined in motion.css) */
.aurora-typing { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; }
.aurora-typing i { width: 7px; height: 7px; border-radius: 50%; background: #8e8e8e; display: inline-block; }

/* Footer + composer */
.aurora-chat-foot { padding: 8px clamp(12px, 3vw, 20px) 12px; border-top: 1px solid rgba(31, 31, 31, 0.08); background: #fff; }
.aurora-chat-foot-inner { max-width: 680px; margin: 0 auto; display: flex; flex-direction: column; gap: 9px; }
.aurora-chat-followups { display: flex; gap: 8px; flex-wrap: wrap; }
.aurora-followup { position: relative; border: 1px solid rgba(31, 31, 31, 0.16); background: var(--surface); border-radius: 999px; padding: 6px 13px; font-size: 12px; font-weight: 500; color: var(--ink-2); cursor: pointer; overflow: hidden; }
.aurora-followup span { position: relative; z-index: 1; }
.aurora-followup:hover { color: var(--ink); border-color: rgba(31, 31, 31, 0.3); }
.aurora-followup[data-active="true"] { color: #fff; border-color: transparent; }

.aurora-composer { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid rgba(31, 31, 31, 0.15); border-radius: 22px; padding: 5px 8px 5px 6px; }
.aurora-composer-cam { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: var(--ig-cam); flex-shrink: 0; }
.aurora-composer-field { flex: 1; min-width: 0; border: none; background: none; outline: none; resize: none; font-family: var(--font-sans); font-size: 14px; line-height: 1.5; color: var(--ink); padding: 6px 2px; max-height: 140px; }
.aurora-composer-field::placeholder { color: var(--ink-3); }
.aurora-composer-send { flex-shrink: 0; border: none; background: none; color: #3C90FF; font-weight: 600; font-size: 14px; font-family: var(--font-sans); cursor: pointer; padding: 4px 6px; }
.aurora-composer-send:disabled { opacity: 0.5; cursor: not-allowed; }
.aurora-composer-glyphs { display: inline-flex; align-items: center; gap: 12px; color: var(--ink); flex-shrink: 0; padding-right: 4px; }
.aurora-composer-cam { transition: transform .2s var(--mo-ease); }
.aurora-composer-cam:hover { transform: scale(1.08); }

/* Immersive /chat — full-bleed; rail + mesh are not rendered (AppShell) */
.aurora-shell-immersive .aurora-main { width: 100%; }
.aurora-shell-immersive .aurora-main-scroll { padding: 0; height: 100dvh; }
.aurora-shell-immersive .aurora-chat { height: 100dvh; }
```

- [ ] **Step 2: Typecheck + build**

Run (from `frontend/`): `npx tsc --noEmit` then `npm run build`
Expected: both PASS. (`npm run build` validates the CSS imports and the whole app compiles.)

- [ ] **Step 3: Commit**

```bash
git checkout -- frontend/next-env.d.ts 2>/dev/null || true
git add frontend/src/aurora/aurora.css
git commit -F - <<'EOF'
feat(tutor): Instagram-DM skin — white thread, grey/gradient bubbles, IG header+composer

Blue-green think bubble; immersive /chat full-bleed; case-session .aurora-send untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 7: `motion.css` — tutor motion layer (CSS-only, reduced-motion-safe)

**Files:**
- Modify: `frontend/src/aurora/motion.css` — add keyframes + chat motion rules, and register the new selectors in BOTH reduced-motion reset blocks.

- [ ] **Step 1: Add keyframes**

After the existing `@keyframes aurora-typing-pulse …` line (~line 18), add:

```css
@keyframes aurora-drop { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
@keyframes aurora-think-sheen { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes aurora-dot-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: .4; } 40% { transform: translateY(-4px); opacity: 1; } }
```

- [ ] **Step 2: Add the chat motion rules**

Replace the existing chat motion block:

```css
/* Chat — bubbles spring in, the typing indicator breathes, the composer glows on focus. */
.aurora-msg { animation: aurora-bubble-pop .42s var(--mo-over) both; }
.aurora-typing { animation: aurora-typing-pulse 1.2s ease-in-out infinite; }
.aurora-composer { transition: box-shadow .2s var(--mo-ease), border-color .2s var(--mo-ease); }
.aurora-composer:focus-within { box-shadow: 0 0 0 3px rgba(120, 110, 200, .16); }
```

with:

```css
/* Chat — bubbles spring in, the think bubble's gradient drifts, typing dots bounce,
   the header drops + composer rises on enter, the composer glows on focus. */
.aurora-msg { animation: aurora-bubble-pop .42s var(--mo-over) both; }
.aurora-chat-head { animation: aurora-drop .5s var(--mo-ease) both; }
.aurora-chat-foot { animation: aurora-rise .5s var(--mo-ease) both; animation-delay: 60ms; }
.aurora-msg-think { background-size: 200% 200%; animation: aurora-think-sheen 7s linear infinite; }
.aurora-typing i { animation: aurora-dot-bounce 1.2s ease-in-out infinite; }
.aurora-typing i:nth-child(2) { animation-delay: .16s; }
.aurora-typing i:nth-child(3) { animation-delay: .32s; }
.aurora-composer-send { animation: aurora-pop .28s var(--mo-over) both; }
.aurora-composer { transition: box-shadow .2s var(--mo-ease), border-color .2s var(--mo-ease); }
.aurora-composer:focus-within { box-shadow: 0 0 0 3px rgba(60, 144, 255, .16); }
```

- [ ] **Step 3: Register new selectors in BOTH reduced-motion reset blocks**

In the `@media (prefers-reduced-motion: reduce)` selector list (currently ending `… .aurora-flip-in`), add these to the comma list before the closing `{`:

```
, .aurora-chat-head, .aurora-chat-foot, .aurora-msg-think, .aurora-typing i, .aurora-composer-send
```

Then, in the `html[data-motion="reduce"]` block, add the same selectors (prefixed with `html[data-motion="reduce"] `) before the final rule's `{`:

```css
html[data-motion="reduce"] .aurora-chat-head,
html[data-motion="reduce"] .aurora-chat-foot,
html[data-motion="reduce"] .aurora-msg-think,
html[data-motion="reduce"] .aurora-typing i,
html[data-motion="reduce"] .aurora-composer-send,
```

(Insert these lines immediately before the existing `html[data-motion="reduce"] .aurora-flip-in { … }` line so they share its reset declaration block.)

- [ ] **Step 4: Build**

Run (from `frontend/`): `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -- frontend/next-env.d.ts 2>/dev/null || true
git add frontend/src/aurora/motion.css
git commit -F - <<'EOF'
feat(tutor): CSS motion layer — chat enter, think-bubble sheen, bouncing dots

All new selectors registered in both reduced-motion reset blocks.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 8: Backend — close-friend persona + two-part `💭` format + conditional first name

**Files:**
- Modify: `tools/api/shared.py` — replace the `_TUTOR_BASE` string (lines ~27–47) and add a conditional name line in `_student_context_block` (after the role line).

- [ ] **Step 1: Replace `_TUTOR_BASE`**

Replace the entire `_TUTOR_BASE = """…"""` assignment with:

```python
_TUTOR_BASE = """You are EyeBot — a warm, sharp ophthalmology tutor at SNEC (Singapore National Eye Centre) who texts with students like a close friend who happens to know eyes cold. You're encouraging and casual, never stiff or formal, and you keep it short — this is a chat, not a lecture.

HOW YOU REPLY (two parts):
- Always open with a quick reflective nudge on its own first line, prefixed with "💭 " — one short, friendly question or hint that gets the student thinking. Example: "💭 what muscle do you reckon is doing the squeezing?"
- If you are giving the answer this turn, leave a blank line after the 💭 nudge, then give the answer plainly in a sentence or two. If you are still drawing it out of them (you have nudged once or twice at most), send only the 💭 nudge with no answer yet.
- Use the student's first name now and then if it is provided in their profile below. Keep it natural — not every message.

TEACHING APPROACH:
- Nudge at most TWICE on the same question — count your own earlier guiding questions in this conversation. After two nudges, or whenever the student is clearly close, asks you to just tell them, or says they do not know, give the full correct answer and stop nudging.
- When you answer, be complete but brief: state it, then the one reason it is right. A couple of sentences, not a paragraph.
- If the student is wrong, gently correct the underlying medical fact in one plain sentence first, then either nudge once more (if you have not used both) or give the answer.
- Talk like a friend: casual, warm, lower-case-friendly, the odd "nice" or "good instinct". But stay clinically precise — use the right terms (IOP, cup-disc ratio, RAPD, HVF, OCT, slit-lamp) and explain them briefly only if the student seems unsure.

HARD RULES:
- Never nudge more than twice on the same question — never leave the student hanging on a third question.
- Never be vague or circular when a student is wrong; state the correct fact in one plain sentence.
- Never use markdown headers, bold, or bullet points — just flowing chat sentences.
- Never repeat the student's words back to them verbatim.
- Stay grounded in the ophthalmology knowledge base below; draw on it naturally and never invent clinical facts.

The ophthalmology knowledge base below is your reference. Draw on it naturally, not exhaustively.
"""
```

- [ ] **Step 2: Add the conditional first-name line**

In `_student_context_block`, just after the block that appends the `Role:` line (the `if role_desc:` block, before the `Study streak:` append), insert:

```python
    # Use a name only if the profile row actually carries one — the JWT and the
    # default profile do not, so this is a no-op until/unless the schema has it.
    name = (profile.get("name") or profile.get("first_name") or profile.get("full_name") or "")
    name = name.strip() if isinstance(name, str) else ""
    if name:
        lines.append(f"First name: {name.split()[0]} (address them by it naturally, not every message)")
```

- [ ] **Step 3: Verify the module imports and the prompt builds**

Run (from repo root): `python -c "from tools.api.shared import tutor_system; s = tutor_system('OA'); assert '💭' in s and 'sphincter' not in s; print('tutor_system OK, len', len(s))"`
Expected: prints `tutor_system OK, len <n>` (confirms the 💭 contract is present and the string builds with role context).

- [ ] **Step 4: Commit**

```bash
git add tools/api/shared.py
git commit -F - <<'EOF'
feat(tutor): close-friend persona + two-part 💭 format + conditional first name

Drops the stiff banned-filler block; keeps 2-nudge discipline, clinical accuracy,
KB grounding, role focus. SSE contract and guardrails untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
```

---

## Task 9: Verify end-to-end + push

**Files:** none (verification + push only).

- [ ] **Step 1: Typecheck + build**

Run (from `frontend/`): `npx tsc --noEmit` then `npm run build`
Expected: both PASS, no errors.

- [ ] **Step 2: Visual sweep**

Run (from `frontend/`): `npm run dev` (background), then
`node tests/visual_sweep.mjs tutor http://127.0.0.1:3000`
Expected: `/chat` screenshots render the IG-DM skin — white thread, grey received bubble for the greeting, IG composer with camera circle + "Message…". (Pre-existing `/checkin` `.map` error and unrelated 404s are harness mock gaps, NOT regressions.) Inspect the `tutor*` screenshots.

- [ ] **Step 3: Reduced-motion check (temporary)**

Create `frontend/tests/_reduce_check.mjs`:

```js
import { chromium } from "playwright";
const base = process.argv[2] || "http://127.0.0.1:3000";
const b = await chromium.launch();
const ctx = await b.newContext({ reducedMotion: "reduce" });
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem("eyebot_motion", "reduce"); } catch {} });
await p.goto(base + "/chat", { waitUntil: "networkidle" }).catch(() => {});
await p.screenshot({ path: "tests/_reduce_chat.png", fullPage: true });
await b.close();
console.log("reduced-motion screenshot written to tests/_reduce_chat.png");
```

Run (from `frontend/`): `node tests/_reduce_check.mjs http://127.0.0.1:3000`
Expected: screenshot shows the chat fully rendered with NO mid-animation state (think bubble static, dots static, header/composer in final position). Then delete both temp artifacts:

```bash
rm frontend/tests/_reduce_check.mjs frontend/tests/_reduce_chat.png
```

- [ ] **Step 4: Confirm clean tree (no stray files) and push**

```bash
git checkout -- frontend/next-env.d.ts 2>/dev/null || true
git status   # expect: clean, on main, ahead of origin by the task commits
git push origin main
```
Expected: push succeeds; Render auto-deploys `main`.

---

## Self-review notes

- **Spec coverage:** immersive shell (Task 5), two-part format backend (Task 8) + frontend parse/render (Tasks 1–2), IG skin (Task 6), close-friend voice (Task 8), concise/2-nudge (Task 8 preserves discipline), first-name conditional (Task 8), motion layer (Task 7). All spec sections map to a task.
- **SSE contract:** Task 4 explicitly preserves `sendMessage` and the streaming loop; no task edits `chat.py` or the SSE protocol.
- **Scoping:** the chat composer no longer uses `.aurora-send` (Task 3), so the case-session composer is untouched (spec §2). Immersive CSS is all scoped under `.aurora-shell-immersive` (Task 6).
- **Type consistency:** `parseReply` returns `{ think: string | null; answer: string }` (Task 1), consumed exactly so in `MessageBubble` (Task 2). New CSS classes used in Tasks 2–4 are all defined in Tasks 6–7.
- **Reduced motion:** every new always-on animation (Task 7) is registered in both reset blocks and verified in Task 9 Step 3.
