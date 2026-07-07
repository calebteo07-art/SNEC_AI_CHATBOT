import { SelenaLogo } from "./SelenaLogo";

/* CoBrand — the EyeBot + SNEC co-branding lockup (ricoe E2: "eyebot logo + snec logo
   on every page"). The shell rails already carry both; this is for the pages that run
   without a rail (immersive Tutor / Flashcards, the daily check-in). The EyeBot mark is
   the Selena mascot (not the legacy mono Spark-Eye) so it reads warm + current. Pass
   `dark` on dark surfaces so the (white-background) SNEC mark is inverted to read. */

export function CoBrand({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <div className={`aurora-cobrand${dark ? " is-dark" : ""} ${className}`.trim()}
         title="EyeBot — a Singapore National Eye Centre initiative">
      <span className="aurora-cobrand-eb">
        {/* The mascot mark is alive: a gentle breathe + a breathing Gemini halo (CSS-only,
            frozen under reduced motion). The wrapper hosts the halo pseudo-element. */}
        <span className="aurora-cobrand-mark-wrap" aria-hidden>
          <SelenaLogo motion="idle" size={26} circle />
        </span>
        <span className="aurora-cobrand-wm">EyeBot</span>
      </span>
      <span className="aurora-cobrand-div" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="aurora-snec" src="/brand/snec-logo.jpg" alt="Singapore National Eye Centre" />
    </div>
  );
}
