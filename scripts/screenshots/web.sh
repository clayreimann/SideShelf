#!/usr/bin/env bash
# web.sh — convert the raw dark/light captures into the WebP pairs the
# SideShelf-web site actually loads (see SCREENSHOTS_NEEDED.md).
#
# This closes the gap the old run-screenshots.sh pipeline left open: it
# copied .png into SideShelf-web/src/assets/images, but the site's CSS
# theme-swap (.img-theme-dark / .img-theme-light) only ever references
# .webp files, so those PNGs were never actually read by the site.
#
# Usage: scripts/screenshots/web.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW_DIR="${REPO_ROOT}/.screenshots/raw"
TMP_DIR="${REPO_ROOT}/.screenshots/webp"
DEST_DIR="${REPO_ROOT}/../SideShelf-web/src/assets/images"

CWEBP_BIN="cwebp"
if ! command -v "${CWEBP_BIN}" >/dev/null 2>&1; then
  if [[ -x "/opt/homebrew/bin/cwebp" ]]; then
    CWEBP_BIN="/opt/homebrew/bin/cwebp"
  else
    echo "ERROR: cwebp not found. Install it with: brew install webp" >&2
    exit 1
  fi
fi

if [[ ! -d "${DEST_DIR}" ]]; then
  echo "ERROR: ${DEST_DIR} not found. Is SideShelf-web checked out as a sibling of this repo?" >&2
  exit 1
fi

THEMES=(dark light)
SURFACES=(home player library-grid downloads sleep-timer series)

mkdir -p "${TMP_DIR}"

any_missing=0
for surface in "${SURFACES[@]}"; do
  for theme in "${THEMES[@]}"; do
    src="${RAW_DIR}/${theme}/screenshot-${surface}.png"
    webp_tmp="${TMP_DIR}/screenshot-${surface}-${theme}.webp"
    dest="${DEST_DIR}/screenshot-${surface}-${theme}.webp"

    if [[ ! -f "${src}" ]]; then
      echo "   MISSING ${src}"
      any_missing=1
      continue
    fi

    "${CWEBP_BIN}" -q 85 "${src}" -o "${webp_tmp}" >/dev/null 2>&1
    cp "${webp_tmp}" "${dest}"
    echo "   OK   screenshot-${surface}-${theme}.webp"
  done
done

if [[ ${any_missing} -ne 0 ]]; then
  echo "ERROR: some raw captures were missing -- run capture.sh first." >&2
  exit 1
fi

echo ""
echo "WebP pairs written to ${DEST_DIR}/"
