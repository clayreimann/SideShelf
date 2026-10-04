#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "${TEST_ROOT}"' EXIT

APP_ROOT="${TEST_ROOT}/SideShelf"
WEB_ROOT="${TEST_ROOT}/SideShelf-web"
TEST_BIN="${TEST_ROOT}/bin"
RAW_DIR="${APP_ROOT}/.screenshots/raw"
DEST_DIR="${WEB_ROOT}/src/assets/images"
SURFACES=(home player library-grid downloads sleep-timer series)
THEMES=(dark light)

mkdir -p "${APP_ROOT}/scripts/screenshots" "${RAW_DIR}/dark" "${RAW_DIR}/light" "${DEST_DIR}" "${TEST_BIN}"
cp "${SCRIPT_DIR}/web.sh" "${APP_ROOT}/scripts/screenshots/web.sh"
cp "${SCRIPT_DIR}/__fixtures__/cwebp" "${TEST_BIN}/cwebp"
chmod +x "${APP_ROOT}/scripts/screenshots/web.sh" "${TEST_BIN}/cwebp"

for surface in "${SURFACES[@]}"; do
  for theme in "${THEMES[@]}"; do
    if [[ "${surface}-${theme}" != "series-light" ]]; then
      printf 'raw' >"${RAW_DIR}/${theme}/screenshot-${surface}.png"
    fi
    printf 'original-%s-%s' "${surface}" "${theme}" >"${DEST_DIR}/screenshot-${surface}-${theme}.webp"
  done
done

if PATH="${TEST_BIN}:${PATH}" "${APP_ROOT}/scripts/screenshots/web.sh" >/dev/null 2>&1; then
  echo "Expected export to fail when a raw capture is missing" >&2
  exit 1
fi

for surface in "${SURFACES[@]}"; do
  for theme in "${THEMES[@]}"; do
    dest="${DEST_DIR}/screenshot-${surface}-${theme}.webp"
    expected="original-${surface}-${theme}"
    actual="$(<"${dest}")"
    if [[ "${actual}" != "${expected}" ]]; then
      echo "Destination changed before missing-input validation: ${surface}-${theme}" >&2
      exit 1
    fi
  done
done

echo "Web screenshot export preflight test passed."
