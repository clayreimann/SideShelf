#!/usr/bin/env bash
# run.sh — orchestrates the full screenshot pipeline:
#   1. capture.sh  -- boot the right simulator, run Maestro, raw PNGs
#   2. frame.mjs   -- composite App Store Connect-ready captioned JPGs
#   3. web.sh      -- convert raw PNGs to the WebP pairs the website loads
#
# Usage: npm run screenshots
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [1/3] Capturing screenshots via Maestro ==="
"${SCRIPT_DIR}/capture.sh"

echo ""
echo "=== [2/3] Compositing App Store Connect screenshots ==="
node "${SCRIPT_DIR}/frame.mjs" --theme dark

echo ""
echo "=== [3/3] Converting WebP pairs for the website ==="
"${SCRIPT_DIR}/web.sh"

echo ""
echo "All done."
echo "  App Store Connect screenshots: .screenshots/store/"
echo "  Website WebP pairs:            ../SideShelf-web/src/assets/images/"
