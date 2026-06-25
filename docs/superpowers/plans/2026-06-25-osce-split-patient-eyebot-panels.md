# OSCE Split Consult — Patient chat + EyeBot action panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single OSCE consult thread into a warm **Patient chat** (talk to the patient) and a cool **EyeBot action panel** (manual procedures + result + light AI coaching), kept in sync through one tagged transcript, in a Triptych layout that collapses to patient-only when a case has no manual actions.

**Architecture:** One ordered `messages` array is the single source of truth; each entry gains `channel: "patient" | "eyebot"`. Two filtered views render the two panes; `channel` is stripped before any backend call so request shapes are unchanged. A new lean `POST /api/cases/{id}/action` endpoint returns 1–2 sentence EyeBot coaching (result is already client-side and deterministic). The existing in-sequence gate (`stationGate.ts`) is untouched and feeds both panes.

**Tech Stack:** FastAPI + Pydantic + `tools/shared/gemini_client.ask` (Gemini, MINIMAL thinking) on the backend; Next.js 16 / React (client component) + plain CSS (`aurora.css`) on the frontend; Playwright integration harness (`frontend/tests/station_assert.mjs`) + pytest.

---

## Spec

`docs/superpowers/specs/2026-06-25-osce-split-patient-eyebot-panels-design.md`

## Test environment (read first)

**Backend (pytest):** runs in MOCK_MODE automatically (no `GEMINI_API_KEY`). From repo root:
```bash
python -m pytest tests/cases/test_station_endpoints.py -v
```

**Frontend type check:**
```bash
cd frontend && npm run typecheck
```

