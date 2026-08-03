"use client";
/* One table behind roster / staff / approved-accounts / audit — four hand-rolled CSS
   grids before this, each carrying its own column string, its own head row and its own
   empty state, which is how the roster and the audit trail drifted apart.

   On a COARSE pointer it re-lays out as stacked cards rather than scrolling a 6-column
   grid sideways: each cell prints its own header via `data-label`, so nothing depends on
   a column heading that is off-screen. Gated on pointer, never width. */
import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  head: string;
  /** A grid-template-columns track — "2.2fr", "84px". Desktop only; dropped on coarse. */
  width: string;
  cell: (row: T) => ReactNode;
  /** The identifying cell. Stacked, it becomes the card's title and sheds its label. */
  primary?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty, testId }: {
  columns: Column<T>[];
  rows: T[];
  /** Takes the index too: the audit trail has no guaranteed id, and a key built only
      from its fields collides on two identical events in the same second. */
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  empty: string;
  testId?: string;
}) {
  const grid = columns.map((c) => c.width).join(" ");

  return (
    <div className="cs-table" data-testid={testId}>
      <div className="cs-trow cs-thead" style={{ gridTemplateColumns: grid }}>
        {columns.map((c) => <span key={c.key}>{c.head}</span>)}
      </div>
      {rows.map((r, i) => (
        <div
          key={rowKey(r, i)}
          className="cs-trow"
          style={{ gridTemplateColumns: grid }}
          data-clickable={onRowClick ? "true" : undefined}
          onClick={onRowClick ? () => onRowClick(r) : undefined}
          role={onRowClick ? "button" : undefined}
          tabIndex={onRowClick ? 0 : undefined}
          onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } : undefined}
        >
          {columns.map((c) => (
            <span key={c.key} data-label={c.head} data-primary={c.primary ? "true" : undefined}>
              {c.cell(r)}
            </span>
          ))}
        </div>
      ))}
      {rows.length === 0 && <p className="cs-note" style={{ padding: "14px 13px", margin: 0 }}>{empty}</p>}
    </div>
  );
}
