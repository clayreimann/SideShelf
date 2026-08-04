#!/usr/bin/env bash
# capture.sh — boot an iPhone 17 Pro Max simulator (the only device whose
# native resolution is exactly 1320x2868 — App Store Connect's required
# iPhone 6.9" size, at 3x from its 440x956pt screen, no scaling needed) and
# run the Maestro capture flow once per theme, depositing raw PNGs into
# .screenshots/raw/<theme>/.
#
# Usage: scripts/screenshots/capture.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.maestro"
APP_ID="cloud.madtown.sideshelf"
DEVICE_NAME="iPhone 17 Pro Max"

RAW_DIR="${REPO_ROOT}/.screenshots/raw"
DEBUG_DIR="${REPO_ROOT}/.screenshots/debug"
SANITY_DIR="${REPO_ROOT}/.screenshots/.sanity"

# Required native pixel dimensions for App Store Connect's iPhone 6.9" slot.
REQUIRED_WIDTH=1320
REQUIRED_HEIGHT=2868

THEMES=(dark light)
SURFACES=(home player library-grid downloads sleep-timer series)

log()  { echo ">> $*"; }
err()  { echo "ERROR: $*" >&2; exit 1; }

# ─── Credentials ──────────────────────────────────────────────────────────

if [[ ! -f "${ENV_FILE}" ]]; then
  err "${ENV_FILE} not found. Copy .env.maestro.example to .env.maestro and fill in your credentials."
fi

set -a
# shellcheck source=/dev/null
. "${ENV_FILE}"
set +a

: "${MAESTRO_SERVER_URL:?MAESTRO_SERVER_URL not set in .env.maestro}"
: "${MAESTRO_USERNAME:?MAESTRO_USERNAME not set in .env.maestro}"
: "${MAESTRO_PASSWORD:?MAESTRO_PASSWORD not set in .env.maestro}"

ENV_FLAGS=(
  --env "MAESTRO_USERNAME=${MAESTRO_USERNAME}"
  --env "MAESTRO_PASSWORD=${MAESTRO_PASSWORD}"
  --env "MAESTRO_SERVER_URL=${MAESTRO_SERVER_URL}"
)

# ─── Demo server reachability ─────────────────────────────────────────────

log "Checking demo server reachability at ${MAESTRO_SERVER_URL}..."
if ! curl -sf --max-time 5 "${MAESTRO_SERVER_URL%/}/ping" >/dev/null; then
  err "Could not reach ${MAESTRO_SERVER_URL%/}/ping. Is the demo Audiobookshelf server running and reachable? (checked via curl, 5s timeout)"
fi
log "Demo server is reachable."

# ─── Resolve / boot simulator ─────────────────────────────────────────────

find_device() {
  # Prints "<udid> <state>" for every "$DEVICE_NAME" simulator, one per line.
  xcrun simctl list devices --json 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data.get('devices', {}).items():
    for d in devices:
        if d.get('name') == '${DEVICE_NAME}':
            print(d['udid'], d.get('state', 'Unknown'))
"
}

UDID=""

# Prefer an already-booted iPhone 17 Pro Max.
while read -r candidate_udid candidate_state; do
  [[ -z "${candidate_udid}" ]] && continue
  if [[ "${candidate_state}" == "Booted" ]]; then
    UDID="${candidate_udid}"
    break
  fi
  [[ -z "${UDID}" ]] && UDID="${candidate_udid}"
done < <(find_device)

if [[ -z "${UDID}" ]]; then
  log "No ${DEVICE_NAME} simulator found — creating one..."
  LATEST_RUNTIME="$(xcrun simctl list runtimes --json 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
runtimes = [r for r in data.get('runtimes', []) if r.get('isAvailable') and 'iOS' in r.get('name', '')]
runtimes.sort(key=lambda r: r.get('version', ''))
print(runtimes[-1]['identifier'] if runtimes else '')
")"
  [[ -z "${LATEST_RUNTIME}" ]] && err "No available iOS simulator runtime found. Install one via Xcode > Settings > Platforms."
  UDID="$(xcrun simctl create "${DEVICE_NAME} (Screenshots)" "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max" "${LATEST_RUNTIME}")"
  log "Created simulator ${UDID} (${LATEST_RUNTIME})"
fi

log "Using simulator ${UDID}"

BOOT_STATE="$(xcrun simctl list devices --json 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data.get('devices', {}).items():
    for d in devices:
        if d['udid'] == '${UDID}':
            print(d.get('state', 'Unknown'))
")"

if [[ "${BOOT_STATE}" != "Booted" ]]; then
  log "Booting simulator..."
  xcrun simctl boot "${UDID}"
  xcrun simctl bootstatus "${UDID}" -b
fi

# Bring up the Simulator app window so screenshots actually render content
# (a headless-booted device with no window can render blank captures).
open -a Simulator --args -CurrentDeviceUDID "${UDID}" >/dev/null 2>&1 || true
sleep 2

# ─── Verify the app is installed ──────────────────────────────────────────

# Uses get_app_container rather than `listapps | grep -q`. Under this script's
# `set -o pipefail`, that pipeline reports a FALSE negative: grep -q exits at
# the first match and closes the pipe, simctl (still writing its long output)
# dies with SIGPIPE 141, and pipefail makes 141 the pipeline's status — so a
# perfectly installed app reads as missing. get_app_container is a single
# command with no pipe, and it already exits non-zero when the app is absent.
if ! xcrun simctl get_app_container "${UDID}" "${APP_ID}" >/dev/null 2>&1; then
  err "${APP_ID} is not installed on ${UDID}. Build and install it first (e.g. npx expo run:ios --udid ${UDID})."
fi

