"use client";
/* The vitreous — the atmospheric backdrop for "FUNDUS · The Living Retina".
   A deep ocular field lit from within: the generated retinal-cosmos photo (a
   graceful no-op if the asset is absent — it's a CSS background, so it never shows
   a broken image), the optic-disc + macular blooms, a slowly drifting retinal
   vessel arcade, slow vitreous floaters, fine grain and a vignette. Purely
   decorative and aria-hidden; every layer self-disables under reduced motion. */

/* Fine film grain as an inline SVG turbulence (no asset, no network). */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Deterministic vitreous floaters (SSR-safe — no Math.random at render). Each mote
   carries its own size, drift vector and timing via CSS custom properties. */
const MOTES = [
  { t: 14, l: 12, s: 7, d: 24, delay: 0, dx: 4, dy: -5 },
  { t: 28, l: 78, s: 5, d: 30, delay: 3, dx: -3, dy: 4 },
  { t: 62, l: 22, s: 9, d: 27, delay: 1.5, dx: 5, dy: -3 },
  { t: 44, l: 54, s: 4, d: 33, delay: 4.5, dx: -4, dy: -4 },
  { t: 78, l: 68, s: 6, d: 22, delay: 2, dx: 3, dy: -6 },
  { t: 20, l: 40, s: 5, d: 36, delay: 5, dx: -2, dy: 5 },
  { t: 56, l: 88, s: 8, d: 26, delay: 0.8, dx: -5, dy: -3 },
  { t: 86, l: 34, s: 5, d: 31, delay: 3.6, dx: 4, dy: -4 },
  { t: 8, l: 62, s: 6, d: 28, delay: 2.4, dx: -3, dy: 5 },
  { t: 38, l: 8, s: 4, d: 34, delay: 1.1, dx: 5, dy: 3 },
  { t: 70, l: 48, s: 7, d: 25, delay: 4, dx: -4, dy: -5 },
  { t: 50, l: 72, s: 5, d: 29, delay: 5.6, dx: 3, dy: 4 },
  { t: 24, l: 26, s: 6, d: 32, delay: 2.8, dx: -5, dy: -4 },
  { t: 90, l: 80, s: 4, d: 37, delay: 0.4, dx: 4, dy: -3 },
  { t: 34, l: 92, s: 6, d: 23, delay: 3.2, dx: -3, dy: 5 },
  { t: 66, l: 6, s: 5, d: 35, delay: 4.8, dx: 5, dy: -4 },
] as const;

export function FundusAtmos() {
  return (
    <div className="fundus-atmos" aria-hidden="true">
      <div className="fundus-photo" style={{ ["--fundus-img" as string]: "url(/brand/flashcards-fundus.png)" }} />
      <span className="fundus-bloom fundus-bloom--disc" />
      <span className="fundus-bloom fundus-bloom--macula" />
      <span className="fundus-bloom fundus-bloom--aux" />

      {/* Retinal vessel arcade — emerges from the optic disc (upper right) and
          branches into the four arcades across the retina. */}
      <svg className="fundus-vessels" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <g stroke="var(--accent)" opacity="0.55">
          <path d="M1040 250 C 880 250 760 200 560 150 C 380 105 220 120 60 90" strokeWidth="2.4" />
          <path d="M1040 250 C 870 300 720 320 520 360 C 340 396 200 420 40 430" strokeWidth="2.2" />
          <path d="M1040 250 C 900 360 800 470 660 560 C 520 650 380 690 240 760" strokeWidth="2" />
          <path d="M1040 250 C 940 230 880 150 800 70" strokeWidth="1.5" opacity="0.7" />
          <path d="M560 150 C 520 230 470 300 430 400" strokeWidth="1.3" opacity="0.6" />
          <path d="M520 360 C 470 430 440 520 420 620" strokeWidth="1.3" opacity="0.6" />
        </g>
        <g stroke="var(--vessel)" opacity="0.4">
          <path d="M1040 250 C 920 330 820 410 700 470 C 560 540 420 560 280 600" strokeWidth="2"
            strokeDasharray="1400" style={{ animation: "fundus-vessel-draw 7s ease-in-out infinite alternate" }} />
          <path d="M660 560 C 600 600 560 660 540 730" strokeWidth="1.2" opacity="0.7" />
        </g>
      </svg>

      <div className="fundus-floaters">
        {MOTES.map((m, i) => (
          <span
            key={i}
            className="fundus-mote"
            style={{
              top: `${m.t}%`,
              left: `${m.l}%`,
              width: m.s,
              height: m.s,
              ["--d" as string]: `${m.d}s`,
              ["--delay" as string]: `${m.delay}s`,
              ["--dx" as string]: `${m.dx}vw`,
              ["--dy" as string]: `${m.dy}vh`,
            }}
          />
        ))}
      </div>

      <div className="fundus-grain" style={{ ["--grain" as string]: GRAIN }} />
      <div className="fundus-vignette" />
    </div>
  );
}
