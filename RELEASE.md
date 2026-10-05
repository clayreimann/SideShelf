# How to build/deploy releases

This document describes the different build types and how to create them.

## Build Types

### Preview Builds (Internal Distribution)

Preview builds are internal binaries for testing proposed changes before production. OTA updates
are currently disabled, so every JavaScript or native change requires a new preview binary.

- Use the `preview` EAS channel as a dormant future-routing value
- Preserve the embedded bundle and normal Expo recovery behavior
- Are for internal/TestFlight testing only, not App Store submission

**When to use:** Testing PRs, QA validation, internal testing

#### Build Preview for iOS

```shell
# Build with preview profile
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

**Testing changes with preview builds:**

1. Build the exact commit being reviewed.
2. Install or distribute the resulting internal build.
3. Record the commit, build number, device, and test result.
4. Build again when JavaScript or native code changes.

See `docs/architecture/OTA_UPDATES.md` for the current OTA status.

---

### Production Builds (App Store Distribution)

Production builds are for App Store submission. OTA updates are currently disabled, so these builds:

- Launch the embedded JavaScript bundle
- Do not contain an update-server URL
- Preserve the normal embedded-bundle recovery behavior

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

2. **Treat the tag as a release identifier only**:
   - Tagging does not publish an OTA update or create an installable JavaScript bundle
   - Building and submitting the production binary remain explicit steps

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

1. **Build a preview candidate**:

   ```shell
   APP_VARIANT=preview npx eas-cli build --platform ios --profile preview
   npx eas-cli submit --platform ios --path=./build-XXX.ipa
   ```

2. **Rebuild for each tested commit**:
   - PRs do not publish installable OTA bundles
   - JavaScript-only changes still require a new preview binary
   - Record the tested commit and generated build number

The approved Worker + R2 design must pass its production gates before these instructions describe
OTA publication:

- `docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md`

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
