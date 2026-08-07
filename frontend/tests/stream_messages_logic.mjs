/* Pure unit test for streaming-message identity in the OSCE station.
     node --experimental-strip-types frontend/tests/stream_messages_logic.mjs

   Regression: an action-panel grade card landing mid-stream silently discarded the rest
   of the patient's reply. The chunk accumulator addressed `prev[prev.length - 1]` and
   returned `prev` verbatim when that was not the patient placeholder, so every chunk
   after an unrelated append was thrown away — and with it the transcript that /observe,
   /submit and the session export all read. The patient's reply froze mid-sentence with
   the caret still blinking, and the student was graded on a cut transcript. */
import assert from "node:assert";
import { appendChunk, hasMessage, patchMessage } from "../src/aurora/lib/streamMessages.ts";

const msg = (id, content, role = "assistant") => ({ id, content, role, channel: "patient" });

// 1) The ordinary case: chunks accumulate on the addressed message.
{
  let ms = [msg("u1", "Good morning.", "user"), msg("p1", "")];
  ms = appendChunk(ms, "p1", "My eye has ");
  ms = appendChunk(ms, "p1", "been red for two days.");
  assert.strictEqual(ms[1].content, "My eye has been red for two days.");
}

// 2) THE BUG: a grade card lands mid-stream. Under the positional accumulator every
//    later chunk was dropped; by id the reply completes regardless of what arrived.
{
  let ms = [msg("p1", "My eye has ")];
  ms = [...ms, msg("g1", "[[GRADE]]{...}")];           // runAction, unawaited, seconds later
  ms = appendChunk(ms, "p1", "been red for two days.");
  assert.strictEqual(ms[0].content, "My eye has been red for two days.",
    "the streamed reply must survive an append from another channel");
  assert.strictEqual(ms[1].content, "[[GRADE]]{...}", "the interloper is untouched");
  assert.strictEqual(ms.length, 2);
}

// 3) Several interlopers, and one arriving between every chunk.
{
  let ms = [msg("p1", "")];
  for (let i = 0; i < 5; i++) {
    ms = appendChunk(ms, "p1", `${i}`);
    ms = [...ms, msg(`x${i}`, "noise")];
  }
  assert.strictEqual(ms[0].content, "01234");
  assert.strictEqual(ms.length, 6);
}

// 4) A message that is gone returns the SAME array — no crash, no phantom append.
{
  const ms = [msg("p1", "hello")];
  const out = appendChunk(ms, "nope", "x");
  assert.strictEqual(out, ms, "a missing id must be a no-op, and must not copy");
}

// 5) patchMessage replaces (the error path) as well as appends, and never mutates.
{
  const ms = [msg("p1", "half a sen")];
  const out = patchMessage(ms, "p1", () => "(I'm having trouble reaching the service.)");
  assert.strictEqual(out[0].content, "(I'm having trouble reaching the service.)");
  assert.strictEqual(ms[0].content, "half a sen", "input must not be mutated");
  assert.notStrictEqual(out, ms, "a real change must produce a new array");
}

// 6) hasMessage is what the error path uses to choose patch-vs-append.
{
  const ms = [msg("p1", "x")];
  assert.strictEqual(hasMessage(ms, "p1"), true);
  assert.strictEqual(hasMessage(ms, "p2"), false);
  assert.strictEqual(hasMessage([], "p1"), false);
}

// 7) Ids must be unique per message, so a stale placeholder from an ABORTED earlier turn
//    is never written to by the new one.
{
  let ms = [msg("p1", "old reply")];
  ms = [...ms, msg("p2", "")];
  ms = appendChunk(ms, "p2", "new reply");
  assert.strictEqual(ms[0].content, "old reply");
  assert.strictEqual(ms[1].content, "new reply");
}

console.log("stream_messages_logic: OK");