**Frontend integration harness (`station_assert.mjs`):** Next is configured with
`output: "standalone"` and `next start` is flaky, so build + run the standalone server
(per the project's harness convention), then run the harness against it:
```bash
cd frontend
npm run build
# copy static assets the standalone server needs
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
# start the server (background), then WARM the dynamic route before asserting (cold compile >15s)
node .next/standalone/server.js &   # serves http://127.0.0.1:3000
curl -s -o /dev/null --cookie "eyebot_token=pw-harness" http://127.0.0.1:3000/cases/C001
node tests/station_assert.mjs http://127.0.0.1:3000
```
Stop the server (it locks `.next/standalone`) before the next `npm run build`.

---

## Task 1: Backend — `POST /api/cases/{id}/action` (EyeBot coaching)

**Files:**
- Modify: `tools/shared/gemini_client.py` (add a `case_action` mock response)
- Modify: `tools/api/routers/cases.py` (request/response models + endpoint + prompt)
- Test: `tests/cases/test_station_endpoints.py`

- [ ] **Step 1: Add the mock response so MOCK_MODE returns a real coaching string**

In `tools/shared/gemini_client.py`, inside the `_MOCK_RESPONSES` dict (starts ~line 72),
add this entry (next to the existing `"case"` / `"debrief"` keys):

```python
    "case_action": (
        "Nicely done — you steadied the lid without pressing on the globe. "
        "Next time, take three readings and average them for reliability."
    ),
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/cases/test_station_endpoints.py`:

```python
def test_action_returns_coaching():
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": CASE}, clear=False):
        r = client.post(
            "/api/cases/case_test_station/action",
            json={
                "action_label": "Measure IOP",
                "technique": "Seat patient at the tonometer, look straight ahead, take three readings and average.",
                "finding": "IOP R 18 mmHg · L 20 mmHg",
            },
            cookies=_cookie(),
        )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["coaching"], str)
    assert body["coaching"]  # non-empty in MOCK_MODE


def test_action_degrades_gracefully_on_model_error():
    with patch.dict("tools.api.shared._case_cache", {"case_test_station": CASE}, clear=False), \
         patch("tools.api.routers.cases.ask", side_effect=RuntimeError("model down")):
        r = client.post(
            "/api/cases/case_test_station/action",
            json={"action_label": "Measure IOP", "technique": "x" * 12, "finding": ""},
            cookies=_cookie(),
        )
    assert r.status_code == 200
    assert r.json()["coaching"] == ""  # never errors the request; empty coaching
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/cases/test_station_endpoints.py::test_action_returns_coaching tests/cases/test_station_endpoints.py::test_action_degrades_gracefully_on_model_error -v`
Expected: FAIL — 404 (route does not exist yet).

- [ ] **Step 4: Add the models + endpoint**

In `tools/api/routers/cases.py`, add these models next to `ObserveRequest`/`ObserveResponse`
(~line 193–198):

```python
class ActionRequest(BaseModel):
    action_label: str = Field(max_length=120)
    technique: str = Field(max_length=2000)
    finding: str = Field(default="", max_length=2000)

class ActionResponse(BaseModel):
    coaching: str = ""
```

Add this prompt constant near `_COACHING_SCHEMA` (~line 33):

```python
ACTION_COACH = (
    "You are EyeBot, a friendly OSCE examiner for allied-health ophthalmic students. "
    "Given a manual procedure, the student's described technique, and the measured finding, "
    "reply in 1-2 short sentences: acknowledge one thing done well and give at most one "
    "concrete technique tip. Be encouraging and specific. Never invent a different result "
    "or add a medical diagnosis."
)
```

Add the endpoint right after `observe_case` (~line 547). It mirrors `observe_case`'s
signature (the `request: Request` param is required by the `@limiter.limit` decorator):

```python
@router.post("/api/cases/{case_id}/action", response_model=ActionResponse)
@limiter.limit("40/minute")
async def case_action(case_id: str, request: Request, body: ActionRequest,
                      current_user: CurrentUser = Depends(get_current_user)):
    """EyeBot micro-coaching for one manual procedure: a 1-2 sentence technique note.
    The deterministic result is shown client-side regardless; this only adds the note and
    NEVER blocks the tick — any failure returns empty coaching (graceful degradation)."""
    # Student free-text → filter like /chat before the model sees it.
    try:
        guard = await filter_input(body.technique, patient_context=True)
        if not guard["safe"]:
            return ActionResponse(coaching="")
    except Exception:
        pass

    user_msg = (
        f"Procedure: {body.action_label}\n"
        f"Student technique: {body.technique}\n"
        f"Measured finding: {body.finding or '(none)'}"
    )
    try:
        coaching = await asyncio.wait_for(
            asyncio.to_thread(
                ask,
                system_prompt=ACTION_COACH,
                messages=[{"role": "user", "content": user_msg}],
                max_tokens=220,            # 1-2 sentences; MINIMAL = no thinking, so no starve
                feature="case_action",
                model=MODEL,
                thinking_level="MINIMAL",
            ),
            timeout=12.0,                  # single-worker safety: never hang the event loop
        )
    except Exception:
        coaching = ""
    return ActionResponse(coaching=(coaching or "").strip())
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/cases/test_station_endpoints.py -v`
Expected: PASS (all tests in the file, including the two new ones).

- [ ] **Step 6: Commit**

```bash
git add tools/shared/gemini_client.py tools/api/routers/cases.py tests/cases/test_station_endpoints.py
git commit -m "feat(osce): EyeBot /action endpoint — lean technique coaching for manual procedures"
```

---

## Task 2: Frontend — `PatientChat` component (warm patient pane)

**Files:**
- Create: `frontend/src/aurora/components/PatientChat.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/aurora/components/PatientChat.tsx` with exactly:

```tsx
"use client";
/* PatientChat — the warm "talk to the patient" pane of the OSCE station. Renders
   only patient-channel messages as a consult thread + a free-typed composer. Pure
   conversation: vocal/history steps are typed here and the examiner (/observe)
   auto-ticks them. Presentational — all state lives in CaseSession. */
import { type KeyboardEvent, type RefObject } from "react";

interface PatientMessage { role: "user" | "assistant"; content: string }

export function PatientChat({
  patientName,
  messages,
  input,
  sending,
  isStreaming,
  hasResult,
  endRef,
  onInputChange,
  onSend,
  onKeyDown,
}: {
  patientName: string;
  messages: PatientMessage[];
  input: string;
  sending: boolean;
  isStreaming: boolean;
  hasResult: boolean;
  endRef: RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <section className="aurora-station-card aurora-station-main aurora-patient" data-testid="patient-pane">
      <div className="aurora-pane-head aurora-patient-head">
        <span className="aurora-pane-dot" aria-hidden />
        <div>
          <div className="aurora-pane-nm">{patientName}</div>
          <div className="aurora-pane-mt">Patient · talk to take a history</div>
        </div>
      </div>

      <div className="aurora-station-thread">
        {messages.length === 0 && !hasResult && (
          <p className="aurora-station-hint">Greet your patient and begin taking a history. Manual tests are done with EyeBot.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`aurora-station-bubble ${m.role === "user" ? "me" : "pt"}`}>
            <span className="who">{m.role === "user" ? "You" : patientName}</span>
            <div>
              {m.content}
              {isStreaming && i === messages.length - 1 && m.role === "assistant" && <span className="aurora-caret" />}
            </div>
          </div>
        ))}
        {sending && <div className="aurora-station-bubble pt"><div className="aurora-typing">•••</div></div>}
        <div ref={endRef} />
      </div>

      {!hasResult && (
        <div className="aurora-station-composer">
          <textarea
            className="aurora-station-composer-input"
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Talk to your patient…"
            rows={1}
          />
          <button
            type="button"
            className="aurora-station-composer-send"
            onClick={onSend}
            disabled={!input.trim() || sending || isStreaming}
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd frontend && npm run typecheck`
Expected: PASS (no errors). The component is not yet imported anywhere — that is fine.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/PatientChat.tsx
git commit -m "feat(osce): PatientChat pane component (warm, patient-channel only)"
```

---

## Task 3: Frontend — `EyeBotPanel` component (cool action pane)

**Files:**
- Create: `frontend/src/aurora/components/EyeBotPanel.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/aurora/components/EyeBotPanel.tsx` with exactly:

```tsx
"use client";
/* EyeBotPanel — the cool "talk to EyeBot" pane: hands-on manual procedures only.
   The student picks a procedure chip (ActionPalette), types their technique, and
   EyeBot replies with the deterministic reading + a short coaching note. Renders
   only eyebot-channel messages. Presentational — state lives in CaseSession. */
import { ActionPalette, type ExamAction } from "@/aurora/components/ActionPalette";

const EXAM_PREFIX = "[Examination performed: ";

interface EyeBotMessage { role: "user" | "assistant"; content: string }

export function EyeBotPanel({
  messages,
  actions,
  ticked,
  current,
  activeProcedure,
  procText,
  coaching,
  showActions,
  busy,
  onPerform,
  onProcText,
  onConfirm,
  onCancel,
}: {
  messages: EyeBotMessage[];
  actions: ExamAction[];
  ticked: Set<number>;
  current: number | null;
  activeProcedure: ExamAction | null;
  procText: string;
  coaching: boolean;
  showActions: boolean;
  busy: boolean;
  onPerform: (action: ExamAction) => void;
  onProcText: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="aurora-station-card aurora-station-main aurora-eyebot" data-testid="eyebot-pane">
      <div className="aurora-pane-head aurora-eyebot-head">
        <span className="aurora-pane-dot" aria-hidden />
        <div>
          <div className="aurora-pane-nm">EyeBot</div>
          <div className="aurora-pane-mt">Manual procedures · examiner</div>
        </div>
      </div>

      <div className="aurora-station-thread aurora-eyebot-thread">
        {messages.length === 0 && (
          <p className="aurora-station-hint">Pick a procedure below, then describe your technique. EyeBot returns the reading and a quick tip.</p>
        )}
        {messages.map((m, i) => {
          if (m.role === "user" && m.content.startsWith(EXAM_PREFIX)) {
            const inner = m.content.slice(EXAM_PREFIX.length, -1); // strip prefix + trailing "]"
            const arrow = inner.indexOf(" → ");
            const label = arrow >= 0 ? inner.slice(0, arrow) : inner;
            const body = arrow >= 0 ? inner.slice(arrow + 3) : "";
            const sep = " · Result: ";
            const cut = body.indexOf(sep);
            const technique = cut >= 0 ? body.slice(0, cut) : body;
            const resultText = cut >= 0 ? body.slice(cut + sep.length) : "";
            return (
              <div key={i} className="aurora-station-reveal">
                <span className="rl2">Examination performed · {label}</span>
                {technique && <div className="v">{technique}</div>}
                {resultText && <div className="rs">Result · {resultText}</div>}
              </div>
            );
          }
          return (
            <div key={i} className="aurora-station-bubble bot">
              <span className="who">EyeBot</span>
              <div>{m.content}</div>
            </div>
          );
        })}
        {coaching && <div className="aurora-station-bubble bot"><div className="aurora-typing">•••</div></div>}
      </div>

      {showActions && (
        <>
          <ActionPalette
            actions={actions}
            ticked={ticked}
            current={current}
            activeKey={activeProcedure?.key ?? null}
            onPerform={onPerform}
          />
          {activeProcedure && (
            <div className="aurora-station-proc">
              <div className="aurora-station-proc-cap">
                <span><b>{activeProcedure.label}</b> — type the steps &amp; safety rules you'd follow</span>
                <button type="button" className="aurora-station-proc-x" onClick={onCancel}>Cancel</button>
              </div>
              <div className="aurora-station-composer">
                <textarea
                  className="aurora-station-composer-input aurora-station-proc-input"
                  value={procText}
                  onChange={(e) => onProcText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onConfirm(); } }}
                  placeholder={`How you perform ${activeProcedure.label.toLowerCase()} — key steps, what you tell the patient, safety checks…`}
                  rows={2}
                  autoFocus
                />
                <button
                  type="button"
                  className="aurora-station-composer-send aurora-station-proc-go"
                  onClick={onConfirm}
                  disabled={busy || procText.trim().length < 12}
                  aria-label="Log procedure"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd frontend && npm run typecheck`
Expected: PASS. (Not imported yet — fine.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/aurora/components/EyeBotPanel.tsx
git commit -m "feat(osce): EyeBotPanel pane component (cool, eyebot-channel + procedure box)"
```

---

## Task 4: Frontend — rewire `CaseSession` (channel transcript + two panes + /action)

**Files:**
- Modify: `frontend/src/aurora/screens/CaseSession.tsx`

This task converts the single-thread screen to the tagged-transcript two-pane screen. Make
the edits below in order.

- [ ] **Step 1: Import the two new panes**

Replace the import of `ActionPalette` (line 15) — `ActionPalette` is now used only inside
`EyeBotPanel`, so `CaseSession` imports the panes instead but still needs the `ExamAction`
type:

```tsx
import { type ExamAction } from "@/aurora/components/ActionPalette";
import { PatientChat } from "@/aurora/components/PatientChat";
import { EyeBotPanel } from "@/aurora/components/EyeBotPanel";
```

- [ ] **Step 2: Add `channel` to the message type**

Replace the `ChatMessage` interface (line 27):

```tsx
type Channel = "patient" | "eyebot";
interface ChatMessage { role: "user" | "assistant"; content: string; channel: Channel }
```

- [ ] **Step 3: Add coaching-pending state + an API-strip helper**

After the `const [isStreaming, setIsStreaming] = useState(false);` line (~line 63), add BOTH
the new state and the strip helper here (co-located so `toApi` is defined before `runObserve`
references it):

```tsx
  const [coachingPending, setCoachingPending] = useState(false);

  // Backend reads only {role, content}; `channel` is a frontend view key. Strip it so
  // request bodies are byte-identical to today (no Pydantic extra-field breakage).
  const toApi = (msgs: ChatMessage[]) => msgs.map(({ role, content }) => ({ role, content }));
```

- [ ] **Step 4: Rewrite `sendMessage` to be patient-channel + send patient-only context**

Replace the whole `sendMessage` function (lines ~175–232) with:

```tsx
  const sendMessage = async (textArg?: string) => {
    const content = (textArg ?? input).trim();
    if (!content || sending || isStreaming || !caseId) return;
    const updated: ChatMessage[] = [...messages, { role: "user", content, channel: "patient" }];
    setMessages(updated);
    if (textArg === undefined) setInput("");
    setSending(true);
    try {
      // Only the patient conversation is sent as context — EyeBot exam chatter is excluded.
      const patientHistory = toApi(updated.filter((m) => m.channel === "patient"));
      const res = await fetch(`/api/cases/${caseId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: patientHistory }),
      });
      if (!res.ok || !res.body) throw new Error("Stream unavailable");
      setMessages((prev) => [...prev, { role: "assistant", content: "", channel: "patient" }]);
      setSending(false);
      setIsStreaming(true);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { text: string };
            if (parsed.text) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === "assistant" && last.channel === "patient")
                  return [...prev.slice(0, -1), { ...last, content: last.content + parsed.text }];
                return prev;
              });
              endRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const fb = "(I'm having trouble reaching the service right now.)";
        if (last && last.role === "assistant" && last.channel === "patient")
          return [...prev.slice(0, -1), { ...last, content: fb }];
        return [...prev, { role: "assistant", content: fb, channel: "patient" }];
      });
    } finally {
      setSending(false);
      setIsStreaming(false);
      scheduleObserve(); // run the examiner after the patient reply completes
    }
  };
