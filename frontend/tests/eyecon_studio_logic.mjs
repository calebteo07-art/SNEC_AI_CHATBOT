/* Regression for the "not every tab reflects / features conflict" bug.
   node --experimental-strip-types frontend/tests/eyecon_studio_logic.mjs */
import assert from "node:assert";
import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if ((spec.startsWith("./")||spec.startsWith("../")) && !/\\.(ts|tsx|js|mjs|cjs|json)$/.test(spec)) {
      try { return await next(spec + ".ts", ctx); } catch { return next(spec, ctx); }
    }
    return next(spec, ctx);
  }`), import.meta.url);
const { eyeconLayers } = await import("../src/aurora/avatar/layers.ts");
const { DEFAULT_AVATAR } = await import("../src/aurora/avatar/axes.generated.ts");

const sig = (cfg) => JSON.stringify(eyeconLayers(cfg));
const base = { ...DEFAULT_AVATAR };

// Each customizable axis must change the composite vs default (colour → tint, feature → overlay).
for (const [axis, val] of [
  ["bodyColor", "mint"], ["irisColor", "violet"], ["eyeShape", "starry"],
  ["outfit", "labcoat"], ["accessory", "headphones"], ["topper", "crown"],
]) {
  assert.notStrictEqual(sig({ ...base, [axis]: val }), sig(base), `${axis} must change the composite`);
}
// Features never replace each other.
const both = eyeconLayers({ ...base, topper: "crown", outfit: "cape" }).map((l) => l.key);
assert.ok(both.includes("topper") && both.includes("outfit"), "topper + outfit coexist");
console.log("eyecon_studio_logic: all assertions passed");
