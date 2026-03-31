---
phase: 21
plan: 04
subsystem: testing-infrastructure
tags: [maestro, credentials, npm-scripts, gitignore, shell-scripts]
dependency_graph:
  requires: []
  provides: [maestro-credential-env-file, maestro-test-npm-script]
  affects: [package.json, .gitignore, scripts/]
tech_stack:
  added: []
  patterns: [shell-script-from-npm, env-file-credentials-pattern]
key_files:
  created:
    - .env.maestro.example
    - scripts/run-maestro-tests.sh
  modified:
    - .gitignore
    - package.json
decisions:
  - Shell script wrapping avoids inlining env-sourcing logic in package.json; follows existing run-screenshots.sh pattern
  - .env.maestro added explicitly to .gitignore since .env*.local glob does not cover it (Research Pitfall 5)
metrics:
  duration_seconds: 59
  completed_date: "2026-03-31"
  tasks_completed: 2
  files_modified: 4
---

# Phase 21 Plan 04: Project Setup -- Env File, Gitignore, and npm Script Summary

Maestro credential management infrastructure: `.env.maestro.example` template, `.env.maestro` gitignore entry, and `npm run maestro:test` script backed by `scripts/run-maestro-tests.sh`.

## Tasks Completed

| Task | Description                                                  | Commit  | Files                                    |
| ---- | ------------------------------------------------------------ | ------- | ---------------------------------------- |
| 1    | Create .env.maestro.example and update .gitignore            | 706a7b9 | .env.maestro.example, .gitignore         |
| 2    | Create run-maestro-tests.sh and add maestro:test npm script  | a3d1244 | scripts/run-maestro-tests.sh, package.json |

## What Was Built

- `.env.maestro.example`: Committed template with placeholder values for `MAESTRO_SERVER_URL`, `MAESTRO_USERNAME`, `MAESTRO_PASSWORD` and comments directing developers to copy to `.env.maestro`
- `.gitignore`: Added `.env.maestro` after the existing `# local env files` / `.env*.local` block to ensure credentials are never committed
- `scripts/run-maestro-tests.sh`: Bash script with `set -euo pipefail`, sources `.env.maestro`, passes `--env` flags to Maestro, runs `library-navigation.yaml`, `playback.yaml`, and `download.yaml` in sequence, exits with error message if `.env.maestro` is missing
- `package.json`: Added `"maestro:test": "bash scripts/run-maestro-tests.sh"` after the `screenshots` script

## Verification Results

- `.env.maestro.example` exists and is NOT gitignored (`git check-ignore` returns nothing)
- `.gitignore` contains `.env.maestro` entry at line 35
- `git check-ignore .env.maestro` returns `.env.maestro` (confirmed ignored)
- `scripts/run-maestro-tests.sh` is executable; bash syntax check passes
- `package.json` `maestro:test` script correctly calls the shell script

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - this plan only creates config infrastructure. The `maestro:test` script will only execute successfully after Plans 21-01 through 21-03 provide the `.maestro/*.yaml` flow files, and requires a running iOS simulator + ABS server.

## Self-Check: PASSED

Files exist:
- FOUND: /Users/clay/Code/github/SideShelf/.env.maestro.example
- FOUND: /Users/clay/Code/github/SideShelf/scripts/run-maestro-tests.sh
- FOUND: /Users/clay/Code/github/SideShelf/.gitignore (modified)
- FOUND: /Users/clay/Code/github/SideShelf/package.json (modified)

Commits exist:
- 706a7b9: chore(21-04): add .env.maestro.example and gitignore .env.maestro
- a3d1244: chore(21-04): add run-maestro-tests.sh script and maestro:test npm script
