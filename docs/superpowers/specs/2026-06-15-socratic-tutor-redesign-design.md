# Socratic Tutor Redesign — Design Spec

> Date: 2026-06-15 · Status: approved (design phase) · Author: EyeBot session
> Part of the IELA 2026 award polish. Touches the student `/chat` (frontend skin +
> layout) **and** the backend tutor persona prompt.

## 1. Goal

Redesign the EyeBot **Socratic Tutor** (student `/chat`) so it feels like texting a
warm, knowledgeable close friend in **Instagram DMs**, while keeping the clinical
rigor, RAG grounding, and guardrails intact. Concretely, fix the six complaints:

1. Make the tutor **full-screen immersive** (no app rail competing for attention).
2. **Format replies Socratic-part-first**, concise answer below.
3. Replace the plain/boring colour & layout with a **default-Instagram-DM** look.
4. Drop the boring/serif font idea → **plain system sans** (what IG uses).
5. Answers are long-winded → make them **genuinely concise**.
6. Make the tutor feel like a **close friend** (warm, casual, first-name).

## 2. Scope

**In scope**
- Backend: rewrite `_TUTOR_BASE` persona in `tools/api/shared.py` (voice + two-part
  output contract). Optional conditional first-name line in `_student_context_block`.
- Frontend: immersive `/chat` shell branch; IG-style chat header; two-part
  (`💭` think + answer) bubble rendering; IG-style composer; IG-DM CSS skin.
- Frontend: a **tutor motion layer** (CSS-only, in `motion.css`) — chat enter
  choreography, living think-bubble gradient sheen, IG-style bouncing typing dots,
  send-button micro-interactions — all reduced-motion-safe.

**Out of scope (do NOT touch)**
- The `/api/chat` SSE streaming contract (the `data: {"text": …}` / `[DONE]` protocol,
  input_filter, output_validator, RAG retrieval, role focus, 2-nudge discipline).
- Staff `.console-dark` console, admin/supervisor, login, `ChangePasswordModal`.
- The case-simulation session composer (`.aurora-session-composer` / shared
  `.aurora-send` at `aurora.css:574`) — IG composer styling must be scoped so it does
  not bleed into the case session UI.
- `workflows/` (no edits without explicit permission).

## 3. Locked design decisions (approved by user)

- **Immersive layout** — on `/chat` the Atlas Rail and drifting mesh are hidden; the
  chat fills the whole viewport. Return-to-app is via an IG **back chevron** in the
  chat header (→ `/dashboard`). ⌘K command palette stays available.
- **Two-part output** — every *teaching* reply leads with a short reflective
  nudge/question, then the concise answer below it. Pure-probe turns may be the
  nudge alone (no answer yet); that is expected and renders as just the think bubble.
- **Instagram-DM skin** — white thread; **grey received bubbles** from EyeBot; the
  student's **sent** bubbles use the IG `linear-gradient(135deg,#5B51D8,#833AB4,#C13584)`
  with white text; **plain system sans** (no serif); IG header (back chevron,
  gradient-ring circular avatar, name only, phone/video glyphs); IG composer (camera
  circle, "Message…" placeholder, trailing photo/mic/emoji glyphs, Send-on-type).
- **Think bubble = vivid blue-green gradient** (Option 1, approved): fill
  `linear-gradient(135deg,#3C90FF,#00BDD2,#88DE42)`, **bold white text**, white
  `let's think it through 💭` label. (This is EyeBot's gem-spectrum blue→cyan→green.)
  System reads cleanly: **gradient = expressive/thinking, grey = the plain answer.**
- **Header has NO "Active now" line** (user dropped it). Header = back chevron ·
  gradient-ring avatar · `eyebot` name only · phone + video glyphs.
- **Voice = close friend** — warm, casual, encouraging, lower-case-friendly, uses the
  student's first name *when available*; genuinely concise (a few sentences, not a
  lecture). Drop the stiff "banned filler" block. KEEP clinical accuracy, KB/RAG
  grounding, role focus, guardrails, and the "answer within ~2 nudges" discipline.

