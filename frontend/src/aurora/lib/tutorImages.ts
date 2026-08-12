/* Tutor image attachments — the triage rules (pure) and the downscale (DOM).

   Attachments are never stored anywhere: they exist in this module's output, in the
   /api/chat request body, and in the Gemini call. Nothing is written to Supabase, disk,
   or the persisted thread — only a count survives a reload.

   The downscale is what makes that possible. A phone photo is 3–8 MB; the API's request
   ceiling is 2 MB for the WHOLE body. Re-encoding to a 1024px JPEG lands each image
   around 150–250 KB, so three of them plus the conversation fit inside the existing
   limit with no upload endpoint and no storage bucket.

   Every canvas/DOM call lives inside a function so the decision rules stay unit-testable
   under Node type-stripping (see frontend/tests/tutor_images_assert.mjs), the same
   arrangement tutorSessions.ts uses. */

export const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_IMAGES = 3;          // mirrors MAX_IMAGES in tools/api/routers/chat.py
export const MAX_EDGE = 1024;         // longest edge after downscale, in px
export const JPEG_QUALITY = 0.72;
export const IMAGE_ONLY_PROMPT = "What can you tell me about this image?";

const ACCEPTED = new Set<string>(ACCEPTED_MIME);

export type RejectReason = "type" | "count";
export interface PickedFile { name: string; type: string }
export interface Rejection { name: string; reason: RejectReason }
export interface Triage<T> { accepted: T[]; rejected: Rejection[] }

/** An image ready to send: `data` is bare base64 (no `data:` prefix), `preview` is the
 *  data URL the thumbnail renders. */
export interface PreparedImage {
  id: string;
  name: string;
  mime: string;
  data: string;
  preview: string;
}

/**
 * Split a fresh selection into what can be attached and what cannot.
 *
 * A file refused for its TYPE must not also cost a slot — otherwise dropping a folder
 * with one stray PDF in it would silently eat the student's allowance and they would be
 * told they are at the limit while holding two images.
 */
export function triageFiles<T extends PickedFile>(existingCount: number, incoming: T[]): Triage<T> {
  const accepted: T[] = [];
  const rejected: Rejection[] = [];
  let room = Math.max(0, MAX_IMAGES - existingCount);
  for (const file of incoming) {
    if (!ACCEPTED.has(file.type)) {
      rejected.push({ name: file.name, reason: "type" });
      continue;
    }
    if (room === 0) {
      rejected.push({ name: file.name, reason: "count" });
      continue;
    }
    accepted.push(file);
    room -= 1;
  }
  return { accepted, rejected };
}

/** One plain sentence per reason — a file that vanishes without explanation reads as a bug. */
export function rejectionMessage(rejected: Rejection[]): string {
  if (!rejected.length) return "";
  const bits: string[] = [];
  if (rejected.some((r) => r.reason === "type")) {
    bits.push("Only PNG, JPEG and WebP images can be attached.");
  }
  if (rejected.some((r) => r.reason === "count")) {
    bits.push(`You can attach up to ${MAX_IMAGES} images per message.`);
  }
  return bits.join(" ");
}

/** Fit within a square bound, preserving aspect. Never upscales; always whole pixels. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const w = Math.max(1, Math.round(width || 0));
  const h = Math.max(1, Math.round(height || 0));
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const k = maxEdge / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** An attachment sent with no typed question still has to ask something. */
export function imageOnlyText(text: string): string {
  const t = (text || "").trim();
  return t.length ? t : IMAGE_ONLY_PROMPT;
}

let _seq = 0;

/**
 * Downscale and re-encode a picked file to a small JPEG.
 *
 * Always JPEG on the way out, whatever came in — one encoder, one size story. The white
 * flood-fill matters: a transparent PNG (a diagram exported off a slide, typically)
 * composites its alpha onto black when re-encoded, and a black-on-black diagram teaches
 * nobody anything.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const preview = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  _seq += 1;
  return {
    id: `img-${Date.now()}-${_seq}`,
    name: file.name,
    mime: "image/jpeg",
    data: preview.slice(preview.indexOf(",") + 1),
    preview,
  };
}
