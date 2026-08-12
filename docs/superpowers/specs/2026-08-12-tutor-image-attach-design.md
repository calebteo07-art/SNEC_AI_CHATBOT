# Tutor image attachment — design

**Date:** 2026-08-12
**Status:** approved, ready to implement

A student attaches up to 3 images to a tutor message and asks about them. The tutor
answers. Nothing is stored.

## Scope decisions (user-confirmed)

| Question | Answer |
|---|---|
| What gets attached | Study material, clinical images, equipment/workflow photos — **no content restriction** |
| How long the image lives | **One turn, never stored.** Browser → API → Gemini in memory, then dropped |
| How many per message | **Up to 3** |
| Image-only send (no text) | Allowed — a default question is supplied |
| Content gate | None. One line of helper text advises against patient-identifiable images |

## Design lock

Tutor Chat is LOCKED (`docs/design-locks.md:981`). This refines exactly one criterion:

> **composer input modality: text-only → text + up to 3 images**

`Composer.tsx`'s header comment ("No camera, photo, emoji or voicenote controls — this is
a focused, text-only tutor input") is updated to match. Type (Manrope), the electric-indigo
`#5B5BFF` identity, the constellation canvas, the greeting landing, the reply-avatar rule
and the layout are all untouched.

## Architecture

### Request path

```
Composer (paperclip / drop / paste)
  → prepareImages()  canvas downscale, longest edge 1024, JPEG q0.72
  → Tutor.sendMessage()  POST /api/chat  { messages: [... , { role, content, images }] }
  → next.config.ts rewrite → FastAPI
  → server.py limit_request_size (2 MB)
  → chat.py  validate → strip images off non-final turns → guardrails
  → gemini_client.stream_ask(images on last turn)
  → _build_contents → types.Part.from_bytes
  → SSE tokens back, unchanged wire format
```

### The model-routing decision

The tutor normally streams `gemini-3.1-flash-lite` behind an explicit context cache. A
cache is bound to the model that created it (`gemini_client.py:226` creates it with
`model=MODEL`), so an image turn cannot reuse it.

Therefore:

- **Text turn** — unchanged. Cached flash-lite path, byte for byte.
- **Image turn** — skip the cache, take the inline-system path, run on `FLASH_MODEL`
  (`gemini-3.5-flash`), the vision-capable model already used by `tools/kb/ocr.py:47`.

This keeps the 99% path at zero regression surface and reuses a proven vision idiom.

### Sizing — why no upload endpoint

`MAX_REQUEST_BYTES` is 2,000,000 (`server.py:58`). Client-side downscale to 1024px @ JPEG
q0.72 yields ~150–250 KB per image; base64 inflates ×1.37. Three images ≈ 850 KB worst
case, plus thread text. It fits inline in the existing JSON POST.

Consequences: no multipart endpoint, no Supabase Storage bucket, no signed URLs, no
retention policy, no `MAX_REQUEST_BYTES` change and so no coordinated Render env edit.

### Never stored

Image bytes exist in browser memory, the request body, and the Gemini call. They are not
written to Supabase, disk, logs, or `chat_sessions`. `filter_input`/`validate_output`
audit rows already carry no payload.

The localStorage thread (`tutorSessions.ts`) persists an `imageCount: number` on the user
message — an integer, never bytes — so a reopened conversation renders
"📎 2 images (not saved)" instead of a dangling question. `/api/end-session` sends text
only, as today.

## Components

### New — `frontend/src/aurora/lib/tutorImages.ts` (pure, unit-tested)

- `ACCEPTED_MIME`, `MAX_IMAGES = 3`, `MAX_EDGE = 1024`, `JPEG_QUALITY = 0.72`
- `acceptFiles(existing, incoming)` → `{ accepted, rejected }`, enforces count + mime
- `downscale(file)` → `{ mime, data /* base64, no data: prefix */, preview /* object URL */ }`
- `IMAGE_ONLY_PROMPT` — the default question when no text is typed

