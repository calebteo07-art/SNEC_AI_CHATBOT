/**
 * Runs every pure-logic harness in this directory.
 *
 * DISCOVERY, NOT A HAND LIST. ci.yml used to name each harness on its own line, and that
 * list drifted to 16 of 29: caseFilter, charts, eyecon_layers, eyecon_studio,
 * flashcards_deckladder, flashcards_scoring, logo_mark, pool_toggle, session_export,
 * station_timer, student-report, tiers and tutor_sessions all existed, all passed when
 * run by hand, and none of them gated a push. A harness nobody runs is worse than no
 * harness — the file in the tree reads as coverage, so the test never gets written again.
 *
 * The rule is mechanical and defaults to RUNNING a file:
 *   - `_`-prefixed files are shared fixtures (_mocks, _viewports), not harnesses;
 *   - a file importing playwright drives a real browser against a built app, so it needs
 *     a server and belongs to scripts/start-harness.sh, not here;
 *   - everything else runs.
 *
 * Defaulting to run is the load-bearing half. A new logic harness is gated the moment it
 * lands, and a new BROWSER harness that forgets the convention fails loudly here rather
 * than being silently skipped — the direction that gets noticed.
 *
 * Usage: `npm run test:logic` (or `--list` to print what would run). Pinned by
 * tests/test_logic_harness_registration.py.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * A tripwire for the one way this design can go false-green on its own: if the filter
 * below ever selects nothing, the loop spawns nothing and exits 0. Not a target — lower
 * it only when harnesses are genuinely removed, and say which in the commit.
 */
const MIN_HARNESSES = 25;

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const dir = path.resolve(args.find((a) => !a.startsWith("--")) ?? import.meta.dirname);

const harnesses = readdirSync(dir)
  .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
  .filter((f) => !readFileSync(path.join(dir, f), "utf8").includes('from "playwright"'))
  .sort();

if (harnesses.length < MIN_HARNESSES) {
  console.error(
    `discovered ${harnesses.length} logic harnesses in ${dir}, expected at least ` +
      `${MIN_HARNESSES}. Running none of them exits 0 and reads as a green suite.`,
  );
  process.exit(1);
}

if (listOnly) {
  console.log(harnesses.join("\n"));
  process.exit(0);
}

let failed = 0;
for (const file of harnesses) {
  // Type stripping needs the flag on the child, and one process per harness keeps a
  // module-level throw or a process.exit from taking the rest of the suite with it.
  const res = spawnSync(process.execPath, ["--experimental-strip-types", path.join(dir, file)], {
    stdio: "inherit",
  });
  // `status` is null when the child died on a signal, which is a failure, not a pass.
  const ok = res.status === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? "  ok" : "FAIL"}  ${file}`);
}

console.log(`\n${harnesses.length - failed}/${harnesses.length} logic harnesses passed`);
process.exit(failed === 0 ? 0 : 1);
