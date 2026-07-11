/* BrandSplash — a full-screen branded loader: the mono EyeBot mark + "EyeBot"
   wordmark on a soft light field. Used as the app-shell loading boundary. */
import { Wordmark } from "../Logo";

export function BrandSplash() {
  return (
    <div className="brand-splash" data-testid="brand-splash" role="status" aria-live="polite">
      <Wordmark size={40} />
      <span className="brand-splash-sr">Loading EyeBot…</span>
    </div>
  );
}
