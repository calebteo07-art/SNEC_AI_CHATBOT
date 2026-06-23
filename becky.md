# Becky — EyeBot speed + minimal-grounding plan

> Working notes for making the tutor, virtual patient, flashcards, and grading feel
> fast. Combines two levers:
>
> - **Lever A — call structure:** most slowness isn't the model, it's how the calls
>   are wired (fake streaming, thinking budgets, serial chains, duplicate fetches).
> - **Lever B — minimal grounding:** inject only the *authoritative reference* a call
>   needs, nothing else; cache the static parts. ("RAG: model answer only as the
>   database, and the same idea everywhere it applies.")
>
> Engine of record: Google Gemini via `tools/shared/gemini_client.py`. Runtime model
> is `gemini-3.1-flash-lite` everywhere. Thinking budgets:
> `MINIMAL`=off, `LOW`=1024, `MEDIUM`=8192, `HIGH`=16000 (`gemini_client.py:162-166`).
>
> Confirmed in code (2026-06-22): SDK clients are singletons, a hard request timeout is
> wired, `response_json_schema` is already supported, and the model is already the fastest
> tier — so the speed work is call-structure + grounding, **not** the client (see
> "Already optimal" below before touching `gemini_client.py`).

---

## Priority — actually fast (real wall-clock), gated on accuracy = reliability = security

**Objective:** lowest *real* latency, not perceived. Streaming is demoted — it only hides
time, it doesn't remove it.

**Order of priorities (non-negotiable):**
1. **Speed** — real wall-clock time to a complete, correct answer.
2. **Accuracy = reliability = security** — one hard gate, equal weight. Never ship a speed
   win that regresses any of them. If a change moves a harness or weakens a guardrail,
   **revert that specific change** and keep the rest. Speed is the goal; #2 is the wall.

Fixes split by whether they touch model reasoning / grounding. Section numbers (§1–§10)
point at the detailed write-ups below and don't change.

### Scope — this order governs *every* AI call site, not just the ones with a fix below

The rule above is a **standing principle for all features that call a model**, runtime or
offline. The inventory below (verified 2026-06-23) is the full set of AI calls in the app;
each is held to *speed first, #2 as the wall*. If a new AI call is added, it joins this table.

| AI feature | Call site | Thinking | Latency-critical? | Governed by |
|------------|-----------|----------|-------------------|-------------|
| Tutor chat | `chat.py:119` | LOW | yes (live stream) | §1–§3, §8 |
| Virtual patient | `cases.py:561` | LOW | yes (live stream) | §1, §2, §4 |
| Case grading | `evaluate_response.py:69` | HIGH | yes (blocks `/submit`) | §6 |
| Case debrief | `cases.py:673` | MEDIUM | yes (blocks `/submit`) | §6 |
| Missed-step notes | `cases.py:716` | MINIMAL | yes (blocks `/submit`) | §6 + §5-style `json_schema` (drops the `cases.py:725-728` fence-strip) |
| Flashcard grading | `student.py:164` | LOW | yes (blocks reveal) | §5 |
| Live examiner / observe | `observe_steps.py:61` | LOW | yes (per-turn tick) | §9 (NEW) |
| Study suggestion | `student.py:445` | MINIMAL | dashboard load | already optimal (MINIMAL + `max_tokens=256` + `MODEL_SMALL`) |
| Supervisor insights | `supervisor.py:225` | MEDIUM | staff, non-blocking | §9 (NEW) |
| Input guardrail | `input_filter.py:103`, `guardrail_case` | MINIMAL | pre-answer gate | security — keep, never drop |
| KB ingest / embed / OCR | `tools/kb/*` (`ingest_*`, `embed.py`, `ocr.py`) | offline batch | **no** (one-time write) | §10 (NEW) — gate dominates |

Everything in the table is either already covered by §1–§8, already optimal, or routed to the
two new sections §9 (the two runtime calls whose *thinking budgets* were never speed-evaluated)
and §10 (the offline pipeline, where #2 outranks raw speed in practice).

### Tier 1 — Free real wins (no accuracy / reliability / security cost) → land in one pass, no gate
Do in this sequence; all independently revertable, none changes what the model sees.

| Seq | Fix | Section | Real win |
|-----|-----|---------|----------|
| 1 | Keep-warm ping (kill Render cold start) | §7 | Largest real event; *improves* reliability |
| 2 | Parallelize the 3 case-grading calls | §6 | Collapses the serial chain on the heaviest endpoint |
| 3 | Dedupe the double `get_profile()` (tutor) | §2 | Removes a real sequential DB round-trip |
| 4 | Context-cache static KB + few-shot anchors | §3, §6 | Less prefill latency + cost, same tokens |
| 5 | `response_json_schema` on flashcard grading | §5 | Faster clean stop **and** deletes fence-stripping (more reliable) |
| 6 | Compact-serialize case JSON (`separators`, drop `indent`) | §4 | Fewer prefill tokens, byte-identical info |
| 7 | Output-token caps + SSE flush + serial-`await` audit | §8 | Generation time ∝ output tokens; unblock the live stream |

### Tier 2 — Real wins that touch reasoning / grounding → ship behind a harness gate
Land one at a time; run the named harness; revert that one change if it drifts.

| Seq | Fix | Section | Gate |
|-----|-----|---------|------|
| 1 | `HIGH→MEDIUM` thinking on case grading | §6 | `station_assert` — score drift within tolerance |
| 2 | `MINIMAL` thinking on chat / patient | §2 | `aurora_assert` — reads still correct |
| 3 | `MINIMAL` thinking + `max_tokens=256` on flashcard grading | §5 | `aurora_assert` — grading scores stable |
| 4 | Drop `rubric`/`management` from patient view | §4 | `station_assert` — patient still answers findings |
| 5 | `LOW→MINIMAL` thinking on live examiner / observe | §9 | `station_assert` — auto-tick precision/recall holds |
| 6 | `MEDIUM→LOW` thinking on supervisor insights | §9 | manual sanity read — narrative still coherent (non-blocking staff call, lowest stakes) |

### Perception only — NOT "actually fast" (do last)
- **§1 real streaming** — total time unchanged; it only shows tokens sooner. It is also the
  **one item that costs reliability** (weakens mid-stream key fallback), so under speed-first
  + reliability-sacred it goes **last**, with the `started`-flag mitigation, and only *after*
  §8's SSE-flush fix (otherwise the proxy re-buffers it and the rewrite buys nothing).
- **Optimistic UI** — hides the round-trip; fine to add, removes no real time.

Real latency budget lives in **Tier 1 #1–#2** (cold start + parallelize) and **Tier 2 #1**
(`HIGH→MEDIUM`). Everything else is incremental.

---

## 1. Real streaming — `stream_ask` isn't actually streaming  *(Lever A — PERCEPTION ONLY, do last)*

> Demoted to last (see Priority). This does **not** cut real wall-clock time and it **costs
> reliability** (mid-stream key fallback). Only worth doing after §8's SSE-flush fix, with
> the `started`-flag mitigation below. Confirmed live in code: `gemini_client.py:207-241`
> collect every chunk into `parsed`, then replay after the stream closes.

`gemini_client.py:204-241` buffers the **entire** response, then replays it:

```python
for chunk in sdk_client.models.generate_content_stream(...):
    if text: parsed.append(text)      # collect EVERYTHING
chunks_to_yield = parsed
...
for text in chunks_to_yield:          # THEN dump it all at once
    yield text
```

A 3s generation feels like a 3s blank wait instead of tokens at ~400ms. The comment
says it buffers to preserve multi-key fallback — wrong tradeoff, because quota /
availability errors almost always surface **before** the first token. Keep fallback
for that case and stream live:

```python
for sdk_client in _ensure_sdk_clients():
    for attempt in range(3):
        started = False
        try:
            for chunk in sdk_client.models.generate_content_stream(...):
                if chunk.text:
                    started = True
                    yield chunk.text          # live, token-by-token
            return
        except Exception as exc:
            if started:
                return            # partial answer already sent; SSE layer closes cleanly
            # not started yet -> same classify / retry / next-key logic as today
```

The SSE wrappers in `chat.py` and `cases.py` already `try/except` the stream, so a
mid-stream stop is handled.

**Tradeoff:** weakens mid-stream key fallback (acceptable — failures cluster at the start).

---

## 2. Cut time-to-first-token on chat  *(Lever A)*

- **Drop thinking on conversational calls.** Tutor (`chat.py:119`) and patient
  (`cases.py:559`) run `thinking_level="LOW"` = 1024 thinking tokens burned before the
  first word. Set **`MINIMAL`** for both. Reserve thinking for grading, not chat.
- **Dedupe the profile fetch (tutor).** `chat.py:82` calls `get_profile()`, then
  `chat.py:104` calls `_student_context_block()` which calls `get_profile()` **again**
  (`shared.py:91`) — two identical Supabase round-trips, sequential, before any token.
  Fetch once, pass it in.

---

## 3. Tutor KB — cache it, don't re-RAG  *(Lever A + B)*

The tutor injects the **entire** KB file into every system prompt (`chat.py:106`).
KB = `workflows/ophthalmology_kb.md` ≈ **3,289 words ≈ 5-6k tokens**.

Minimal-grounding instinct says "retrieve only relevant chunks." But at this size,
re-adding retrieval re-introduces the embedding + vector round-trip that was
deliberately removed for speed — and that round-trip costs **more** latency than the
prefill it saves. So instead:

- **Context-cache the static prefix** (persona + KB — identical across all users/messages;
  only the student block + conversation vary). `client.caches.create(...)` then pass
  `cached_content` in the config. Cuts latency **and** cost.
- Verify the exact `google-genai` cache API + min-token threshold against the installed SDK.

**Rule of thumb:** retrieval only wins for large corpora (tens of thousands of tokens).
Below that, cache. If the KB grows 5-10x later, the round-trip-free move is **local
keyword retrieval** (pick KB sections by keyword match, zero network) — not embedding RAG.

---

## 4. Virtual patient — trim the case JSON  *(Lever B — biggest grounding win)*

`cases.py:530` injects the **whole** case via `json.dumps(case, indent=2)`. A case
(e.g. `cases/case_oa_001_history_triage.json`) contains:

- `patient`, `history`, `examination_findings`, `investigations` — patient needs these
- `diagnosis` — keep (so it knows what **not** to reveal)
- **`rubric`** — ~40% of the file, pure grading meta the patient never references
- **`management`** — answer-key meta, not needed to roleplay

Build a patient-facing subset + compact-serialize:

```python
patient_view = {k: case[k] for k in
    ("patient", "history", "examination_findings", "investigations", "diagnosis")
    if k in case}
patient_prompt = PATIENT_SYSTEM.format(
    case_json=json.dumps(patient_view, separators=(",", ":")))
```

Dropping `rubric` + `management` and ditching `indent=2` roughly **halves** the
per-turn case payload. The grader still sees the full answer key on submit — only the
live roleplay gets the trimmed view.

---

## 5. Flashcard grading — already model-answer-only; trim the rest  *(Lever A + B)*

Grading already uses **only** the model answer as the reference (`student.py:153`):
`Question + Model answer + Student answer`. No KB, no retrieval. That's exactly the
"model answer as the database" target — already there.

Remaining fixes (`student.py:125-181`):

- **Drop the student context block** prepended at `student.py:130`. Grading should be
  *objective against the model answer*; personalization belongs in teaching, not scoring.
  Removes a Supabase profile fetch + ~150 prefill tokens.
- `thinking_level="MINIMAL"` (no reasoning needed for lenient grading).
- `max_tokens=256` (it's a 0-100 number + 1-2 sentences).
- Add `response_json_schema` (`{score:int, feedback:str}`) so the model stops cleanly —
  lets you delete the fragile fence-stripping at `student.py:170-173`.

SM-2 write is already backgrounded via Celery, so the response returns the moment the
grade is parsed. ~halves grading latency.

---

## 6. Case grading `/submit` — heaviest call + serial chain  *(Lever A + B)*

Three problems:

1. **`thinking_level="HIGH"` = 16000 thinking tokens** (`evaluate_response.py:64`) — by
   far the heaviest single call in the app. Try **`MEDIUM`** (8192) and measure drift
   against `station_assert`; strong few-shot anchors usually hold up at MEDIUM.
2. **Three calls run sequentially** (`cases.py:594` grade -> `:664` debrief -> `:714`
   missed-step notes), each its own `await asyncio.to_thread(...)`. Notes don't depend
   on the grade (only checklist + performed steps), so run them concurrently:

   ```python
   grade_task = asyncio.create_task(asyncio.to_thread(evaluate_case, ...))
   notes_task = asyncio.create_task(asyncio.to_thread(ask, ...notes...))
   raw_result = await grade_task
   # debrief needs the score, so it goes after grading:
   debrief, notes = await asyncio.gather(
       asyncio.to_thread(ask, ...debrief...),
       notes_task,
   )
   ```

   Collapses grade + debrief + notes into ~ grade + debrief.
3. **Cache the static few-shot anchors** (`DOMAIN_FEW_SHOTS`, all 4 domains) — re-sent on
   every grade. The case answer-key (`diagnosis/management/rubric/findings/investigations`,
   `evaluate_response.py:100`) **can't** be trimmed — it's the thing being graded against —
   but the anchors are static and cacheable. (Lever B applied to grading.)

Mind the single Render worker — `to_thread` keeps the event loop free (already done).

---

## 7. Infra / perceived  *(Lever A)*

- **Cold start.** One uvicorn worker on Render free spins down when idle — the first
  request after a lull is slow regardless of model. Cheap keep-warm ping or paid tier.
- **Optimistic UI.** Show the flashcard flip / a grading skeleton immediately on submit
  so the round-trip is hidden.

---

## 8. Completeness sweep — remaining real-latency levers  *(Lever A)*

The fixes above are the big rocks; these close out "all aspects" of response speed.

- **Cap `max_output_tokens` to real need on every call.** Generation time scales with output
  tokens. Defaults are loose — `stream_ask` 2048, `ask` 8192 (`gemini_client.py:172,247`).
  Set each call site to its realistic ceiling (chat ~1024, grading 256). The truncation guard
  only fires above 512 (`gemini_client.py:295`), so short intentional caps like 256 are safe
  and won't raise `response_truncated`.
- **Make the live stream actually reach the client.** After §1, verify nothing re-buffers it:
  the SSE response must send `text/event-stream`, flush per chunk, skip gzip on the stream, and
  set `X-Accel-Buffering: no` so Render's proxy doesn't coalesce. A perfect `stream_ask` still
  feels batched if the edge buffers it.
- **Audit serial `await` chains before first token.** §2 is one instance (double `get_profile`).
  Sweep the chat / cases / student endpoints for back-to-back `await` Supabase calls that could be
  a single `asyncio.gather` — every serial round-trip is dead time before the model is even called.
- **Right-size timeouts per call class.** One global `GEMINI_TIMEOUT_MS=60s` exists as a safety
  net (`gemini_client.py:62-66`). Consider a tighter ceiling for chat so a stuck call fails fast
  instead of hanging the UX; keep the longer budget for grading.

## 9. Two runtime calls whose *thinking budget* was never speed-evaluated  *(Lever A — gated)*

Both already carry **minimal grounding** (see "Already minimal" below) — that's settled. What
the plan never did is run their *thinking budgets* through the speed-first gate, so they're the
last runtime calls not yet held to priority #1.

- **Live examiner / observe** (`observe_steps.py:61`, `thinking_level="LOW"`). This fires **once
  per student turn** to auto-tick checklist steps, so its latency rides on every message in a
  station. It's a constrained, near-deterministic "which of these remaining steps did the last
  turns cover" classification — exactly the shape that usually survives `MINIMAL`. Try
  `LOW→MINIMAL`; gate on `station_assert` (the auto-tick precision/recall must hold — a missed or
  phantom tick is an accuracy regression, so revert if it drifts).
- **Supervisor insights** (`supervisor.py:225`, `thinking_level="MEDIUM"`). A 2-3 sentence cohort
  narrative on a **staff, non-blocking** screen — no student waits on it, so it's the
  lowest-stakes thinking budget in the app and the safest to cut. Try `MEDIUM→LOW`; a manual
  sanity read is enough (no harness covers it). If a future staff harness exists, gate on it.

Neither touches a student-facing answer, so both are pure speed with a cheap revert.

## 10. Offline AI pipeline — same order, but the gate outranks raw speed here  *(KB ingest / embed / OCR)*

The KB pipeline (`tools/kb/ingest_*`, `embed.py`, `ocr.py`, checklist extraction at
`ingest_checklists.py:111`) is **"a feature using AI"**, so the priority applies — but it runs as
a **one-time offline batch**, not on a user's request. No student waits on it, so "speed" means
**batch throughput**, not tail latency:

- **Pursue speed** the offline way: Gemini *batch* embedding endpoints, parallel doc ingest, and
  living with the OCR vision throttle (~33% rate-limited, documented) rather than serializing.
- **But #2 dominates in practice.** An ingestion is a durable, correctness-critical *write* to the
  KB every later RAG answer reads from — so you would never trade ingest accuracy/reliability for
  ingest speed. The canonical lesson is already in the codebase: the `embed_batch` 1:1 bug
  (`gemini-embedding-2` returns **one** vector per request, so a batched embed silently truncated
  docs). **Invariant for any batching change here: assert chunk-count == vector-count 1:1** before
  it ships. That guard is the wall §-#2 describes, applied to the pipeline.

So the order is unchanged — speed first, accuracy = reliability = security as the wall — but for
offline work the wall is closer, because the speed prize (a faster one-time batch) is small and the
failure cost (a corrupted KB) is large.

## Already optimal — do NOT "fix" these (verified 2026-06-22)

Confirmed against `gemini_client.py` so the dev session doesn't burn a pass:
- **Model is already the fastest tier** — `MODEL/MODEL_PRO/MODEL_SMALL` all = `gemini-3.1-flash-lite`
  (`:36-38`). Don't "upgrade"; a bigger model is slower, and #2 doesn't require it.
- **SDK clients are singletons** — `_SDK_CLIENTS` is built once and reused (`:53-67`); connections
  are already pooled. Don't recreate the client per request.
- **Hard request timeout already wired** (`:62-66`).
- **`response_json_schema` already plumbed** in `ask` (`:276-278`) — §5 just uses it.
- **Retry/backoff + multi-key rotation already present** (`:283-313`).
- The "Already minimal" prompts below.

## Security  *(priority #2 — equal weight to accuracy)*

Speed work must not open a hole:
- **Context-cache isolation (§3, §6).** Cache **only** the static persona + KB / few-shot prefix —
  never per-user content (student profile, session). A shared cache that captured user A's profile
  would surface it in user B's call. The static/dynamic split is a **security boundary**, not just
  a perf one — keep the per-user block out of any `caches.create`.
- **Keep-warm endpoint (§7)** must be unauthenticated, side-effect-free, and expose nothing — a
  trivial health ping. No DB writes, no AI call, no data in the body.
- **No PII in logs/metrics.** Any timing instrumentation added for speed must not log full prompts
  or responses — they carry patient and student PII.
- **Keep the input guardrail.** Don't drop the `guardrail_input` moderation call to save a
  round-trip; it's a safety gate, not latency fat.
- **`diagnosis` stays server-side (§4).** It's retained in the patient view so the model knows what
  *not* to reveal — verify it never leaks into the student-facing stream.

## Reliability & graceful degradation  *(priority #2)*

- **Cache miss must not fail the request.** If `caches.create` errors or the cache expired / was
  evicted, fall back to the inline prompt (§3, §6) — degrade to slower, never to broken.
- **Single Render worker** — keep every blocking call in `asyncio.to_thread` with a timeout so one
  stuck request can't pin the loop or exhaust the threadpool (already the pattern; preserve it in
  every new parallel path, §6, §8).
- **Streaming key fallback (§1)** — the `started` flag keeps fallback for the common case (failures
  cluster before the first token); accept the residual mid-stream risk as the price of live tokens.

## Already minimal — *grounding only* (no change to what's injected)

Live examiner (`observe_steps.py` — remaining steps + last 10 turns), case debrief,
study suggestion, supervisor insights — all already inject only what they need. This is about
**grounding (Lever B)**, not thinking budget: the live examiner's and supervisor's *thinking
levels* are still on the table and are handled in §9.

---

## Gates — run after each change; a regression BLOCKS that change (priority #2)

- **Tutor** (#1-#3, #5): `aurora_assert`
- **Patient + case grading** (#1, #4, #6): `station_assert` — confirm the patient still
  answers exam-finding questions correctly after the JSON trim, and grade scores don't
  drift after HIGH->MEDIUM.

## Honest tradeoffs

- Lowering thinking budgets can cost a little grading precision (measurable vs the harnesses).
- Live streaming weakens mid-stream key fallback (acceptable — failures cluster at the start).
- Trimming patient/grader grounding changes the prompt — re-baseline the harnesses.
