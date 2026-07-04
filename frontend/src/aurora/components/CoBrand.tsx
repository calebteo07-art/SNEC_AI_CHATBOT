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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="aurora-cobrand-mark" src="/brand/iris.png" alt="" />
        <span className="aurora-cobrand-wm">EyeBot</span>
      </span>
      <span className="aurora-cobrand-div" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="aurora-snec" src="/brand/snec-logo.jpg" alt="Singapore National Eye Centre" />
    </div>
  );
}