```

- [ ] **Step 5: Guard `performAction` during a patient stream (avoid the append race)**

Replace `performAction` (lines ~238–242) with (adds the `sending || isStreaming` guard so a
chip can't open procedure mode while the patient reply is streaming — keeps the streaming
"last message" invariant safe):

```tsx
  const performAction = (a: ExamAction) => {
    if (sending || isStreaming) return; // don't interleave with a live patient stream
    if (a.satisfies_steps.every((n) => tickedRef.current.has(n))) return;
    setActiveProcedure(a);
    setProcText("");
  };
```

- [ ] **Step 6: Rewrite `confirmProcedure` to be eyebot-channel + fire `/action`; add `runAction`**

Replace `confirmProcedure` (lines ~246–256) with:

```tsx
  // Confirm the typed technique: post one eyebot-channel reveal (technique + finding) so the
  // step ticks and the grader sees the technique, then ask EyeBot for a short coaching note.
  const confirmProcedure = () => {
    const a = activeProcedure;
    const steps = procText.trim();
    if (!a || steps.length < 12) return;
    const resultText = a.reveal_text ? ` · Result: ${a.reveal_text}` : "";
    setMessages((prev) => [...prev, { role: "user", content: `${EXAM_PREFIX}${a.label} → ${steps}${resultText}]`, channel: "eyebot" }]);
    addAuto(a.satisfies_steps);
    setActiveProcedure(null);
    setProcText("");
    scheduleObserve();
    void runAction(a, steps);
  };

  // EyeBot micro-coaching. Non-blocking + graceful: the result is already shown and the step
  // already ticked, so a failure just means no coaching bubble.
  const runAction = async (a: ExamAction, technique: string) => {
    if (!caseId) return;
    setCoachingPending(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action_label: a.label, technique, finding: a.reveal_text }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { coaching?: string };
      if (data.coaching) setMessages((prev) => [...prev, { role: "assistant", content: data.coaching!, channel: "eyebot" }]);
    } catch {
      /* graceful: result already shown, no coaching */
    } finally {
      setCoachingPending(false);
    }
  };
