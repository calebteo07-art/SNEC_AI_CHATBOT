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
