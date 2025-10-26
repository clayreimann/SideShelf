#!/usr/bin/env bash

# Simple helper to capture live iOS logs (device or simulator) with sensible defaults.
# Usage:
#   scripts/capture-ios-logs.sh            # stream logs for the first attached device/sim
#   scripts/capture-ios-logs.sh my-device  # stream logs for a specific device name/UDID
#
# Requires Xcode command-line tools. For physical devices on macOS 15+, install `ios-deploy`
# or use `rvictl` / Xcode's native logging. This script falls back to `idevicesyslog`
# if available; otherwise it uses `xcrun simctl` for the currently booted simulator.

set -euo pipefail

DEVICE_FILTER="${1-}"

has_command() {
  command -v "$1" >/dev/null 2>&1
}

stream_simulator_logs() {
  local device_arg=()
  if [[ -n "$DEVICE_FILTER" ]]; then
    device_arg=(--device "$DEVICE_FILTER")
  fi
  echo "ℹ️  Streaming simulator logs via xcrun simctl ${device_arg[*]}"
  # `log stream` supports predicates; limit to our bundle identifier to reduce noise.
  local bundle_id
  bundle_id=$(node -p "require('../app.json').expo?.bundleIdentifier || require('../app.json').expo?.ios?.bundleIdentifier || ''" 2>/dev/null || echo "")
  local predicate=""
  if [[ -n "$bundle_id" ]]; then
    predicate="--predicate 'processImagePath CONTAINS \"${bundle_id}\"'"
  fi
  # shellcheck disable=SC2086
  xcrun simctl spawn "${device_arg[@]}" log stream --style syslog ${predicate}
}

stream_device_logs() {
  if has_command idevicesyslog; then
    local device_arg=()
    if [[ -n "$DEVICE_FILTER" ]]; then
      device_arg=(-u "$DEVICE_FILTER")
    fi
    echo "ℹ️  Streaming physical device logs via idevicesyslog ${device_arg[*]}"
    idevicesyslog "${device_arg[@]}"
  else
    echo "❌  idevicesyslog not found. Install libimobiledevice or use Xcode's Devices & Simulators window."
    exit 1
  fi
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "❌  iOS logs can only be collected on macOS."
  exit 1
fi

# Prefer physical device logging if a device filter looks like a UDID.
if [[ "$DEVICE_FILTER" =~ ^[0-9A-Fa-f-]{25,}$ ]]; then
  stream_device_logs
else
  # Try simulator first; fall back to idevicesyslog if the command fails.
  if stream_simulator_logs; then
    exit 0
  fi
  echo "⚠️  Simulator log stream failed; falling back to device logging."
  stream_device_logs
fi
