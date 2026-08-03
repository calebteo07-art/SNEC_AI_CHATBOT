"use client";
/* Hue-coded surfaces. `hue` names a DOMAIN, never a mood:
     blue = population · coral = risk · teal = pass/safe · purple = topics · amber = warning
   A hue is never chosen for variety — if two panels would take the same colour because
   they measure the same kind of thing, that is correct.

   The gradient is deliberately scarce: HeroMetric is the only full gradient fill on a
   screen. Panels and stat cards get a filled header band in their hue over a white body,
   which is what carries the colour without turning a dense table into noise. */
import type { CSSProperties, ReactNode } from "react";

export type Hue = "blue" | "coral" | "teal" | "purple" | "amber";

/** Single source of truth for the ramp — BarList imports the same hex values so a bar
    and the panel it sits in can never disagree about what "coral" is. */
export const RAMP: Record<Hue, [string, string]> = {
  blue:   ["#2F6FE4", "#4E85EC"],
  coral:  ["#CE4655", "#DE6B5C"],
  teal:   ["#0C8F84", "#1FAE96"],
  purple: ["#8154BE", "#9E6BD2"],
  amber:  ["#BE710A", "#D69233"],
};

/** Darkened ramp for TEXT on a tint of its own hue. RAMP[hue][0] is tuned to carry
    white on top of it (the band); reused as small text on a pale tint it lands at
    ~4.1:1 for blue and 3.97:1 for teal, both under AA. These clear 5.6-7.5:1 on the
    9%-tint badge background. A badge is 9.5px uppercase — small text, so 4.5:1 is the
    bar, not 3:1. Verified by console_assert's badge contrast sweep. */
export const INK: Record<Hue, string> = {
  blue:   "#1D4FB0",
  coral:  "#9E2C39",
  teal:   "#076B62",
  purple: "#5E3A8F",
  amber:  "#8A5107",
};

/** The console's one badge. `hue` names the same domains as everywhere else; the
    audit trail maps its severity tones onto it rather than inventing a second scale. */
export function Badge({ hue, children }: { hue?: Hue; children: ReactNode }) {
  const style = hue
    ? { background: `${RAMP[hue][0]}18`, color: INK[hue] }
    : { background: "rgba(19,22,40,.06)", color: "var(--cs-ink-2)" };
  return <span className="cs-badge" style={style}>{children}</span>;
}

function hueVars(hue: Hue): CSSProperties {
  const [a, b] = RAMP[hue];
  return { "--cs-h": a, "--cs-h2": b, "--cs-h-edge": `${a}55` } as CSSProperties;
}

export function StatCard({ hue, label, value, detail, detailHue, mark }: {
  hue: Hue; label: string; value: string; detail?: string; detailHue?: Hue; mark?: ReactNode;
}) {
  return (
    <div className="cs-stat cs-rise" style={hueVars(hue)}>
      <div className="cs-band">{label}{mark}</div>
      <div className="cs-cbody">
        <div className="cs-statv cs-num" data-testid="cs-stat-value">{value}</div>
        {detail && (
          <div className="cs-statd" style={detailHue ? { color: RAMP[detailHue][0] } : undefined}>{detail}</div>
        )}
      </div>
    </div>
  );
}

/** A stat cell INSIDE a modal. Deliberately not a StatCard: a drill-down already sits on
    a dimmed console, and five hue-banded cards in a dialog turn a detail view into a
    second dashboard. Both drill-downs (topic and student) use this one, so they read as
    the same kind of surface. */
export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--cs-hair)", borderRadius: 10, padding: "9px 11px", minWidth: 0 }}>
      <div className="cs-eyebrow">{label}</div>
      <div className="cs-num" style={{ fontSize: 20, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

export function Panel({ hue, title, tag, mark, children, testId }: {
  hue: Hue; title: string; tag?: string; mark?: ReactNode; children: ReactNode; testId?: string;
}) {
  return (
    <section className="cs-panel cs-rise" style={hueVars(hue)} data-testid={testId}>
      <div className="cs-band">{title}{mark}{tag && <span className="cs-tag">{tag}</span>}</div>
      <div className="cs-cbody">{children}</div>
    </section>
  );
}

/** The one saturated gradient block on the console, and the only place white text sits
    on colour. Stops clear AA at 7.2 / 7.2 / 6.2:1 — see --cs-hero in console.css. */
export function HeroMetric({ eyebrow, value, delta, pills, children }: {
  eyebrow: string; value: string; delta?: string; pills?: string[]; children?: ReactNode;
}) {
  return (
    <section className="cs-hero cs-rise" data-testid="cs-hero">
      <div>
        <p className="cs-eyebrow" style={{ margin: 0 }}>{eyebrow}</p>
        <p className="cs-hero-val cs-num" data-testid="cs-hero-value" style={{ margin: "8px 0" }}>{value}</p>
        <div className="cs-hpills">
          {delta && <span className="cs-hup">{delta}</span>}
          {(pills ?? []).map((p) => <span key={p} className="cs-hpill">{p}</span>)}
        </div>
      </div>
      {children}
    </section>
  );
}
