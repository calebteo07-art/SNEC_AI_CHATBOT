// frontend/src/aurora/lib/autogrow.ts
/* Grow a textarea to its content, up to a ceiling, then let it scroll.

   Both station composers were `rows={1}` / `rows={2}` on a `resize:none` field with no
   min- or max-height and no `field-sizing` — about 48px, showing one line of eight to ten
   words. Shift+Enter was mapped to a newline INTO a box that could neither show newlines
   nor be dragged taller. In a station whose entire premise is grading how a student phrases
   a question and describes a technique, the input was the one thing they could not read
   back. The Tutor already solved this (components/Composer.tsx); this is that solution
   extracted so both features share it instead of one of them having it. */

/** Ceiling in px — about six lines, past which the field scrolls rather than eating the pane. */
export const AUTOGROW_MAX = 140;

export function autogrow(el: HTMLTextAreaElement | null | undefined, max = AUTOGROW_MAX): void {
  if (!el) return;
  el.style.height = "auto";                        // measure the content, not the last size
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
}