```

- [ ] **Step 7: Strip `channel` in `runObserve` and `handleSubmit`**

In `runObserve` (~line 133), change the body's `messages` to strip channel:

```tsx
        body: JSON.stringify({ messages: toApi(messagesRef.current.slice(-100)), already_ticked: Array.from(tickedRef.current) }),
```

In `handleSubmit` (~line 273), change the body's `messages` to strip channel:

```tsx
        body: JSON.stringify({ messages: toApi(messages), findings: findings.trim(), recommendation: recommendation.trim(), performed_steps: Array.from(ticked) }),
```

- [ ] **Step 8: Add derived pane data above the `return`**

After `const gateStep = ...` (~line 288) add:

```tsx
  const patientMessages = messages.filter((m) => m.channel === "patient").map(({ role, content }) => ({ role, content }));
  const eyebotMessages = messages.filter((m) => m.channel === "eyebot").map(({ role, content }) => ({ role, content }));
  const manualActions = (station?.examination_actions ?? []).filter((a) => a.kind === "manual");
  const hasEyebot = manualActions.length > 0;
```

- [ ] **Step 9: Replace the grid body with the two panes**

Replace the entire `<div className="aurora-station-grid"> … </div>` block (lines ~323–432) —
the left `<aside>` (patient card + checklist + submit) is **unchanged**; the right
`.aurora-station-main` block (thread + ActionPalette + composer) is **removed** and replaced
by `<PatientChat>` + conditional `<EyeBotPanel>`:

```tsx
      <div className="aurora-station-grid" data-eyebot={hasEyebot ? "true" : "false"}>
        {/* Left — patient + auto-tracked checklist (unchanged) */}
        <aside className="aurora-station-card aurora-station-aside">
          {caseInfo && (
            <>
              <div className="aurora-station-pt">
                <div className="aurora-station-ring"><img className="aurora-station-av" src={PLATE.caseSession} alt="" aria-hidden onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /></div>
                <div>
                  <div className="aurora-station-nm">{caseInfo.patient.name}</div>
                  <div className="aurora-station-mt">{caseInfo.patient.age} years · {caseInfo.topic}</div>
                </div>
              </div>
              <div className="aurora-station-cc">“{caseInfo.patient.presenting_complaint}”</div>
            </>
          )}
          {station && (
            <div className="aurora-station-clscroll">
              <StationChecklist
                procedureName={station.checklist.procedure_name}
                phases={phases}
                totalSteps={station.checklist.total_steps}
                ticked={ticked}
                autoSteps={autoSteps}
                current={gateStep}
                onToggle={toggleStep}
              />
            </div>
          )}
          {station && !result && (
            <button type="button" className="aurora-station-submit-toggle" onClick={() => setShowSubmit(true)}>
              Submit handover →
            </button>
          )}
        </aside>

        {/* Middle — patient consult (warm) */}
        <PatientChat
          patientName={caseInfo?.patient.name ?? "Patient"}
          messages={patientMessages}
          input={input}
          sending={sending}
          isStreaming={isStreaming}
          hasResult={!!result}
          endRef={endRef}
          onInputChange={setInput}
          onSend={() => sendMessage()}
          onKeyDown={onKeyDown}
        />

        {/* Right — EyeBot manual procedures (cool); hidden when the case has none */}
        {hasEyebot && station && (
          <EyeBotPanel
            messages={eyebotMessages}
            actions={manualActions}
            ticked={ticked}
            current={gateStep}
            activeProcedure={activeProcedure}
            procText={procText}
            coaching={coachingPending}
            showActions={!result}
            busy={sending || isStreaming}
            onPerform={performAction}
            onProcText={setProcText}
            onConfirm={confirmProcedure}
            onCancel={cancelProcedure}
          />
        )}
      </div>
