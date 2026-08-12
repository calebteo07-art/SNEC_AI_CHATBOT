"use client";
/* Composer — a clean rounded "Message…" field (Enter sends, Shift+Enter newline,
   auto-grow) with a blue "Send" button that appears once you type. No emoji or
   voicenote controls — this is a focused tutor input.

   Images (2026-08-12): a paperclip, drag-drop and paste attach up to three images to the
   message. The attachment props are OPTIONAL — omit them and this renders exactly the
   text-only composer it always was, so the locked geometry is untouched wherever
   attachments aren't wired up. The thumbnail strip and the hints sit OUTSIDE
   `.aurora-composer` and only mount when something is attached, so the pill's own
   metrics never move at rest. */
import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent } from "react";
import { Icon } from "@/aurora/icons";
import { ACCEPTED_MIME, MAX_IMAGES, type PreparedImage } from "@/aurora/lib/tutorImages";

export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Message…",
  images,
  onAddFiles,
  onRemoveImage,
  notice = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  images?: PreparedImage[];
  onAddFiles?: (files: File[]) => void;
  onRemoveImage?: (id: string) => void;
  notice?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const canAttach = typeof onAddFiles === "function";
  const shots = images ?? [];
  const hasText = value.trim().length > 0;
  const canSend = hasText || shots.length > 0;
  const full = shots.length >= MAX_IMAGES;

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
  };

  const take = (files: FileList | null) => {
    if (!canAttach || !files || files.length === 0) return;
    onAddFiles!(Array.from(files));
  };

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    take(e.target.files);
    e.target.value = "";   // so re-picking the same file fires change again
  };

  /* Paste is how a student actually attaches a screenshot — Win+Shift+S then Ctrl+V,
     with no file on disk to browse to. But a copy out of Word, Excel, PowerPoint or
     Outlook puts a bitmap on the clipboard ALONGSIDE the text, so claiming every paste
     that carries a file would silently swallow text the student meant to paste. Only
     intercept a clipboard with no text rendering to lose — which is exactly the
     screenshot case (a snip carries `Files` and nothing else). */
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!canAttach) return;
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length || (e.clipboardData?.getData("text/plain") ?? "")) return;
    e.preventDefault();
    onAddFiles!(files);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!canAttach) return;
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer?.files ?? null);
  };

  return (
    <div className="aurora-composer-wrap">
      {shots.length > 0 && (
        <div className="aurora-composer-shots">
          {shots.map((img) => (
            <span key={img.id} className="aurora-shot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview} alt={img.name || "Attached image"} />
              {onRemoveImage && (
                <button
                  type="button"
                  className="aurora-shot-x aurora-press"
                  onClick={() => onRemoveImage(img.id)}
                  aria-label={`Remove ${img.name || "image"}`}
                >
                  <Icon.close size={14} />
                </button>
              )}
            </span>
          ))}
          <span className="aurora-composer-hint">
            EyeBot reads these to answer your question. They are not saved — please don&apos;t
            attach anything that identifies a patient.
          </span>
        </div>
      )}

      {notice && <p className="aurora-composer-note" role="status">{notice}</p>}

      <div
        className="aurora-composer"
        data-dragging={dragging || undefined}
        onDragOver={canAttach ? (e) => { e.preventDefault(); setDragging(true); } : undefined}
        /* The pill's children (the clip, its svg path, the textarea, Send) are all
           hit-test targets, so a bare dragleave fires every time the pointer crosses one
           and the highlight strobes while the file is still over the composer. */
        onDragLeave={canAttach ? (e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        } : undefined}
        onDrop={canAttach ? onDrop : undefined}
      >
        {canAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              className="aurora-composer-file"
              accept={ACCEPTED_MIME.join(",")}
              multiple
              onChange={onPickFiles}
              tabIndex={-1}
              aria-hidden="true"
            />
            <button
              type="button"
              className="aurora-composer-clip aurora-press"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || full}
              title={full ? `Up to ${MAX_IMAGES} images per message` : "Attach an image"}
              aria-label={full ? `Attachment limit of ${MAX_IMAGES} images reached` : "Attach an image"}
            >
              <Icon.clip size={22} />
            </button>
          </>
        )}

        <textarea
          ref={ref}
          className="aurora-composer-field"
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onPaste={canAttach ? onPaste : undefined}
          placeholder={placeholder}
          rows={1}
          aria-label="Message input"
        />

        {canSend && (
          <button
            type="button"
            className="aurora-composer-send aurora-press"
            onClick={onSend}
            disabled={disabled}
            aria-label="Send message"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