# ─── Require a Release build ──────────────────────────────────────────────
# A Debug build boots into the Expo dev-client launcher ("Development Servers
# / http://localhost:8081") and waits for Metro instead of starting the app,
# so every capture would be of the launcher. Even with Metro attached, a debug
# build is the wrong thing to photograph for the App Store — dev overlays,
# development-only behavior, and a "Development Build" banner.
#
# Release builds embed the JS bundle; debug builds don't. That file's presence
# is the discriminator.
INSTALLED_APP="$(xcrun simctl get_app_container "${UDID}" "${APP_ID}" 2>/dev/null)"
if [[ ! -f "${INSTALLED_APP}/main.jsbundle" ]]; then
  err "The installed ${APP_ID} is a DEBUG build (no embedded main.jsbundle) — it will launch the Expo dev-client, not the app. Rebuild in Release: npx expo run:ios --configuration Release --device ${UDID}"
fi

# ─── CRITICAL GUARD: verify native resolution before running anything ────
# App Store Connect rejects anything that isn't exactly 1320x2868 for the
# iPhone 6.9" slot. Check this immediately after boot, before spending time
# running the full Maestro flow twice.

mkdir -p "${SANITY_DIR}"
SANITY_PNG="${SANITY_DIR}/sanity.png"
log "Verifying simulator native resolution..."
xcrun simctl io "${UDID}" screenshot "${SANITY_PNG}" >/dev/null

SANITY_WIDTH="$(sips -g pixelWidth "${SANITY_PNG}" 2>/dev/null | awk '/pixelWidth/ {print $2}')"
SANITY_HEIGHT="$(sips -g pixelHeight "${SANITY_PNG}" 2>/dev/null | awk '/pixelHeight/ {print $2}')"

if [[ "${SANITY_WIDTH}" != "${REQUIRED_WIDTH}" || "${SANITY_HEIGHT}" != "${REQUIRED_HEIGHT}" ]]; then
  err "Simulator ${UDID} captured at ${SANITY_WIDTH}x${SANITY_HEIGHT}px, but App Store Connect requires exactly ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}px for iPhone 6.9\". This device must be an ${DEVICE_NAME} (440x956pt @3x) with no display scaling override. Check Simulator > Window > Physical Size vs Point Size is at default, and that no other device type got booted instead."
fi
log "Confirmed native resolution: ${SANITY_WIDTH}x${SANITY_HEIGHT}px"
rm -rf "${SANITY_DIR}"

# ─── Run the Maestro flow once per theme ──────────────────────────────────

run_theme() {
  local theme="$1"
  local out="${RAW_DIR}/${theme}"

  # Purge this theme's raw captures before running.
  #
  # This is not tidiness, it is the difference between a pipeline that reports
  # the truth and one that lies. Captures persist between runs, so a flow that
  # fails PART WAY through leaves the previous run's PNGs sitting on disk —
  # and every check below (file exists, file is 1320x2868) then passes against
  # stale images. Observed 2026-08-01: the flow failed at the player step, yet
  # the pipeline composited five images from a run four hours earlier and
  # printed "All done". Starting from an empty directory means a failed step
  # can only ever produce a MISSING file, which fails loudly.
  rm -rf "${out}"
  mkdir -p "${out}" "${DEBUG_DIR}/${theme}"

  log "Switching simulator to ${theme} mode..."
  xcrun simctl ui "${UDID}" appearance "${theme}"
  sleep 1

  log "Running Maestro flow (${theme})..."
  # Capture the exit status explicitly rather than relying on `set -e` to
  # propagate it out of the subshell — the same run that shipped stale images
  # also sailed past a Maestro run that had plainly reported FAILED, so the
  # implicit path is not trustworthy here. `|| status=$?` also keeps `set -e`
  # from killing the script before we can print a useful message.
  local status=0
  (
    cd "${out}"
    maestro test --udid "${UDID}" "${ENV_FLAGS[@]}" \
      "${REPO_ROOT}/.maestro/capture-screenshots.yaml" \
      --debug-output "${DEBUG_DIR}/${theme}" \
      --flatten-debug-output
  ) || status=$?

  if [[ ${status} -ne 0 ]]; then
    err "Maestro flow FAILED for the ${theme} theme (exit ${status}). Artifacts: ${DEBUG_DIR}/${theme}. Not compositing — the store set would be a mix of this run and whatever was left from the last one."
  fi

  local any_missing=0
  for surface in "${SURFACES[@]}"; do
    local src="${out}/screenshot-${surface}.png"
    if [[ ! -f "${src}" ]]; then
      echo "   MISSING screenshot-${surface}.png"
      any_missing=1
      continue
    fi

    local width height
    width="$(sips -g pixelWidth "${src}" 2>/dev/null | awk '/pixelWidth/ {print $2}')"
    height="$(sips -g pixelHeight "${src}" 2>/dev/null | awk '/pixelHeight/ {print $2}')"
    if [[ "${width}" != "${REQUIRED_WIDTH}" || "${height}" != "${REQUIRED_HEIGHT}" ]]; then
      err "screenshot-${surface}.png (${theme}) is ${width}x${height}px, expected ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}px. Aborting — do not composite mis-sized captures."
    fi
    echo "   OK   screenshot-${surface}.png (${width}x${height})"
  done

  if [[ ${any_missing} -ne 0 ]]; then
    err "Some screenshots missing for ${theme} -- check ${DEBUG_DIR}/${theme} for artifacts."
  fi
}

for theme in "${THEMES[@]}"; do
  run_theme "${theme}"
done

xcrun simctl ui "${UDID}" appearance dark

echo ""
echo "Raw captures written to ${RAW_DIR}/{dark,light}/"