```

- [ ] **Step 10: Verify type check passes**

Run: `cd frontend && npm run typecheck`
Expected: PASS. If `ExamAction` is reported unused, confirm it is referenced in
`performAction`/`runAction` signatures (it is). No other screen imports change.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/aurora/screens/CaseSession.tsx
git commit -m "feat(osce): split CaseSession into Patient + EyeBot panes via one tagged transcript"
```

---

## Task 5: Frontend — Triptych CSS + warm/cool pane themes + collapse + mobile

**Files:**
- Modify: `frontend/src/aurora/aurora.css`

The current right pane is themed dark ("Consult after dark"); the redesign replaces it with
two light panes. The handover form + debrief now live in `.aurora-station-overlay` (not in
`.aurora-station-main`), so the dark `.aurora-station-main .aurora-station-form / .aurora-input
/ .aurora-station-debrief / .aurora-toggle` rules are dead and are dropped here.

- [ ] **Step 1: Make the grid a Triptych (with collapse) — replace line 1162**

Replace:
```css
.aurora-station-grid { display: grid; grid-template-columns: 360px 1fr; gap: 16px; align-items: stretch; flex: 1; min-height: 0; overflow: hidden; }
```
with:
```css
.aurora-station-grid { display: grid; grid-template-columns: 360px minmax(0,1fr); gap: 16px; align-items: stretch; flex: 1; min-height: 0; overflow: hidden; }
.aurora-station-grid[data-eyebot="true"] { grid-template-columns: 320px minmax(0,1fr) minmax(0,1fr); }
```

