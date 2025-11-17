# OTA Updates for TestFlight Builds

This document explains the OTA (Over-The-Air) update system that allows TestFlight builds to load new JavaScript code without requiring a full app rebuild.

## Rationale

**Problem:** Distributing new TestFlight builds for every JavaScript change is slow and unnecessary.

**Solution:** Use expo-updates to load new JavaScript bundles while keeping the same native binary.

**Benefits:**
- Test PR changes in minutes instead of hours
- No TestFlight build queue delays
- JavaScript-only changes don't require native rebuilds
- Free hosting via GitHub Pages (no EAS required)

## Architecture Overview

```
Developer Push → CI Exports Update → GitHub Pages Hosting → TestFlight App Loads
                 (manifest + bundles)   (static HTTPS CDN)      (expo-updates)
```

### Key Components

1. **expo-updates** - React Native library that fetches and applies JavaScript updates
2. **GitHub Pages** - Free static hosting for update manifests and bundles
3. **CI Workflow** - Automated export and deployment on every PR
4. **Build Configuration** - Dynamic app.config.js for custom update URLs

## How It Works

### Update Structure

expo-updates requires a specific structure (not raw .jsbundle files):

```
updates/pr-123/
├── metadata.json          # Manifest with bundle URLs, hashes, runtime version
├── bundles/
│   ├── ios-{hash}.js     # JavaScript bundle for iOS
│   └── android-{hash}.js # JavaScript bundle for Android
└── assets/               # Images, fonts, etc.
```

**Critical:** The manifest includes integrity hashes and runtime version. expo-updates validates these before loading.

### Update Flow

1. **PR opened** → Workflow runs `expo export` → Creates manifest + bundles
2. **Deploy to GitHub Pages** → Available at `https://user.github.io/repo/updates/pr-123`
3. **Build TestFlight app** with update URL configured in `app.config.js`
4. **App checks for updates** → Downloads manifest → Validates → Fetches bundles → Reloads

### Runtime Version Matching

**Why it matters:** expo-updates only loads updates with matching runtime versions.

```javascript
// app.config.js
{
  "runtimeVersion": {
    "policy": "appVersion"  // Uses version from package.json (e.g., "1.0.0")
  }
}
```

If app version is `1.0.0`, updates must also be `1.0.0`. Version bumps require new builds.

**Rationale:** Prevents loading incompatible JavaScript that expects different native APIs.

## Configuration

### Build-Time URL Configuration

**Key Constraint:** expo-updates reads the update server URL at build time, not runtime.

```bash
# Build with GitHub Pages URL
EXPO_PUBLIC_UPDATE_URL="https://user.github.io/repo/updates/pr-123" \
  eas build --profile preview --platform ios
```

**Rationale:** This is a limitation of expo-updates. The URL is baked into the native binary.

**Implication:** Different PRs require different builds, OR use a stable URL that redirects.

### Dynamic App Configuration

`app.config.js` replaces static `app.json` to support environment variables:

```javascript
const CUSTOM_UPDATE_URL = process.env.EXPO_PUBLIC_UPDATE_URL;

module.exports = () => ({
  // ... other config
  updates: {
    enabled: true,
    checkAutomatically: "NEVER",  // Manual control only
    ...(CUSTOM_UPDATE_URL && { url: CUSTOM_UPDATE_URL }),
  },
});
```

**Rationale:** Allows building the same codebase with different update servers without code changes.

## Workflows

### PR Update Workflow

`.github/workflows/publish-pr-update.yml` automates:

1. Export update on every PR push
2. Deploy to `gh-pages` branch
3. Comment on PR with URL and instructions

**Rationale:** Zero manual steps for developers. Testers get instant access to PR updates.

### Test Coverage Workflow

`.github/workflows/test-coverage.yml` runs tests and exports bundles as artifacts.

**Rationale:** Fallback if GitHub Pages isn't enabled. Manual download still possible.

## Hosting Options

### GitHub Pages (Recommended)

**Pros:**
- Free HTTPS hosting
- CORS enabled by default
- CDN backed
- No account/signup required beyond GitHub

**Cons:**
- Requires repository access
- Public unless repo is private
- Build-time URL configuration

### EAS Update

**Pros:**
- Integrated with Expo ecosystem
- Rollback and analytics built-in
- Runtime channel switching (with work)

**Cons:**
- Costs money above free tier
- Requires Expo account
- Less control over infrastructure

