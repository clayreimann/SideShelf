#!/bin/bash
# build-device.sh — Build and install SideShelf on a connected iOS device.
# Passes -allowProvisioningUpdates so Xcode auto-registers bundle ID and
# downloads provisioning profiles from Apple's servers without needing manual
# Xcode setup.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="${REPO_ROOT}/ios/SideShelf.xcworkspace"
SCHEME="SideShelf"
DERIVED_DATA="${REPO_ROOT}/ios/build"
TEAM_ID="PQMW4AT355"

# Find connected iPhone — extract the UDID (UUID-format field), not the hostname
DEVICE_ID=$(xcrun devicectl list devices --json-output - 2>/dev/null | python3 -c "
import sys, json
data = json.load(sys.stdin)
for d in data.get('result', {}).get('devices', []):
    props = d.get('connectionProperties', {})
    hw = d.get('hardwareProperties', {})
    if props.get('transportType') and 'iPhone' in hw.get('productType', ''):
        print(hw['udid'])
        break
" 2>/dev/null)
if [ -z "$DEVICE_ID" ]; then
  echo "Error: No connected iPhone found. Connect your device via USB and try again."
  exit 1
fi

echo "→ Device: ${DEVICE_ID}"
echo "→ Prebuilding..."
cd "$REPO_ROOT"
npx expo prebuild --clean --platform ios

echo "→ Building (provisioning updates enabled)..."
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -destination "platform=iOS,id=${DEVICE_ID}" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="${TEAM_ID}" \
  build

APP_PATH=$(find "$DERIVED_DATA" -name "SideShelf.app" -not -path "*/Index.noindex/*" 2>/dev/null | head -1)
if [ -z "$APP_PATH" ]; then
  echo "Error: Built .app not found under ${DERIVED_DATA}"
  exit 1
fi

echo "→ Installing on device..."
xcrun devicectl device install app \
  --device "${DEVICE_ID}" \
  "${APP_PATH}"

echo "✓ Done — SideShelf installed on ${DEVICE_ID}"
