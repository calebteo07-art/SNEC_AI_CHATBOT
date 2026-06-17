/**
 * Safely turn a parsed JSON error body into a human string.
 *
 * FastAPI returns two different shapes for `detail`:
 *   - handled errors (HTTPException): `detail` is a string
 *   - request validation errors (422): `detail` is an ARRAY of objects
 *     like `{ type, loc, msg, input }`
 *
 * Rendering that array/object directly as a React child throws React error
 * #31 ("Objects are not valid as a React child") and crashes the screen.
 * Always run untrusted error bodies through this before putting them in state.
 */
export function errorDetail(body: unknown, fallback = "Something went wrong."): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;

  if (typeof detail === "string") return detail || fallback;

  // 422 validation error: array of { msg, loc, ... } — join the human messages.
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" ? (d as { msg?: unknown }).msg : null))
      .filter((m): m is string => typeof m === "string" && m.length > 0);
    if (msgs.length) return msgs.join(" ");
  }

  return fallback;
}
