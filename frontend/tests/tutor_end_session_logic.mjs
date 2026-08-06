/* Pure unit test for the POST /api/end-session decision rule. Run with Node's type
   stripping (tutorSessionEnd.ts is dependency-free at runtime, mirrors leave_guard_logic.mjs):
     node --experimental-strip-types frontend/tests/tutor_end_session_logic.mjs

   /api/end-session is the ONLY code path that logs a tutor session (a chat_sessions row plus
   update_profile(source="tutor") — streak/XP) and, until this task, nothing in frontend/ ever
   called it. endSessionPayload is the pure "should this conversation be logged, and with what
   body" rule pulled out of Tutor.tsx so it is testable without mounting the screen: a
   conversation only counts once it has a completed exchange (a user message AND an assistant
   reply — not just a user message with a still-empty streaming placeholder) that goes beyond
   its resume baseline (see block 7), and the caller's own fire-once flag (`alreadySent`) makes
   a second call from either trigger point — unmounting, or starting a different conversation
   mid-thread — a no-op.

   deriveTopic is imported directly (a sibling .ts module, same precedent as
   session_export_logic.mjs importing stationTimer.ts) so the topic assertions below check
   AGREEMENT with the real rule rather than a hardcoded literal. tutorSessionEnd.ts cannot
   import deriveTopic itself and still run standalone (see its module comment), so it carries a
   private duplicate, firstUserMessageTopic — a copy that could silently drift from the original
   with nothing to catch it, unless a test in THIS file, which is free of that constraint,
   actually compares the two. */
import assert from "node:assert";
import { endSessionPayload } from "../src/aurora/lib/tutorSessionEnd.ts";
import { deriveTopic } from "../src/aurora/lib/tutorSessions.ts";

const user = (text, id = "u1") => ({ type: "user", id, text });
const ai = (text, id = "a1") => ({ type: "ai", id, text });

// 1) Empty thread ⇒ nothing to log.
{
  assert.strictEqual(endSessionPayload([], false), null, "an empty thread must not be logged");
}

// 2) A user message with no assistant reply yet (mid-turn) ⇒ nothing to log.
{
  assert.strictEqual(
    endSessionPayload([user("How do I measure IOP?")], false),
    null,
    "a dangling user message with no reply yet must not be logged",
  );
}

// 2b) An "ai" entry exists but is still the empty streaming placeholder — Tutor.tsx's
//     sendMessage pushes `{ type: "ai", content: "" }` the instant the stream opens, before
//     any text has arrived — so an "ai" entry existing is not on its own proof of a reply.
{
  assert.strictEqual(
    endSessionPayload([user("How do I measure IOP?"), ai("")], false),
    null,
    "an empty in-flight assistant bubble must not count as a completed reply",
  );
}

// 3) Already sent ⇒ the fire-once guard blocks a second send, even for an otherwise-complete
//    conversation. This is what survives a strict-mode double unmount or a stray re-render.
{
  const messages = [user("How do I measure IOP?"), ai("Use applanation tonometry.")];
  assert.strictEqual(endSessionPayload(messages, true), null, "an already-sent conversation must not resend");
}

// 4) A completed exchange ⇒ a real payload: the right shape, the right roles, token_count 0
//    (no usage figure is available client-side — the SSE stream carries text only), and a
//    topic that agrees with the real deriveTopic rule (not a hardcoded literal — see the
//    module comment on why this file, unlike tutorSessionEnd.ts, can import it directly).
{
  const messages = [user("How do I measure IOP?"), ai("Use applanation tonometry.")];
  const payload = endSessionPayload(messages, false);
  assert.ok(payload, "a completed exchange must be logged");
  assert.deepStrictEqual(payload.messages, [
    { role: "user", content: "How do I measure IOP?" },
    { role: "assistant", content: "Use applanation tonometry." },
  ]);
  assert.strictEqual(payload.topic, deriveTopic(messages),
    "the label staff read must equal the label the student sees in their own history");
  assert.strictEqual(payload.token_count, 0);
}

// 5) The topic is the FIRST user message, not the latest — a five-turn conversation groups
//    under the heading it opened with. Checked against the REAL deriveTopic, not a literal:
//    the two labels must read identically (design doc §6.2b), and only a live comparison can
//    catch the private duplicate drifting from the original if its rule ever changes.
{
  const messages = [
    user("Explain slit-lamp technique", "u1"),
    ai("Sure — it's a binocular microscope...", "a1"),
    user("What about the cobalt blue filter?", "u2"),
    ai("That's for fluorescein staining.", "a2"),
    user("And Seidel's test?", "u3"),
  ];
  const payload = endSessionPayload(messages, false);
  assert.ok(payload, "a multi-turn conversation must still be logged");
  assert.strictEqual(payload.topic, "Explain slit-lamp technique", "topic must be the FIRST user message, not the latest");
  assert.equal(payload.topic, deriveTopic(messages),
    "the label staff read must equal the label the student sees in their own history");
}

// 6) A long first message is truncated with an ellipsis. Asserted against deriveTopic itself,
//    not a hardcoded cap/ellipsis literal — this is the case the extraction exists to protect:
//    change the cap or the ellipsis in deriveTopic without touching the private duplicate here
//    and this assertion (unlike a literal) fails.
{
  const long = "A".repeat(80);
  const messages = [user(long), ai("ok")];
  const payload = endSessionPayload(messages, false);
  assert.equal(payload.topic, deriveTopic(messages),
    "the label staff read must equal the label the student sees in their own history");
}

// 7) The resume baseline (Fix for a real bug: resuming a stored conversation and leaving
//    without adding anything used to write a full duplicate row, because a resumed thread
//    already satisfies the completed-exchange check by construction). Direction one: resumed
//    4 messages, nothing added ⇒ no row, even though the thread itself is a complete exchange.
{
  const fourMessages = [
    user("Explain slit-lamp technique", "u1"),
    ai("Sure — it's a binocular microscope...", "a1"),
    user("What about the cobalt blue filter?", "u2"),
    ai("That's for fluorescein staining.", "a2"),
  ];
  assert.strictEqual(
    endSessionPayload(fourMessages, false, 4),
    null,
    "a resumed thread that gained nothing must not re-log content nothing new happened to",
  );

  // Direction two: resumed those same 4, then a real new exchange was added ⇒ logs, and the
  // topic is still the conversation's original opener (deriveTopic reads the first message of
  // the WHOLE thread, not the point it was resumed from).
  const sixMessages = fourMessages.concat([user("And Seidel's test?", "u3"), ai("It stains a leak green.", "a3")]);
  const payload = endSessionPayload(sixMessages, false, 4);
  assert.ok(payload, "a resumed thread that gained a real exchange must be logged");
  assert.strictEqual(payload.topic, deriveTopic(sixMessages));

  // The default (no third argument) behaves as baselineCount = 0 — every earlier block in
  // this file relies on that default staying correct.
  assert.ok(endSessionPayload(fourMessages, false, 0), "an un-resumed conversation (baseline 0) must log normally");
}

console.log("tutor_end_session_logic: all assertions passed");
