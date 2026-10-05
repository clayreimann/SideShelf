#!/usr/bin/env node
/**
 * Complexity ratchet.
 *
 * Runs the rules in eslint.complexity.config.js and compares the results with
 * .github/quality/complexity-baseline.json. Violations are grouped by file and
 * rule (not line, so unrelated edits don't trip the check). The check fails when
 * a file/rule pair gains violations or its worst value gets worse.
 *
 *   node scripts/check-complexity.js            # check against the baseline
 *   node scripts/check-complexity.js --update   # rewrite the baseline
 *   node scripts/check-complexity.js --report   # print every violation
 */
const fs = require("fs");
const path = require("path");
const { ESLint } = require("eslint");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "eslint.complexity.config.js");
const BASELINE_PATH = path.join(ROOT, ".github/quality/complexity-baseline.json");
// Disable comments for rules not loaded here (e.g. @typescript-eslint/*) produce
// "rule not found" messages; only count the rules this config enables.
const CHECKED_RULES = new Set(require(CONFIG_PATH).flatMap((c) => Object.keys(c.rules ?? {})));
const args = new Set(process.argv.slice(2));

function metricValue(message) {
  const match = message.match(/(?:complexity of|Complexity from|\()\s*(\d+)/);
  return match ? Number(match[1]) : 0;
}

async function collect() {
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: CONFIG_PATH,
  });
  const results = await eslint.lintFiles(["src"]);
  const violations = [];
  for (const result of results) {
    // Baseline keys use "/" so they match across Windows and POSIX.
    const file = path.relative(ROOT, result.filePath).split(path.sep).join("/");
    for (const msg of result.messages) {
      if (msg.fatal) throw new Error(`${file}:${msg.line} ${msg.message}`);
      if (!CHECKED_RULES.has(msg.ruleId)) continue;
      violations.push({
        file,
        line: msg.line,
        rule: msg.ruleId,
        value: metricValue(msg.message),
        message: msg.message,
      });
    }
  }
  return violations;
}

function summarize(violations) {
  const summary = {};
  for (const v of violations) {
    const byRule = (summary[v.file] ??= {});
    const entry = (byRule[v.rule] ??= { count: 0, worst: 0 });
    entry.count += 1;
    entry.worst = Math.max(entry.worst, v.value);
  }
  // Stable ordering keeps baseline diffs readable.
  return Object.fromEntries(
    Object.keys(summary)
      .sort()
      .map((file) => [
        file,
        Object.fromEntries(
          Object.keys(summary[file])
            .sort()
            .map((r) => [r, summary[file][r]])
        ),
      ])
  );
}

function printTotals(violations) {
  const byRule = {};
  for (const v of violations) byRule[v.rule] = (byRule[v.rule] ?? 0) + 1;
  console.log(`Complexity violations: ${violations.length}`);
  for (const [rule, count] of Object.entries(byRule).sort()) console.log(`  ${rule}: ${count}`);
}

const NONE = { count: 0, worst: 0 };

const isWorse = (a, b) => a.count > b.count || a.worst > b.worst;

/** Yields [file, rule, entryInA, entryInB] for every file/rule pair in `a`. */
function* pairs(a, b) {
  for (const [file, rules] of Object.entries(a)) {
    for (const [rule, entry] of Object.entries(rules)) {
      yield [file, rule, entry, b[file]?.[rule] ?? NONE];
    }
  }
}

function compare(baseline, current) {
  const regressions = [];
  for (const [file, rule, now, before] of pairs(current, baseline)) {
    if (isWorse(now, before)) regressions.push({ file, rule, before, now });
  }
  let improvements = 0;
  for (const [, , before, now] of pairs(baseline, current)) {
    if (isWorse(before, now)) improvements += 1;
  }
  return { regressions, improvements };
}

function printRegressions(regressions, violations) {
  console.error("\nComplexity regressions (compared with the baseline):");
  for (const { file, rule, before, now } of regressions) {
    console.error(
      `  ${file}  [${rule}]  count ${before.count} -> ${now.count}, worst ${before.worst} -> ${now.worst}`
    );
    for (const v of violations.filter((x) => x.file === file && x.rule === rule)) {
      console.error(`      line ${v.line}: ${v.message}`);
    }
  }
  console.error(
    "\nSimplify the code above, or if the increase is deliberate run `npm run quality:baseline` and commit the result."
  );
}

function writeBaseline(current) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`Baseline written to ${path.relative(ROOT, BASELINE_PATH)}`);
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

async function main() {
  const violations = await collect();
  const current = summarize(violations);

  if (args.has("--report")) {
    for (const v of [...violations].sort((a, b) => b.value - a.value)) {
      console.log(`${v.file}:${v.line}  [${v.rule}]  ${v.message}`);
    }
  }
  printTotals(violations);

  if (args.has("--update")) {
    writeBaseline(current);
    return;
  }

  const { regressions, improvements } = compare(readBaseline(), current);
  if (regressions.length > 0) {
    printRegressions(regressions, violations);
    process.exitCode = 1;
    return;
  }
  if (improvements > 0) {
    console.log(
      `\n${improvements} file/rule pair(s) improved on the baseline. Run \`npm run quality:baseline\` to lock in the gains.`
    );
  }
  console.log("\nNo complexity regressions.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
