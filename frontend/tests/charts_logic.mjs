/* Pure unit test for the chart geometry (dependency-free, Node type-strip,
   mirrors session_export_logic.mjs):
     node --experimental-strip-types frontend/tests/charts_logic.mjs */
import assert from "node:assert";
import { niceCeil, points, linePath, areaPath, polar, arcPath } from "../src/aurora/components/charts/chartGeometry.ts";

// niceCeil rounds up to a readable axis ceiling and floors at `min`.
assert.strictEqual(niceCeil(0), 1);
assert.strictEqual(niceCeil(7), 10);
assert.strictEqual(niceCeil(12), 20);
assert.strictEqual(niceCeil(3), 5);
assert.strictEqual(niceCeil(0.4, 1), 1);

// points: single value centres; y inverts (SVG top-left); x spans the padded box.
const p1 = points([5], 100, 40, 4, 10);
assert.strictEqual(p1.length, 1);
assert.ok(Math.abs(p1[0][0] - 50) < 1e-6, "single point centred on x");
const p = points([0, 10], 100, 40, 4, 10);         // pad 4 ⇒ innerW 92, innerH 32
assert.ok(Math.abs(p[0][0] - 4) < 1e-6 && Math.abs(p[1][0] - 96) < 1e-6, "x spans pad..w-pad");
assert.ok(p[0][1] > p[1][1], "higher value sits higher (smaller y)");
assert.ok(Math.abs(p[1][1] - 4) < 1e-6, "max value pins to the top pad");

// linePath / areaPath are well-formed SVG path strings.
const lp = linePath(p);
assert.ok(lp.startsWith("M") && lp.includes("L"), "line path uses M..L");
const ap = areaPath(p, 36);
assert.ok(ap.endsWith("Z"), "area path closes");
assert.ok(ap.includes("L4.0 36.0"), "area drops to baseline at the first x");

// polar: 0° = 12 o'clock (straight up).
const [tx, ty] = polar(50, 50, 10, 0);
assert.ok(Math.abs(tx - 50) < 1e-6 && Math.abs(ty - 40) < 1e-6, "0deg is straight up");

// arcPath: single arc command with the correct large-arc flag + clockwise sweep.
assert.ok(arcPath(50, 50, 20, 0, 90).includes("A20 20 0 0 1"), "quarter arc: small-arc, clockwise");
assert.ok(arcPath(50, 50, 20, 0, 270).includes("A20 20 0 1 1"), "3/4 arc sets the large-arc flag");

console.log("charts_logic: all assertions passed");
