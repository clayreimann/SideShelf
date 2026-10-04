#!/usr/bin/env node
/**
 * Enforces CLAUDE.md's "No Circular Imports" rule.
 *
 * Runs dpdm's circular-dependency check against both entry points named in
 * CLAUDE.md (PlayerService.ts and appStore.ts) and fails the build if any
 * circular import chain exists that isn't in the ALLOWLIST below.
 *
 * The allowlist is intentionally tiny. Every entry must be a documented,
 * deliberate require()-based workaround — not a shortcut to silence a new cycle.
 * If dpdm reports a new cycle, the correct fix is almost always to break it
 * (invert the dependency, extract a shared module, pass data as an explicit
 * argument — see CLAUDE.md's "No Circular Imports" section), not to allowlist it.
 *
 * Usage: node scripts/check-circular.mjs   (wired up as `npm run check:circular`)
 */

import { spawnSync } from "node:child_process";

const ENTRY_POINTS = ["src/services/PlayerService.ts", "src/stores/appStore.ts"];

/**
 * Each entry is a documented, pre-existing require()-based circular workaround.
 * ISSUER and DEPENDENCY are matched as regexps against dpdm's resolved (repo-relative)
 * paths, so plain literal paths work fine here without escaping.
 */
const ALLOWLIST = [
  {
    issuer: "src/services/coordinator/PlayerStateCoordinator.ts",
    dependency: "src/services/PlayerService.ts",
    reason:
      "Documented in PlayerStateCoordinator.executeTransition(): coordinator lazily " +
      "require()s PlayerService to avoid a static cycle. See CLAUDE.md's Services section.",
  },
  {
    issuer: "src/services/PlayerBackgroundService.ts",
    dependency: "src/services/PlayerService.ts",
    reason:
      "PlayerBackgroundService statically imports playerService; " +
      "BackgroundReconnectCollaborator.ts lazily require()s PlayerBackgroundService " +
      "(documented at the top of that file) to avoid a static cycle back to PlayerService.",
  },
];

/** @returns {string[]} */
function buildSkipImportArgs() {
  return ALLOWLIST.flatMap(({ issuer, dependency }) => [
    "--skip-imports",
    `${issuer}:${dependency}`,
  ]);
}

/**
 * @param {string} entry
 * @returns {{ entry: string; ok: boolean; output: string }}
 */
function checkEntry(entry) {
  const args = [
    "--no-install",
    "dpdm",
    entry,
    "--circular",
    "--no-tree",
    "--no-warning",
    "--no-progress",
    "--exit-code",
    "circular:1",
    ...buildSkipImportArgs(),
  ];

  const result = spawnSync("npx", args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  if (result.error) {
    throw result.error;
  }

  return { entry, ok: result.status === 0, output };
}

function main() {
  console.log("Checking for circular imports (CLAUDE.md 'No Circular Imports' rule)...\n");
  console.log("Allowlisted cycles (documented require() workarounds):");
  for (const { issuer, dependency, reason } of ALLOWLIST) {
    console.log(`  - ${issuer} -> ${dependency}\n    ${reason}`);
  }
  console.log("");

  let failed = false;

  for (const entry of ENTRY_POINTS) {
    console.log(`--- ${entry} ---`);
    const { ok, output } = checkEntry(entry);
    console.log(output.trim());
    console.log("");

    if (!ok) {
      failed = true;
    }
  }

  if (failed) {
    console.error(
      "check:circular FAILED — one or more entry points have circular import chains " +
        "that are not in the allowlist above.\n" +
        "Fix the cycle (see CLAUDE.md's 'No Circular Imports' section) rather than " +
        "adding it to ALLOWLIST in scripts/check-circular.mjs unless it is a genuinely " +
        "unavoidable, documented require() workaround."
    );
    process.exit(1);
  }

  console.log("check:circular passed — no unexpected circular imports.");
}

main();
