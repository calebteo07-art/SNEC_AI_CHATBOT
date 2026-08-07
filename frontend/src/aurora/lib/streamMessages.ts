// frontend/src/aurora/lib/streamMessages.ts
/* Address a streaming message by IDENTITY, not by position.

   The station's SSE reader used to accumulate chunks into `prev[prev.length - 1]`, and
   bail out returning `prev` verbatim whenever that last element was not the patient
   placeholder. Anything appended mid-stream therefore truncated the patient's reply:
   `runAction` is fired unawaited from `confirmProcedure` and posts its grade card
   seconds later, straight into the same array, with none of the `sending || isStreaming`
   guard the other append paths carry.

   The reachable case is an assessed dual step — hand hygiene fused with the identity
   check. It is non-quick, so it opens the procedure panel; its chip outcome charts
   without ticking, so the gate does not move; and stationTurn keeps `lockComposer: false`
   ("Half done — now talk to the patient"). The UI invites typing at the exact moment the
   /action grade call is outstanding.

   The damage was silent and permanent: the discarded remainder never entered state, so
   it was missing from the /observe transcript, the /submit transcript and the session
   export. The examiner could not tick a step the patient had half-answered, and the
   student was graded on a transcript that had been cut mid-sentence.

   No React, no I/O — pinned by frontend/tests/stream_messages_logic.mjs. */

export interface Addressable {
  id?: string;
  content: string;
}

/** True when `id` names a message still present in `msgs`. */
export function hasMessage(msgs: readonly Addressable[], id: string): boolean {
  return msgs.some((m) => m.id === id);
}

/** Return a NEW list with the content of message `id` transformed, or the SAME list when
    that message is gone. Position is irrelevant: later appends slide the target down the
    array and it is still found. */
export function patchMessage<T extends Addressable>(
  msgs: readonly T[], id: string, next: (prev: string) => string,
): T[] {
  const i = msgs.findIndex((m) => m.id === id);
  if (i === -1) return msgs as T[];
  const out = msgs.slice();
  out[i] = { ...out[i], content: next(out[i].content) };
  return out;
}

/** Append one streamed chunk to the message being streamed. */
export function appendChunk<T extends Addressable>(
  msgs: readonly T[], id: string, chunk: string,
): T[] {
  return patchMessage(msgs, id, (prev) => prev + chunk);
}
