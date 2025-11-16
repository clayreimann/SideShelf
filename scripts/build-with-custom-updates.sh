#!/bin/bash

#
# Build Helper Script - Custom Update URL
#
# This script helps build your app with a custom expo-updates server URL.
# Useful for loading updates from GitHub Pages or your own server.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== SideShelf Custom Update Builder ===${NC}\n"

# Check if URL is provided
if [ -z "$1" ]; then
  echo -e "${RED}Error: Update URL is required${NC}"
  echo ""
  echo "Usage: $0 <update-url> [build-profile]"
  echo ""
  echo "Examples:"
  echo "  $0 https://username.github.io/repo/updates/pr-123 preview"
  echo "  $0 https://my-server.com/updates production"
  echo ""
  exit 1
fi

UPDATE_URL="$1"
BUILD_PROFILE="${2:-preview}"

echo -e "Update URL: ${GREEN}${UPDATE_URL}${NC}"
echo -e "Build Profile: ${GREEN}${BUILD_PROFILE}${NC}"
echo ""

# Validate URL
if [[ ! "$UPDATE_URL" =~ ^https?:// ]]; then
  echo -e "${RED}Error: Update URL must start with http:// or https://${NC}"
  exit 1
fi

# Export environment variable
export EXPO_PUBLIC_UPDATE_URL="$UPDATE_URL"

echo -e "${YELLOW}Building app with custom update URL...${NC}"
echo ""

# Build for iOS (TestFlight)
echo -e "${GREEN}Starting EAS build for iOS...${NC}"
eas build \
  --profile "$BUILD_PROFILE" \
  --platform ios \
  --non-interactive

echo ""
echo -e "${GREEN}=== Build Complete ===${NC}"
echo ""
echo "Your app has been built with custom update URL:"
echo -e "${GREEN}${UPDATE_URL}${NC}"
echo ""
echo "When the app checks for updates, it will query:"
echo "  ${UPDATE_URL}/metadata.json"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "  - Ensure your update server is accessible"
echo "  - The manifest must match your app's runtime version"
echo "  - Updates only work in preview/production builds"
echo ""
