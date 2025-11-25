# How to build/deploy releases

This document describes the different build types and how to create them.

## Build Types

### Preview Builds (TestFlight with OTA Updates)

Preview builds enable **dynamic bundle loading** for faster PR testing. These builds:

- Include `disableAntiBrickingMeasures: true` (allows runtime URL switching)
- Can load different PR bundles without rebuilding
- Are for TestFlight testing only (not App Store submission)

**When to use:** Testing PRs, QA validation, internal testing

#### Build Preview for iOS

```shell
# Build with preview profile (enables OTA bundle loading)
APP_VARIANT=preview npx eas-cli build --platform ios --profile preview

# Or build locally
APP_VARIANT=preview npx eas-cli build --platform ios --profile preview --local

# Upload to TestFlight
npx eas-cli submit --platform ios --path=./build-XXX.ipa
```

#### Build Preview for Android

```shell
# Build with preview profile
APP_VARIANT=preview npx eas-cli build --platform android --profile preview

# Or build locally
APP_VARIANT=preview npx eas-cli build --platform android --profile preview --local
```

**Testing PRs with Preview Builds:**

1. Open any PR → Get deep link from PR comment
2. Tap "Open in SideShelf" on your device
3. Confirm URL → Check for updates → Reload
4. To test a different PR, switch to its URL (requires app relaunch)

See `docs/architecture/OTA_UPDATES.md` for details.

---

### Production Builds (App Store Distribution)

Production builds are for App Store submission and **do not include OTA bundle loading**. These builds:

- Have `disableAntiBrickingMeasures: false` (safe rollback enabled)
- Use fixed update URLs or no updates
- Are optimized for production stability

**When to use:** App Store releases, production deployments

#### Build Production for iOS

```shell
# Build production release
npx eas-cli build --platform ios --profile production

# Or build locally
npx eas-cli build --platform ios --profile production --local

# Upload to TestFlight for final validation
npx eas-cli submit --platform ios --path=./build-XXX.ipa

# After TestFlight validation, submit to App Store via App Store Connect
```

#### Build Production for Android

```shell
# Build production release
npx eas-cli build --platform android --profile production

# Or build locally
npx eas-cli build --platform android --profile production --local

# Submit to Google Play (if configured)
npx eas-cli submit --platform android --path=./build-XXX.aab
```

---

## Versioning

**Release Tags:** `vX.Y.Z-B` where:

- `X.Y.Z` = Semantic version (major.minor.patch)
- `B` = iOS build number

**Examples:**

- `v1.0.0-123` - Version 1.0.0, build 123
- `v2.1.3-456` - Version 2.1.3, build 456

**Important:** The hyphen separates version from build number, NOT pre-release status. All tags on `main` are production releases. Pre-release testing uses the PR track.

---

## Release Workflow

### For App Store Releases

1. **Tag the release** on `main` branch with format `vX.Y.Z-B`:

   ```shell
   # Format: vMAJOR.MINOR.PATCH-BUILD
   # Example: v1.0.0-123 (version 1.0.0, iOS build 123)
   git tag v1.0.0-123
   git push origin v1.0.0-123
   ```

   **Note:** All release tags include the iOS build number after the hyphen. This is NOT a pre-release indicator—all tagged releases on `main` are production releases.

2. **GitHub Actions automatically**:
   - Exports OTA bundle to GitHub Pages at `/updates/releases/v1.0.0-123/`
   - Creates GitHub Release with deep link and bundle page

3. **Build production binary**:

   ```shell
   npx eas-cli build --platform ios --profile production
   ```

4. **Submit to App Store**:

   ```shell
   npx eas-cli submit --platform ios --path=./build-XXX.ipa
   ```

5. **Distribute via App Store Connect**

### For TestFlight Testing

1. **Build once with preview profile**:

   ```shell
   APP_VARIANT=preview npx eas-cli build --platform ios --profile preview
   npx eas-cli submit --platform ios --path=./build-XXX.ipa
   ```

2. **Test any PR** using the same build:
   - PRs auto-deploy bundles to GitHub Pages
   - Use deep links to switch between PRs
   - No rebuild required for JS-only changes

---

## Store submission details

**Promotional text**

A modern, feature-rich client for Audiobookshelf (https://www.audiobookshelf.org/) featuring offline downloads, progress sync, and a beautiful, intuitive interface

**Description**

A modern, feature-rich client for Audiobookshelf (https://www.audiobookshelf.org/) featuring offline downloads, progress sync, and a beautiful, intuitive interface

📱 About

SideShelf provides a native mobile experience for your Audiobookshelf library, featuring offline downloads, progress synchronization, and a beautiful, intuitive interface optimized for audiobook and podcast consumption.

✨ Key Features

- 📚 Complete Library Management: Browse and search your audiobook and podcast collections
- ⬇️ Offline Downloads: Download content for offline listening with intelligent storage management
- 🎵 Advanced Audio Player: Full-featured player with progress tracking, and playback speed controls
- 🔄 Real-time Sync: Seamless progress synchronization across all your devices
- 🎨 Beautiful UI: Modern design with dark/light theme support and customizable layouts
- 🔍 Smart Search: Find content quickly with advanced filtering and sorting options
