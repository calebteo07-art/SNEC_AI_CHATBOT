/* Pure unit test for the <Eyecon> representative-tile fallback. representativeTile.ts uses
   idiomatic extensionless relative imports (./axes.generated, ./tiles), so we register a
   tiny resolve hook that appends `.ts` before dynamic-importing under Node type stripping:
     node --experimental-strip-types frontend/tests/eyecon_fallback_logic.mjs */
import assert from "node:assert";
import { register } from "node:module";

// Resolve extensionless relative specifiers to `.ts` (matches the bundler resolution the
// app builds with) so raw Node can load the module graph.
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(spec, ctx, next) {
        if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.(ts|tsx|js|mjs|cjs|json)$/.test(spec)) {
          try { return await next(spec + ".ts", ctx); } catch { return next(spec, ctx); }
        }
        return next(spec, ctx);
      }`),
  import.meta.url,
);

const { representativeTileSrc } = await import("../src/aurora/avatar/representativeTile.ts");
const { DEFAULT_AVATAR } = await import("../src/aurora/avatar/axes.generated.ts");

// 1) null / empty → no representative tile
assert.strictEqual(representativeTileSrc(null), null, "null config");
assert.strictEqual(representativeTileSrc(undefined), null, "undefined config");
assert.strictEqual(representativeTileSrc({}), null, "empty config");

// 2) all-default config (defaults on every tile-bearing axis) → null (nothing customized)
assert.strictEqual(representativeTileSrc({ ...DEFAULT_AVATAR }), null, "all defaults");

// 3) a single non-default feature axis → its tile
assert.strictEqual(
  representativeTileSrc({ ...DEFAULT_AVATAR, topper: "crown" }),
  "/avatar/tiles/topper/crown.webp",
  "topper crown",
);
assert.strictEqual(
  representativeTileSrc({ ...DEFAULT_AVATAR, glasses: "round" }),
  "/avatar/tiles/glasses/round.webp",
  "glasses round",
);
// eyeShape default is "round"; "wide" is non-default and lower priority but only axis set
assert.strictEqual(
  representativeTileSrc({ ...DEFAULT_AVATAR, eyeShape: "wide" }),
  "/avatar/tiles/eyeShape/wide.webp",
  "eyeShape wide",
);
// mouth default is "smile"
assert.strictEqual(
  representativeTileSrc({ ...DEFAULT_AVATAR, mouth: "grin" }),
  "/avatar/tiles/mouth/grin.webp",
  "mouth grin",
);

// 4) priority: topper beats outfit beats glasses
assert.strictEqual(
  representativeTileSrc({ ...DEFAULT_AVATAR, topper: "crown", outfit: "labcoat", glasses: "round" }),
  "/avatar/tiles/topper/crown.webp",
  "topper wins over outfit+glasses",
);
assert.strictEqual(
  representativeTileSrc({ ...DEFAULT_AVATAR, outfit: "labcoat", glasses: "round" }),
  "/avatar/tiles/outfit/labcoat.webp",
  "outfit wins over glasses",
);

// 5) an axis explicitly set to "none" is skipped, later axis wins
assert.strictEqual(
  representativeTileSrc({ ...DEFAULT_AVATAR, topper: "none", outfit: "cape" }),
  "/avatar/tiles/outfit/cape.webp",
  "explicit none is skipped",
);

// 6) colour-only customization (no tile-bearing axis changed) → null
assert.strictEqual(
  representativeTileSrc({ ...DEFAULT_AVATAR, bodyColor: "mint", irisColor: "violet", background: "galaxy" }),
  null,
  "colour-only has no representative tile",
);

console.log("eyecon_fallback_logic: all assertions passed");