Canvas work is DOM-dependent; the count/mime/limit logic is pure and tested in Node.

### Changed — `Composer.tsx`

New optional props: `images`, `onAddFiles`, `onRemoveImage`, `maxImages`. Absent props =
today's behaviour exactly, so no other call site breaks. Paperclip button, hidden
`<input type="file" accept multiple>`, drag-drop on the composer shell, paste handler on
the textarea, thumbnail strip with per-item remove, and one line of helper text. Send
enables on `hasText || hasImages`.

### Changed — `Tutor.tsx`

`UserMessage` gains `images?: PreparedImage[]` and `imageCount?: number`. Attachment state
lives beside `input`. `sendMessage` attaches `images` to the final API turn only, clears
them on send, and re-normalises at the five existing map sites (persist, endTutorSession,
resume, apiMessages, render).

### Changed — `MessageBubble` call site

`MessageBubble` splits 💭 only when `children` is a string, so thumbnails render as a
**sibling** element above the bubble text, never inside `children`.

### Changed — `tools/api/routers/chat.py`

```python
class ChatImage(BaseModel):
    mime: Literal["image/png", "image/jpeg", "image/webp"]
    data: str = Field(max_length=2_800_000)   # base64

class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=8000)
    images: list[ChatImage] = Field(default_factory=list, max_length=3)
```

- decode + magic-byte sniff; mismatch → 422
- images survive only on the **last** user turn; server-side strip, not client trust
- image turn → `cache_name = None`, `model=FLASH_MODEL`
- image-only turn → `IMAGE_ONLY_PROMPT` text supplied server-side so `filter_input` and
  the model both get a question

### Changed — `tools/shared/gemini_client.py`

`_build_contents` currently hard-wraps the last turn as `{"text": last_message}`
(line 170), which would silently drop an image. It becomes parts-aware: text part plus
`types.Part.from_bytes(data=raw, mime_type=…)` per image, matching `ocr.py:50`. The SDK
import stays inside the live-only branch — `stream_ask` returns from MOCK_MODE at line 257
before `_build_contents` is ever reached.

MOCK_MODE returns the existing `_MOCK_RESPONSES["image"]` when the turn carries images.

## Error handling

| Case | Behaviour |
|---|---|
| Unsupported type / 4th image | Rejected client-side with an inline message; existing selection kept |
| Decode failure | Rejected client-side before send |
| Body > 2 MB | 413 from existing middleware → existing `apiErrorMessage` fallback bubble |
| Bad mime / magic-byte mismatch | 422; the fetch throws → existing catch renders the fallback bubble |
| Gemini quota | Existing `quota_exceeded` SSE path, unchanged |
| Vision model unavailable | Falls into the existing pre-first-token retry/next-key ladder |

## Testing

Failing test first, in every case.

**pytest**
- an image on the final turn reaches `contents` as an inline part
- images on earlier turns are stripped server-side
- 4 images / bad mime / oversize base64 → 422
- magic bytes that disagree with the declared mime → 422
- image turn does not use the context cache and selects `FLASH_MODEL`
- text-only turn still uses the cached flash-lite path (regression guard)
- MOCK_MODE with images returns the mock and never imports the SDK
- event-loop offload invariant still holds (`tests/api/test_event_loop_offload.py`)

**node** — `frontend/tests/tutor_images_assert.mjs`: count cap, mime filter, rejection
reasons, image-only prompt substitution.

**harness** — `aurora_assert.mjs`: the attach control exists and the composer's locked
metrics are unchanged; `tutor_mobile_assert.mjs` composer height still passes.

## Cost

`gemini-3.5-flash` costs more than flash-lite, and an image is ≈1.3k tokens. Image turns
only. Gemini is prepaid with auto-reload off (~SGD 386 remaining), so this is a real if
small burn-rate change.

## Out of scope

Storage/retrieval of images, image generation, OSCE/station attachments, PDF or video
attachment, server-side image moderation, more than 3 images, images on `/api/end-session`.
