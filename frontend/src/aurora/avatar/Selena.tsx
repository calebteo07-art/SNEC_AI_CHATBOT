/* <Selena> — the one-eyed EyeBot mascot, composited from a saved avatar_config.
   Presentational + hook-free, so it renders on the server or client. The parts are
   free placeholder SVG for now (RICOE D11); the curated 3D sprite library swaps in
   behind renderSelenaSvg later, on explicit go-ahead. */
import type { AvatarConfig } from "./axes.generated";
import { renderSelenaSvg } from "./renderSelena";

export function Selena({
  config,
  size = 240,
  className,
}: {
  config?: Partial<AvatarConfig>;
  size?: number;
  className?: string;
}) {
  const svg = renderSelenaSvg(config ?? {}, size);
  return (
    <span
      role="img"
      aria-label="Selena, your avatar"
      className={className}
      style={{ display: "inline-block", width: size, height: (size * 260) / 240, lineHeight: 0 }}
      // eslint-disable-next-line react/no-danger -- SVG is fully generated from a typed config, no user HTML
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
