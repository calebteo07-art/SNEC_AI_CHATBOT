import { Logo } from "../Logo";

/* CoBrand — the EyeBot + SNEC co-branding lockup (ricoe E2: "eyebot logo + snec logo
   on every page"). The shell rails already carry both; this is for the pages that run
   without a rail (immersive Tutor / Flashcards, the daily check-in). The EyeBot mark is
   the mono <Logo> glyph — solid black on light surfaces, solid white on dark (pass
   `dark`). The SNEC mark keeps its official form (only inverted for legibility on dark). */

export function CoBrand({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <div className={`aurora-cobrand${dark ? " is-dark" : ""} ${className}`.trim()}
         title="EyeBot — a Singapore National Eye Centre initiative">
      <span className="aurora-cobrand-eb">
        <span className="aurora-cobrand-mark-wrap" aria-hidden>
          <Logo size={26} tone={dark ? "white" : "ink"} />
        </span>
        <span className="aurora-cobrand-wm">EyeBot</span>
      </span>
      <span className="aurora-cobrand-div" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="aurora-snec" src="/brand/snec-logo.jpg" alt="Singapore National Eye Centre" />
    </div>
  );
}