### Self-Hosted

**Pros:**
- Full control
- Private hosting
- Custom authentication

**Cons:**
- Requires server maintenance
- Must configure HTTPS + CORS
- No built-in CDN

**Rationale for GitHub Pages:** Best balance of cost (free), ease (automatic), and reliability (GitHub infrastructure).

## Security Considerations

### Integrity Validation

expo-updates validates:
- Bundle hash matches manifest
- Runtime version compatibility
- Asset checksums

**Rationale:** Prevents tampered or incompatible updates from loading.

### No Signature Verification

expo-updates does **not** verify manifest signatures by default.

**Mitigation:**
- Restrict `gh-pages` branch write access
- Use branch protection rules
- Review workflow changes carefully

**Rationale for acceptance:** GitHub repository access is already trusted. Additional signatures add complexity without meaningful security benefit in this context.

### HTTPS Required

expo-updates requires HTTPS for update servers.

**Rationale:** Prevents MITM attacks. GitHub Pages provides this automatically.

## Limitations

### No Runtime URL Changes

The Bundle Loader UI allows entering URLs, but expo-updates ignores this setting. The URL must be configured at build time.

**Why this exists:** Originally intended for runtime switching. Kept for potential future enhancement with proxy/redirect approach.

**Current behavior:** URL input is saved to settings but not used by expo-updates.

**Workaround:** Use a stable URL (e.g., `/updates/latest`) that you update to point to different PRs.

### Requires Rebuild for Different PRs

Each PR has a unique URL. To test multiple PRs:
- **Option A:** Build once per PR with that PR's URL
- **Option B:** Build with stable URL, redirect server-side

**Rationale:** Constraint of expo-updates architecture. Not easily changeable without ejecting.

### Preview/Production Builds Only

Development builds use the Metro bundler, not expo-updates.

**Rationale:** Dev builds prioritize fast refresh and debugging over update mechanism.

## Implementation Details

### BundleService

Thin wrapper around expo-updates API providing:
- Current bundle information
- Update availability checking
- Update download and application
- App reload after update

**Rationale:** Centralized update logic. Abstracts expo-updates API from UI components.

### Settings Integration

`customUpdateUrl` field stored in settings for:
- Documentation purposes
- Potential future use with redirect proxies
- User visibility into configured URL

**Current limitation:** Not used by expo-updates. Saved for future enhancement.

**Rationale:** Prepared for potential runtime URL switching if expo-updates adds support or we implement a proxy.

## Troubleshooting

### "No updates available"

**Check:**
- Is GitHub Pages enabled and deployed?
- Does `metadata.json` exist at the URL?
- Does runtime version match exactly?

### "Update downloaded but app crashes"

**Check:**
- JavaScript errors in bundle (check logs)
- Runtime version mismatch
- Assets missing or incorrect paths

### Different PR needs testing

**Options:**
1. Build new TestFlight with that PR's URL
2. Update stable URL to point to new PR
3. Use redirect server at stable URL

## Future Enhancements

### Potential Improvements

1. **Update proxy server** - Single stable URL, routes to different PRs dynamically
2. **QR code scanner** - Scan to configure update URL (still requires rebuild)
3. **Rollback mechanism** - Easy revert to previous update
4. **Update notifications** - Alert when new updates available

**Rationale for not implementing now:** Core functionality works. Enhancements can wait for demonstrated need.

## Alternative Hosting: Audiobookshelf Server

The app could fetch updates directly from the Audiobookshelf server instance:

```
User's Audiobookshelf → Hosts update manifest → TestFlight app loads
```

**Pros:**
- No GitHub dependency
- Private updates
- Server-controlled rollout

**Cons:**
- Requires Audiobookshelf server changes
- Each user needs server update
- More complex deployment

**Status:** Possible future feature. Not implemented.

**Rationale:** GitHub Pages provides simpler path to value. Server-hosted updates can be added later if needed.

## Summary

**What:** OTA updates let TestFlight builds load new JavaScript without rebuilding.

**How:** expo-updates fetches manifests from GitHub Pages, validates, and loads bundles.

**Why:** Faster iteration (minutes vs hours), no TestFlight queue, free hosting.

**Tradeoff:** Update URL configured at build time. Different PRs need different builds or redirect proxy.

**Result:** Significant time savings for testing JavaScript changes in TestFlight.
