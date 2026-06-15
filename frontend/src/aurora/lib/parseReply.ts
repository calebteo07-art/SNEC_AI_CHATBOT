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
