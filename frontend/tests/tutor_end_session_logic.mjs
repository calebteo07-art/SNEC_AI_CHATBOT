/* Pure unit test for the POST /api/end-session decision rule. Run with Node's type
   stripping (tutorSessionEnd.ts is dependency-free at runtime, mirrors leave_guard_logic.mjs):
     node --experimental-strip-types frontend/tests/tutor_end_session_logic.mjs

   /api/end-session is the ONLY code path that logs a tutor session (a chat_sessions row plus
   update_profile(source="tutor") — streak/XP) and, until this task, nothing in frontend/ ever
   called it. endSessionPayload is the pure "should this conversation be logged, and with what
   body" rule pulled out of Tutor.tsx so it is testable without mounting the screen: a
   conversation only counts once it has a completed exchange (a user message AND an assistant
   reply — not just a user message with a still-empty streaming placeholder), and the caller's
   own fire-once flag (`alreadySent`) makes a second call from either trigger point — unmounting,
   or starting a different conversation mid-thread — a no-op. */
import assert from "node:assert";
import { endSessionPayload } from "../src/aurora/lib/tutorSessionEnd.ts";

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
//    (no usage figure is available client-side — the SSE stream carries text only).
{
  const messages = [user("How do I measure IOP?"), ai("Use applanation tonometry.")];
  const payload = endSessionPayload(messages, false);
  assert.ok(payload, "a completed exchange must be logged");
  assert.deepStrictEqual(payload.messages, [
    { role: "user", content: "How do I measure IOP?" },
    { role: "assistant", content: "Use applanation tonometry." },
  ]);
  assert.strictEqual(payload.topic, "How do I measure IOP?");
  assert.strictEqual(payload.token_count, 0);
}

// 5) The topic is the FIRST user message, not the latest — a five-turn conversation groups
//    under the heading it opened with, matching tutorSessions.deriveTopic and the student's
//    own recent-conversations list (design doc §6.2b: the two labels must read identically).
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
}

// 6) A long first message is truncated with an ellipsis at the same 60-char cap as
//    tutorSessions.deriveTopic — the two labels must stay byte-for-byte identical.
{
  const long = "A".repeat(80);
  const payload = endSessionPayload([user(long), ai("ok")], false);
  assert.strictEqual(payload.topic, "A".repeat(59) + "…");
}

console.log("tutor_end_session_logic: all assertions passed");
