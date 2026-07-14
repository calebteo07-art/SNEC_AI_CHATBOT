/* Pure unit test for eyeconLayers(). Run:
   node --experimental-strip-types frontend/tests/eyecon_layers.mjs */
import assert from "node:assert";
import { register } from "node:module";
register(
  "data:text/javascript," + encodeURIComponent(`
    export async function resolve(spec, ctx, next) {
      if ((spec.startsWith("./") || spec.startsWith("../")) && !/\\.(ts|tsx|js|mjs|cjs|json)$/.test(spec)) {
        try { return await next(spec + ".ts", ctx); } catch { return next(spec, ctx); }
      }
      return next(spec, ctx);
    }`),
  import.meta.url,
);
const { eyeconLayers } = await import("../src/aurora/avatar/layers.ts");
const { DEFAULT_AVATAR } = await import("../src/aurora/avatar/axes.generated.ts");
const keys = (ls) => ls.map((l) => l.key);

// 1) default: body base + body tint + eye + iris tint; NO none-able overlays
{
  const ls = eyeconLayers({ ...DEFAULT_AVATAR });
  assert.deepStrictEqual(keys(ls), ["body", "bodyTint", "eye", "irisTint"], "default layer set");
  // z-order strictly ascending
  const zs = ls.map((l) => l.z);
  assert.deepStrictEqual(zs, [...zs].sort((a, b) => a - b), "z ascending");
}
// 2) two feature axes COEXIST (the bug: they used to replace each other)
{
  const ls = eyeconLayers({ ...DEFAULT_AVATAR, topper: "crown", outfit: "labcoat", accessory: "headphones" });
  assert.ok(keys(ls).includes("outfit") && keys(ls).includes("accessory") && keys(ls).includes("topper"),
    "all three features present together");
  const src = (k) => ls.find((l) => l.key === k).src;
  assert.strictEqual(src("outfit"), "/avatar/overlay/outfit/labcoat.webp");
  assert.strictEqual(src("topper"), "/avatar/overlay/topper/crown.webp");
}
// 3) colour axes drive tint layers (the bug: colour didn't reflect)
{
  const ls = eyeconLayers({ ...DEFAULT_AVATAR, bodyColor: "mint", irisColor: "violet" });
  const bt = ls.find((l) => l.key === "bodyTint");
  const it = ls.find((l) => l.key === "irisTint");
  assert.strictEqual(bt.kind, "tint"); assert.strictEqual(bt.color, "#A6E0C6", "mint body hex");
  assert.strictEqual(it.color, "#8A5FC0", "violet iris hex");
  assert.strictEqual(it.maskSrc, "/avatar/overlay/eyeShape/round.iris.webp", "iris mask follows eyeShape");
}
// 4) eyeShape follows the config (iris mask + eye overlay both switch)
{
  const ls = eyeconLayers({ ...DEFAULT_AVATAR, eyeShape: "starry" });
  assert.strictEqual(ls.find((l) => l.key === "eye").src, "/avatar/overlay/eyeShape/starry.webp");
  assert.strictEqual(ls.find((l) => l.key === "irisTint").maskSrc, "/avatar/overlay/eyeShape/starry.iris.webp");
}
// 5) null/undefined config → still a valid default composite (never throws)
assert.deepStrictEqual(keys(eyeconLayers(null)), ["body", "bodyTint", "eye", "irisTint"], "null → default");

console.log("eyecon_layers: all assertions passed");