## 4. The two-part reply protocol (`💭` contract)

This is the shared contract between the backend prompt and the frontend parser.

**Backend emits**, per teaching reply, either:
- Probing turn: `💭 <one warm reflective nudge/question>` — no answer yet.
- Answering turn: `💭 <one short reflective lead>` + a blank line (`\n\n`) +
  `<the concise answer>`.

Rules baked into the prompt:
- The reply **starts with the literal `💭` marker** followed by a space, then the lead.
- The answer (when given) is separated from the lead by **exactly one blank line**.
- No markdown headers/bullets; flowing sentences; casual close-friend tone.
- Non-teaching/greeting/error text has no `💭` and renders as a single normal bubble.

**Frontend parses** (pure function, no state):
```
parseReply(content):
  if not content.startsWith("💭"): return { think: null, answer: content }
  sep = content.indexOf("\n\n")
  if sep == -1: return { think: stripMarker(content), answer: "" }   // still streaming the lead
  return { think: stripMarker(content.slice(0, sep)).trim(),
           answer: content.slice(sep + 2).trim() }
stripMarker(s): s with a leading /^💭\s*/ removed
```
- `think != null` → render the **gradient think bubble** (with static
  `let's think it through 💭` label) above.
- `answer != ""` → render the **grey answer bubble** below.
- `think == null` → single grey bubble (greeting / fallback / quota message).
- **Streaming-safe**: `parseReply` runs on every render of the streaming message; while
  only the lead has arrived (no `\n\n` yet) only the think bubble shows; once the blank
  line streams in, the grey answer bubble appears and grows. The streaming caret
  attaches to whichever bubble is currently the last non-empty one.

The static `let's think it through 💭` label is **UI chrome**, not model output — the
model only supplies the `💭` marker + the reflective text.

## 5. Backend changes (`tools/api/shared.py`)

### 5.1 `_TUTOR_BASE` rewrite
Rewrite the persona to the close-friend voice + two-part contract. Preserve the
behavioural spine (2-probe max, correct wrong premises plainly, concise answers, use
clinical terms correctly, KB-grounded). Remove the banned-filler list and the
"never be warm" stiffness. Add the explicit `💭`-lead + blank-line + answer format
instruction (§4). Keep `tutor_system(role)` and `_ROLE_TUTOR_CONTEXT` unchanged in
shape — only `_TUTOR_BASE`'s text changes.

Voice guidance to encode (illustrative, not verbatim):
- Talk like a friend who happens to know ophthalmology cold. Warm, casual, brief.
- Lead with a quick reflective nudge (`💭 …`); after at most two nudges, just give it.
- When you answer: state it plainly in a few sentences + the one reason it's right.
- Use the student's first name naturally **if** it's provided in the profile block.
- Stay clinically precise; correct wrong premises in one plain sentence; no lecturing.

### 5.2 Conditional first name (`_student_context_block`)
The JWT (`CurrentUser`) and `get_profile` `_DEFAULTS` carry **no name**. So:
- During implementation, check whether the `student_profiles` row returned by
  `db.get_profile` actually includes a usable name field (e.g. `name` / `first_name` /
  `full_name`). If yes, add a single `Name: <first name>` line to the profile block and
  let the prompt use it. If no such field exists, **do nothing** — the tutor stays warm
  without a name and **never invents one**. No DB migration in this task.

## 6. Frontend changes

### 6.1 `AppShell.tsx` — immersive `/chat` branch
- Import `usePathname` from `next/navigation`.
- After the staff branch, if `role === "student"` (non-staff) **and**
  `pathname === "/chat"`, return an **immersive** tree: no `AtlasRail`, no
  `.aurora-mesh`, no `RouteReveal` wrap; chat is full-bleed. Keep `CommandPalette`
  (⌘K) mounted. All hooks (`useReducedMotion`, auth, progress sync, palette key
  listener) run before the branch, so order is unchanged.
- Mark the wrapper `className="aurora-shell aurora-shell-immersive"`.

