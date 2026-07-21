"use client";
/* Command palette — ⌘K / Ctrl+K. Filterable list of nav destinations; routes
   on select. Esc closes, ↑/↓ move, Enter navigates. No external dependency. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { leaveGuard } from "@/aurora/lib/leaveGuard";

export type Destination = { href: string; label: string };

export function CommandPalette({
  open,
  onClose,
  destinations,
}: {
  open: boolean;
  onClose: () => void;
  destinations: Destination[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter((d) => d.label.toLowerCase().includes(q));
  }, [query, destinations]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // focus after the element is mounted
      const t = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(t);
    }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  if (!open) return null;

  // An active session arms leaveGuard: intercept routes the jump through the screen's
  // forfeit confirm (which navigates on confirm) instead of leaving the round for free.
  const go = (href: string) => {
    onClose();
    if (leaveGuard.intercept(href)) return;
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const d = results[active]; if (d) go(d.href); }
  };

  return (
    <div
      className="aurora-palette-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="aurora-palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="aurora-palette-input"
          placeholder="Jump to…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search destinations"
        />
        <div className="aurora-palette-list">
          {results.length === 0 ? (
            <p className="aurora-palette-empty">No matches</p>
          ) : (
            results.map((d, i) => (
              <button
                key={d.href}
                type="button"
                className="aurora-palette-item"
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(d.href)}
              >
                <span>{d.label}</span>
              </button>
            ))
          )}
        </div>
        <div className="aurora-palette-hint">
          <span>↑↓ to move</span><span>↵ to open</span><span>esc to close</span>
        </div>
      </div>
    </div>
  );
}
