/* BrandSplash — a full-screen branded loader: a grooving Selena + "EyeBot"
   wordmark on a soft Gemini field. Used as the app-shell loading boundary. Motion
   is CSS-only and freezes under reduced motion (via SelenaLogo). */
import { SelenaLogo } from "./SelenaLogo";

export function BrandSplash() {
  return (
    <div className="brand-splash" data-testid="brand-splash" role="status" aria-live="polite">
      <SelenaLogo motion="groove" size={168} withWordmark />
      <span className="brand-splash-sr">Loading EyeBot…</span>
    </div>
  );
}