- [ ] **Step 2: Replace the dark "Consult after dark" block with light warm/cool pane themes**

Replace the entire block from the `/* ── Consult after dark … */` comment (line ~1322)
through the `.aurora-station-main .aurora-toggle:hover { … }` rule (line ~1414) with:

```css
/* ── Two-pane consult: warm Patient chat + cool EyeBot panel ─────────────────
   Both panes share the .aurora-station-main structure and the light mesh shell, so
   they read as one station; only their accent tokens differ (coral vs blue). The
   handover form + debrief live in the overlay, not here. */
.aurora-station-main { min-width: 0; }

/* shared slim pane header */
.aurora-pane-head { display: flex; align-items: center; gap: 9px; margin-bottom: 10px; padding-bottom: 9px; border-bottom: 1px solid rgba(120,90,170,.16); }
.aurora-pane-dot { width: 30px; height: 30px; flex: none; border-radius: 50%; }
.aurora-pane-nm { font-size: 14.6px; font-weight: 700; color: var(--ink); }
.aurora-pane-mt { font-size: 11px; color: var(--ink-2); margin-top: 1px; }
.aurora-station-bubble.bot { background: rgba(66,133,244,.08); border: 1px solid rgba(66,133,244,.22); color: var(--ink); align-self: flex-start; }
.aurora-station-bubble.bot .who { color: #185FA5; }

/* Patient pane — warm coral */
.aurora-patient .aurora-pane-dot { background: linear-gradient(135deg, #D85A30, #F0997B); }
.aurora-patient .aurora-pane-head { border-bottom-color: rgba(216,90,48,.22); }
.aurora-patient .aurora-station-bubble.me { background: linear-gradient(135deg, #D85A30, #E07A4F); box-shadow: 0 8px 22px -10px rgba(216,90,48,.5); }
.aurora-patient .aurora-station-bubble.pt { background: rgba(250,236,231,.85); border-color: rgba(240,153,123,.4); color: var(--ink); }
.aurora-patient .aurora-station-composer-send { background: linear-gradient(135deg, #D85A30, #E07A4F); }
.aurora-patient .aurora-station-composer-input:focus-visible { border-color: #D85A30; box-shadow: 0 0 0 3px rgba(216,90,48,.16); }

/* EyeBot pane — cool blue */
.aurora-eyebot .aurora-pane-dot { background: linear-gradient(135deg, #185FA5, #378ADD); }
.aurora-eyebot .aurora-pane-head { border-bottom-color: rgba(24,95,165,.22); }
.aurora-eyebot .aurora-station-composer-send { background: linear-gradient(135deg, #185FA5, #378ADD); }
.aurora-eyebot .aurora-station-composer-input:focus-visible { border-color: #378ADD; box-shadow: 0 0 0 3px rgba(55,138,221,.16); }
/* cool chips */
.aurora-eyebot .aurora-pchip { border-color: rgba(55,138,221,.3); background: rgba(230,241,251,.6); color: #185FA5; }
.aurora-eyebot .aurora-pchip:hover:not(:disabled) { border-color: #378ADD; color: #0C447C; }
.aurora-eyebot .aurora-pchip[data-active="true"] { border-color: #185FA5; background: rgba(55,138,221,.16); color: #0C447C; }
.aurora-eyebot .aurora-pchip[data-active="true"] .ic { color: #185FA5; }
```

