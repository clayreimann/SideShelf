#!/usr/bin/env bash
# capture-screenshots.sh
#
# Captures marketing screenshots for the SideShelf website.
# Automates: simulator detection, dark/light appearance toggling, screenshot capture,
# and file placement into the SideShelf-web project.
#
# Usage:
#   ./scripts/capture-screenshots.sh
#   ./scripts/capture-screenshots.sh --udid <simulator-udid>
#   ./scripts/capture-screenshots.sh --dest /path/to/sideshelf-web/src/assets/images

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

APP_SCHEME="side-shelf"
DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/SideShelf-web/src/assets/images"
TMPDIR_SCREENSHOTS="$(mktemp -d)"
WAIT_AFTER_APPEARANCE=1   # seconds to wait after toggling appearance before capture
WAIT_AFTER_LAUNCH=3       # seconds to wait after deep-link open before capture

# ─── Colours ──────────────────────────────────────────────────────────────────

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'

# ─── Argument parsing ─────────────────────────────────────────────────────────

UDID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --udid)   UDID="$2"; shift 2 ;;
    --dest)   DEST_DIR="$2"; shift 2 ;;
    --wait)   WAIT_AFTER_APPEARANCE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--udid <udid>] [--dest <dir>] [--wait <seconds>]"
      exit 0
      ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# ─── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo -e "${CYAN}▸ $*${RESET}"; }
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠ $*${RESET}"; }
err()  { echo -e "${RED}✗ $*${RESET}"; exit 1; }

pause() {
  local msg="${1:-"Press Enter when ready…"}"
  echo ""
  echo -e "${BOLD}${YELLOW}▶ ${msg}${RESET}"
  read -r
}

set_appearance() {
  # $1 = dark | light
  xcrun simctl ui "$UDID" appearance "$1" 2>/dev/null || true
  sleep "$WAIT_AFTER_APPEARANCE"
}

open_url() {
  xcrun simctl openurl "$UDID" "$1"
  sleep "$WAIT_AFTER_LAUNCH"
}

capture() {
  # $1 = destination filename (no extension)
  local out="$TMPDIR_SCREENSHOTS/$1.png"
  xcrun simctl io "$UDID" screenshot "$out"
  echo "$out"
}

# ─── Simulator detection ──────────────────────────────────────────────────────

detect_simulator() {
  # Returns the UDID of the first booted simulator, or empty string.
  xcrun simctl list devices booted --json 2>/dev/null \
    | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data.get('devices', {}).items():
    for d in devices:
        if d.get('state') == 'Booted':
            print(d['udid'])
            sys.exit(0)
" 2>/dev/null || true
}

list_simulators() {
  xcrun simctl list devices booted 2>/dev/null | grep -v "^==" | grep "Booted" || true
}

# ─── Main ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}  SideShelf Screenshot Capture Automation${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# Resolve simulator UDID
if [[ -z "$UDID" ]]; then
  UDID="$(detect_simulator)"
  if [[ -z "$UDID" ]]; then
    warn "No booted simulator found. Booted simulators:"
    list_simulators || true
    echo ""
    echo -e "Boot a simulator in Xcode or via: ${DIM}xcrun simctl boot <udid>${RESET}"
    echo -e "Or pass it directly: ${DIM}$0 --udid <udid>${RESET}"
    err "No booted simulator."
  fi
fi

log "Using simulator: $UDID"

# Verify dest dir
if [[ ! -d "$DEST_DIR" ]]; then
  warn "Destination directory does not exist: $DEST_DIR"
  echo -e "Creating it now…"
  mkdir -p "$DEST_DIR"
fi
log "Screenshots will be placed in: $DEST_DIR"

echo ""
echo -e "${DIM}Tip: Make sure the SideShelf app is installed and you're logged in.${RESET}"
echo -e "${DIM}Tip: Status bar hidden = cleaner screenshots (Device → ⌘/ in Simulator).${RESET}"
echo ""

# ── SCREEN 1: Library ─────────────────────────────────────────────────────────

echo -e "${BOLD}[ 1 / 3 ] Library Screen${RESET}"
echo    "  • Tab: Library"
echo    "  • What to show: Book grid with cover art (6–9 books visible, covers loaded)"
echo    "  • Make sure grid view is active (not list view)"
echo ""

open_url "${APP_SCHEME}:///"
pause "Navigate to the Library tab. Ensure the book grid is visible with cover art loaded, then press Enter."

log "Capturing library — dark mode…"
set_appearance dark
capture "screenshot-library-dark"

log "Capturing library — light mode…"
set_appearance light
capture "screenshot-library-light"

ok "Library screenshots captured."

# ── SCREEN 2: Full-Screen Player ──────────────────────────────────────────────

echo ""
echo -e "${BOLD}[ 2 / 3 ] Full-Screen Player${RESET}"
echo    "  • How to open: Start playing a book, then tap the mini player to expand it"
echo    "  • What to show: Chapter title, progress bar, playback controls all visible"
echo    "  • Note: the player deep link only works when audio is already playing"
echo ""

# Don't force the deep link here — the full-screen player requires active playback.
# Just wait for the user to open it manually.
pause "Start playing a book and tap the mini player to open the full-screen player, then press Enter."

log "Capturing player — dark mode…"
set_appearance dark
capture "screenshot-player-dark"

log "Capturing player — light mode…"
set_appearance light
capture "screenshot-player-light"

ok "Player screenshots captured."

# ── SCREEN 3: Downloads / Home ────────────────────────────────────────────────

echo ""
echo -e "${BOLD}[ 3 / 3 ] Downloads Screen${RESET}"
echo    "  • Tab: Home"
echo    "  • What to show: 'Continue Listening' section (in-progress) + 'Downloaded' section"
echo    "  • Ideal: both sections visible with 2–3 books each and cover art loaded"
echo    "  • If you have a dedicated Downloads screen in your app, use that instead"
echo ""

open_url "${APP_SCHEME}:///"
pause "Navigate to the Home tab so both 'Continue Listening' and 'Downloaded' sections are visible, then press Enter."

log "Capturing downloads — dark mode…"
set_appearance dark
capture "screenshot-downloads-dark"

log "Capturing downloads — light mode…"
set_appearance light
capture "screenshot-downloads-light"

ok "Downloads screenshots captured."

# ── Reset appearance ──────────────────────────────────────────────────────────

log "Resetting simulator appearance to dark…"
set_appearance dark

# ── Copy files to destination ─────────────────────────────────────────────────

echo ""
log "Copying screenshots to $DEST_DIR …"

FILES=(
  "screenshot-library-dark"
  "screenshot-library-light"
  "screenshot-player-dark"
  "screenshot-player-light"
  "screenshot-downloads-dark"
  "screenshot-downloads-light"
)

for name in "${FILES[@]}"; do
  src="$TMPDIR_SCREENSHOTS/$name.png"
  dst="$DEST_DIR/$name.png"
  if [[ -f "$src" ]]; then
    cp "$src" "$dst"
    ok "$name.png → $(du -sh "$dst" | cut -f1)"
  else
    warn "Missing capture: $src"
  fi
done

# Clean up temp
rm -rf "$TMPDIR_SCREENSHOTS"

echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  All done! 6 screenshots placed in:${RESET}"
echo -e "${BOLD}${GREEN}  $DEST_DIR${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "Next: run ${DIM}cd $(dirname "$DEST_DIR"/../..) && npm run build${RESET} to verify the site picks them up."
echo ""