### 6.2 `Tutor.tsx` — IG header + two-part wiring
- Replace `.aurora-chat-head` markup with the IG header: a **back chevron** button
  (`router.push("/dashboard")` via `useRouter` / or `<Link href="/dashboard">`), a
  **gradient-ring circular avatar** wrapping `<Logo />`, the name `eyebot` (lower-case),
  and decorative **phone + video** glyphs on the right. **No status line.**
- Keep the entire SSE `sendMessage`, gamification hooks, autoscroll, seed logic,
  follow-up chips, and `INITIAL_MESSAGES` **verbatim**.
- Pass each eyebot message's raw `content` to `MessageBubble`; the bubble does the
  `parseReply` split (keeps `Tutor` simple, bubble owns rendering).

### 6.3 `MessageBubble.tsx` — two-part IG render
- For `role === "user"`: single IG-gradient sent bubble (right-aligned), as today but
  re-skinned.
- For `role === "eyebot"`: run `parseReply(children-as-string)`:
  - if `think`: render a **gradient think bubble** with the static label
    `let's think it through 💭` + the reflective text;
  - if `answer`: render a **grey answer bubble** below;
  - if neither think (plain content): single grey bubble.
- Keep the small eyebot avatar (gradient-ring `<Logo>`) on the row, IG-style.
- Keep the `streaming` caret; attach it to the last growing bubble.
- `parseReply` lives in a tiny local helper (or `lib/`); `children` arrives as a string
  (Tutor passes `m.content`); guard for non-string defensively.

### 6.4 `Composer.tsx` — IG composer
- Camera **circle** (gradient `linear-gradient(135deg,#4F5BD5,#C13584)`) on the left.
- Rounded pill field, placeholder **"Message…"**, Enter-to-send preserved
  (Shift+Enter newline), auto-grow preserved.
- **Empty state**: trailing decorative photo/mic/emoji glyphs (aria-hidden,
  non-interactive — visual fidelity only; documented as skin, not functional controls).
  **Typing state** (value non-empty): glyphs give way to a real **Send** button
  (IG-blue), exactly like Instagram. Keep `disabled` wiring.
- Scope all new classes under `.aurora-composer` so the case-session composer and the
  shared `.aurora-send` rule are untouched.

### 6.5 `aurora.css` — IG-DM skin (chat region ~585–624)
Re-skin the chat classes; define chat-local custom props for the IG palette so values
are centralised:
- `.aurora-chat`, `.aurora-chat-thread`, `.aurora-chat-inner` → **white** thread
  (replace `--wash-lavender`); comfortable centered column.
- `.aurora-chat-head`, `.aurora-chat-foot` → white with a hairline border (drop the
  lavender blur wash); IG header layout.
- `.is-user .aurora-msg-bubble` → IG sent gradient `135deg,#5B51D8,#833AB4,#C13584`,
  white text, IG bubble radii (`18px 18px 4px 18px`).
- `.is-eyebot` grey answer bubble → `#EFEFEF`, ink text, radii `4px 18px 18px 18px`.
- New `.aurora-msg-think` → gradient `135deg,#3C90FF,#00BDD2,#88DE42`, white text;
  `.aurora-msg-think-label` → 11px white 500 label.
- Immersive (all scoped under `.aurora-shell-immersive` so the normal shell is
  untouched): `.aurora-shell-immersive .aurora-main` full-bleed;
  `.aurora-shell-immersive .aurora-main-scroll` padding 0 + `height: 100dvh`;
  `.aurora-shell-immersive .aurora-chat` fills `100dvh`.
- Keep using the existing `.aurora-msg` / `.aurora-typing` class names so `motion.css`
  bubble-pop / typing-pulse / composer-focus motion keeps applying.

### 6.6 Tutor motion layer (`motion.css`, CSS-only)

The student app already has a CSS-only motion engine (`motion.css`); the MotionProvider
is NOT mounted, so GSAP fx wrappers crash — **all motion here is CSS keyframes only**.
Add a focused, tasteful tutor layer (GPU-only transform/opacity + one gradient sheen):