- [ ] **Step 3: Add the collapse + mobile-stack overrides inside the 880px media query**

Inside `@media (max-width: 880px)` (after line 1303, before the closing `}` at line 1304),
add:

```css
  .aurora-station-grid[data-eyebot="true"] { grid-template-columns: 1fr; }
  .aurora-eyebot { height: auto; overflow: visible; }
  .aurora-eyebot-thread { overflow: visible; flex: none; min-height: 220px; }
```

- [ ] **Step 4: Build the standalone server and run the harness to confirm no visual/structural regression**

Follow the **Test environment** commands above (build → copy assets → run server → warm
`/cases/C001` → run harness). The harness will still have its OLD assertions at this point —
expect it to FAIL on the new two-pane assertions (added in Task 6). It must, however, get
past the early structural checks (one h1, phase rail = 3, 6 steps, independent scroll). If it
dies before the palette checks, fix the height-chain / grid CSS before continuing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/aurora/aurora.css
git commit -m "style(osce): triptych grid + warm patient / cool EyeBot pane themes (replace dark consult)"
```

---

## Task 6: Update the Playwright harness + run it green

**Files:**
- Modify: `frontend/tests/station_assert.mjs`

- [ ] **Step 1: Add the `/action` mock and a no-manual C002 station mock**

After the `**/api/cases/C001/submit**` route block (ends line ~67), insert:

```js
await ctx.route("**/api/cases/C001/action", (r) => r.fulfill(J({
  coaching: "Good — steady hand, you kept clear of the globe. Average three readings next time.",
})));
// C002 — a case with NO manual actions (all verbal) → EyeBot pane must collapse away.
await ctx.route("**/api/cases/C002/station", (r) => r.fulfill(J({
  case: { case_id: "C002", title: "Diet screening", difficulty: "beginner", topic: "Counselling", estimated_minutes: 8,
          patient: { name: "Mdm Lim", age: 68, presenting_complaint: "Here for a pre-clinic diet screen." } },
  checklist: {
    procedure_name: "Pre-clinic screening", source: "checklist", total_steps: 2, critical_count: 0,
    phases: [
      { phase: 1, name: "Preparation & Identification", steps: [
        { step_number: 1, action: "Identify patient — name + NRIC", critical: false, category: "patient_identification", notes: null } ] },
      { phase: 2, name: "Clinical Assessment", steps: [
        { step_number: 2, action: "Screen for special diet", critical: false, category: "history", notes: null } ] },
    ],
  },
  examination_actions: [
    { key: "s1", label: "Identify patient", reveal_text: "", satisfies_steps: [1], mode: "do", prompt_text: "", phase: 1, critical: false, step_number: 1, kind: "verbal" },
    { key: "s2", label: "Screen for special diet", reveal_text: "", satisfies_steps: [2], mode: "say", prompt_text: "Do you follow any special diet?", phase: 2, critical: false, step_number: 2, kind: "verbal" },
  ],
})));
```

- [ ] **Step 2: Add a two-pane assertion right after the existing palette check (after line ~131, `ok("palette shows manual procedures only…")`)**

```js
// 5p. the split: a warm patient pane + a cool EyeBot pane; manual chips live in EyeBot only.
if (!(await p.locator('[data-testid="patient-pane"]').count())) die("missing the patient chat pane");
if (!(await p.locator('[data-testid="eyebot-pane"]').count())) die("missing the EyeBot action pane");
if (await p.locator('[data-testid="patient-pane"] .aurora-pchip').count()) die("manual chips must NOT be in the patient pane");
if (!(await p.locator('[data-testid="eyebot-pane"] .aurora-pchip:has-text("Measure IOP")').count())) die("Measure IOP chip must live in the EyeBot pane");
ok("two distinct panes; manual chips live in the EyeBot pane only");
```

- [ ] **Step 3: Add a coaching-reply assertion at the end of the procedure-confirm block (after line ~162, `ok("manual chip → procedure mode → confirm…")`)**

```js
// 5c. EyeBot replies with a coaching note (result + tip) after the procedure confirms.
await p.waitForSelector('.aurora-station-bubble.bot', { timeout: 6000 });
if (!(await p.locator('.aurora-station-bubble.bot:has-text("steady hand")').count())) die("EyeBot did not reply with coaching after confirm");
ok("EyeBot replies with coaching after a manual procedure");
```

- [ ] **Step 4: Add the collapse assertion just before the mobile check (before line ~189, `// 8. mobile…`)**

