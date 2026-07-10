/* Demoted board controls: show/hide toggle, optional display name, Edit-Selena entry.
   All D7 functionality, kept visually subordinate so the board is the hero. */
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function BoardSettings({
  youHidden, displayName, pending, onToggle, onSaveName,
}: {
  youHidden: boolean;
  displayName: string | null;
  pending: boolean;
  onToggle: (hidden: boolean) => void;
  onSaveName: (name: string) => void;
}) {
  const [draft, setDraft] = useState(displayName ?? "");
  useEffect(() => { setDraft(displayName ?? ""); }, [displayName]);
  const dirty = draft.trim() !== (displayName ?? "");
  return (
    <section className="lb-settings" aria-label="Board settings">
      <span className="lb-sh">Board settings</span>
      <span className="lb-set-lbl">Show me on the board</span>
      <button
        type="button" role="switch" aria-checked={!youHidden} aria-label="Show me on the board"
        data-testid="lb-hide-switch" className="lb-switch" data-on={!youHidden}
        disabled={pending} onClick={() => onToggle(!youHidden)}
      >
        <span className="lb-switch-knob" />
      </button>
      <span className="lb-grow" />
      <div className="lb-field">
        <input
          className="lb-name-input" type="text" maxLength={40} aria-label="Display name"
          placeholder="Display name (optional)" value={draft} onChange={(ev) => setDraft(ev.target.value)}
        />
        <button type="button" className="lb-btn ghost" disabled={!dirty || pending} onClick={() => onSaveName(draft.trim())}>Save</button>
      </div>
      <Link href="/studio" className="lb-btn ghost lb-edit" data-testid="edit-selena">Edit Selena</Link>
    </section>
  );
}