- **Chat enter choreography** — on mount the header drops in (`translateY(-10px)`→0 +
  fade) and the composer/footer rises in (`translateY(10px)`→0 + fade), via new
  `.aurora-chat-head` / `.aurora-chat-foot` animations. The first greeting bubble pops
  via the existing `.aurora-msg` bubble-pop. Follow-up chips keep their `.aurora-stagger`.
- **Living think bubble** — the blue-green gradient gently drifts (a slow
  `background-position` sheen, ~7s linear infinite, `background-size: 200%`) so the
  "thinking" bubble feels alive. Static fill under reduced motion.
- **Bouncing typing dots** — replace the single pulsing `• • •` with three dot spans
  that bounce in an IG-style staggered cadence (`translateY` + opacity, per-dot delay).
- **Send micro-interactions** — the Send button pops in (`aurora-pop`) when text is
  entered and scales on press (`.aurora-press`); the camera circle lifts subtly on hover.
- **Streaming sequence is organic** — think→answer ordering comes from SSE streaming
  (think text arrives, then the answer after the blank line), not a CSS delay, so no
  double-animation jank with the row-level bubble-pop.

All new animations are added to **both** reduced-motion reset blocks at the bottom of
`motion.css` (the `@media (prefers-reduced-motion: reduce)` block and the
`html[data-motion="reduce"]` block).

## 7. Accessibility & reduced motion

- Header back button: real `<button>`/`<Link>` with `aria-label="Back to dashboard"`.
- Decorative glyphs (phone, video, camera, photo, mic, emoji): `aria-hidden="true"`.
- `ChatThread` keeps `role="log" aria-live="polite"`.
- Exactly one `<h1>` per route — keep an accessible heading (can be visually-styled as
  the IG name or `sr-only`); do not ship a route with zero h1.
- White text on the gradient bubbles must stay legible (it is bold white on
  saturated mid-tones — passes). Grey bubble text stays ink on `#EFEFEF`.
- Reduced motion (`html[data-motion="reduce"]` / OS query): the tutor motion layer
  (§6.6) adds always-on motion (think-bubble sheen, bouncing dots, chat-enter), so each
  new animated selector MUST be added to both reduced-motion reset blocks in `motion.css`.
  Under reduce: think gradient is a static fill, dots are static, header/composer/bubbles
  render in their final state. Verify nothing pulses or drifts under reduce.

## 8. Constraints & gotchas

- **MotionProvider is NOT mounted** in the AURORA app → `fx/text/SplitText` and
  `fx/cursor/Magnetic` crash if used. **CSS-only motion.**
- **Do not change** the `/api/chat` SSE contract or the guardrail/RAG/role pipeline.
- `next-env.d.ts` auto-regenerates (oscillates between build/dev) — `git checkout --`
  it; never commit it.
- Windows PowerShell: no `&&` chaining; commit via `git commit -F` (here-doc).
- Render runs **one** uvicorn worker — keep backend changes prompt-only (no new
  blocking calls on the event loop).

## 9. Verification plan

From `frontend/`:
- `npx tsc --noEmit` (no `npm run lint` script exists).
- `npm run build`.
- Visual sweep: `npm run dev`, then `node tests/visual_sweep.mjs tutor http://127.0.0.1:3000`
  (mocks all APIs; pre-existing `/checkin` `.map` + 404 harness gaps are NOT regressions).
- Reduced-motion: temp `tests/_reduce_check.mjs` (Playwright
  `newContext({reducedMotion:'reduce'})` + `localStorage eyebot_motion=reduce`),
  screenshot `/chat`, confirm static, then **delete** the temp file.
- Backend: confirm `_TUTOR_BASE` still imports + `tutor_system()` returns a string;
  spot-check the `💭`-lead format in a dev chat against the live two-part parser.
- Auto commit + push on `main` (Render auto-deploys). Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## 10. Future / explicitly deferred

- Wiring the photo/mic/emoji composer glyphs to real behaviour (attachments, voice,
  emoji picker) — skin-only for now.
- Persisting a student name field if none exists in `student_profiles` (DB migration).
- Per-message timestamps / read receipts / typing-from-server (IG niceties) — not now.