```js
// 7b. a case with NO manual actions renders the patient chat only — no EyeBot pane.
await p.goto(base + "/cases/C002", { waitUntil: "domcontentloaded" });
await p.waitForSelector('[data-testid="station"]', { timeout: 15000 });
if (await p.locator('[data-testid="eyebot-pane"]').count()) die("no-manual case must NOT render the EyeBot pane");
if (!(await p.locator('[data-testid="patient-pane"]').count())) die("patient pane must still render in the no-manual case");
ok("no manual actions → EyeBot pane collapses (patient chat only)");
```

(The existing `// 8. mobile` overflow check then runs on C002, which is fine.)

- [ ] **Step 5: Rebuild + run the harness; iterate until green**

Stop any running standalone server, then run the **Test environment** commands again
(build → copy assets → run server → warm `/cases/C001` → `node tests/station_assert.mjs http://127.0.0.1:3000`).
Expected final line: `ALL STATION ASSERTIONS PASSED`. Fix CSS/TSX and re-run until green. If
the `5c` coaching bubble is not found, confirm the `/action` mock route pattern matches and
that `runAction` appends an `eyebot`-channel assistant message.

- [ ] **Step 6: Commit**

```bash
git add frontend/tests/station_assert.mjs
git commit -m "test(osce): harness asserts split panes, EyeBot coaching, and no-manual collapse"
```

---

## Task 7: Full verification + ship

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

Run: `python -m pytest tests/cases -q`
Expected: all pass (no regressions in checklist/observe/submit/action tests).

- [ ] **Step 2: Frontend type check + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: type check clean; production build succeeds.

- [ ] **Step 3: Harness green (final confirmation)**

Run the **Test environment** harness commands once more on the fresh build.
Expected: `ALL STATION ASSERTIONS PASSED`.

- [ ] **Step 4: Push (per the project's auto-push convention)**

```bash
git push
```

- [ ] **Step 5: Manual smoke (optional but recommended)**

With the standalone server running, open `/cases/C001`, confirm: patient chat is warm and
streams; EyeBot panel is cool; clicking a manual chip opens the procedure box in the EyeBot
pane; confirming shows the reveal + a coaching bubble; the checklist still gates in order;
submit opens the handover overlay and the Station-100 debrief. Open a no-manual case and
confirm the EyeBot pane is absent.

---

## Self-review notes (spec coverage)

- Tagged transcript / two views → Task 4 (steps 2, 8) + Tasks 2/3 render filtered messages.
- `channel` stripped before backend → Task 4 step 3 (`toApi`), steps 4/7.
- Triptych + collapse → Task 5 (steps 1, 3) + Task 4 step 9 (`hasEyebot` / `data-eyebot`).
- Procedure-mode shortcuts moved to EyeBot → Task 3 + Task 4 step 9.
- Patient chat free-typed only → Task 2 (no chips) + Task 4 step 4 (patient-only context).
- EyeBot result + light AI coaching → Task 1 (endpoint) + Task 4 step 6 (`runAction`).
- Lean / non-blocking / graceful → Task 1 step 4 (`to_thread` + `wait_for` + try/except; MINIMAL).
- Gate preserved → unchanged `stationGate.ts`; `gateStep` passed to both panes (Task 4 step 9).
- Colors coral/blue on light shell → Task 5 step 2.
- Tests → Task 1 (pytest) + Task 6 (harness: panes, coaching, collapse, gating retained).
```
