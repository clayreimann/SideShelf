#!/usr/bin/env bash
# Runs Maestro screenshot flow twice (dark + light) and copies outputs to SideShelf-web.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${REPO_ROOT}/../SideShelf-web/src/assets/images"
DEBUG_DIR="${REPO_ROOT}/.maestro-output"

# takeScreenshot writes to the working directory, so run maestro from a
# per-theme subdir so screenshots land there rather than the project root.
SCREENSHOT_DIR="${REPO_ROOT}/.maestro-screenshots"

cleanup() {
  rm -rf "${SCREENSHOT_DIR}"
}
trap cleanup EXIT

run_theme() {
  local theme="$1"
  local out="${SCREENSHOT_DIR}/${theme}"
  mkdir -p "${out}" "${DEBUG_DIR}/${theme}"

  echo ">> Switching simulator to ${theme} mode..."
  xcrun simctl ui booted appearance "${theme}"
  sleep 1

  echo ">> Running Maestro flow (${theme})..."
  (
    cd "${out}"
    maestro test "${REPO_ROOT}/.maestro/capture-screenshots.yaml" \
      --debug-output "${DEBUG_DIR}/${theme}" \
      --flatten-debug-output
  )

  echo ">> Copying ${theme} screenshots to ${DEST_DIR}..."
  local any_missing=0
  for screen in library-grid library-list player downloads; do
    src="${out}/screenshot-${screen}.png"
    dst="${DEST_DIR}/screenshot-${screen}-${theme}.png"
    if [[ -f "${src}" ]]; then
      cp "${src}" "${dst}"
      echo "   OK  screenshot-${screen}-${theme}.png"
    else
      echo "   MISSING  screenshot-${screen}.png"
      any_missing=1
    fi
  done

  if [[ ${any_missing} -ne 0 ]]; then
    echo "Some screenshots missing -- check ${DEBUG_DIR}/${theme} for artifacts"
    exit 1
  fi
}

run_theme dark
run_theme light

xcrun simctl ui booted appearance dark

echo "Done. Run 'npm run build' in SideShelf-web to verify."
