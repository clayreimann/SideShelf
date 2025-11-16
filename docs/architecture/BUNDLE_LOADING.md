# Bundle Loading for TestFlight Builds

This document explains the bundle loading feature that allows TestFlight builds to load custom JavaScript bundles from PR builds without requiring a full app rebuild.

## Overview

The bundle loading feature enables faster iteration during testing by allowing testers to load new JavaScript code into an existing TestFlight build. This is particularly useful for:

- Testing PR changes without waiting for a new TestFlight build
- Quick iteration on JavaScript-only changes
- Validating fixes before submitting to the App Store

## Architecture

### Components

1. **BundleService** (`src/services/BundleService.ts`)
   - Manages bundle downloads and validation
   - Interfaces with expo-updates for OTA updates
   - Provides bundle metadata and status information

2. **Settings Integration**
   - `src/lib/appSettings.ts` - Persistent storage for bundle URL
   - `src/stores/slices/settingsSlice.ts` - State management
   - `src/app/(tabs)/more/bundle-loader.tsx` - UI for bundle management

3. **GitHub Workflow** (`.github/workflows/test-coverage.yml`)
   - Exports JavaScript bundle on every PR
   - Uploads bundle as GitHub Actions artifact
   - Posts instructions to PR comments

## Requirements

### For Bundle Loading to Work

1. **expo-updates Enabled**
   - The app must be built with expo-updates installed and configured
   - Updates must be enabled in app.json
   - Currently enabled via `app.json`:
     ```json
     {
       "updates": {
         "enabled": true,
         "checkAutomatically": "NEVER",
         "fallbackToCacheTimeout": 0
       },
       "runtimeVersion": {
         "policy": "appVersion"
       }
     }
     ```

2. **Production or Preview Build**
   - expo-updates only works in production/preview builds
   - Development builds use the dev server instead
   - Build with EAS Build using `preview` or `production` profile

3. **Runtime Version Match**
   - The bundle must match the app's runtime version
   - Runtime version is based on app version (configured in app.json)
   - Mismatched versions will be rejected by expo-updates

4. **Bundle Hosting**
   - Bundles must be hosted on an accessible URL
   - HTTPS recommended for security
   - Options include:
     - GitHub Pages
     - EAS Update (if using Expo infrastructure)
     - Your own server/CDN
     - Temporary file hosting services

## How to Use

### For Developers

1. **Create a PR**
   - Push changes to a PR branch
   - GitHub Actions will automatically build and export the bundle
   - Bundle artifact will be available in the workflow run

2. **Host the Bundle**
   - Download the bundle artifact from GitHub Actions
   - Extract the bundle files
   - Upload to a web-accessible location
   - Note the URL to the bundle file

3. **Share with Testers**
   - Share the bundle URL with testers
   - Provide instructions for loading in the app

### For Testers

1. **Open Bundle Loader**
   - Open SideShelf app
   - Navigate to: **More → Settings → Bundle Loader**

2. **Load Custom Bundle**
   - Enter the bundle URL provided by the developer
   - Tap "Save URL"
   - Tap "Check for Updates"
   - If an update is available, tap "Download"
   - Tap "Reload App" to apply the update

3. **Verify Update**
   - Check that the new changes are present
   - Bundle info screen shows the current update details

## Workflow Details

### GitHub Actions Workflow

The `test-coverage.yml` workflow has been enhanced to:

1. **Export Bundle**
   ```bash
   npx expo export --platform ios --platform android --output-dir dist
   ```

2. **Upload Artifact**
   - Artifact name: `js-bundle-pr-{PR_NUMBER}`
   - Includes both iOS and Android bundles
   - Retained for 30 days

3. **Post Instructions**
   - Automatically comments on PR with download instructions
   - Includes requirements and usage steps
   - Updates comment on subsequent pushes

### Bundle Export Contents

The exported bundle includes:

- `bundles/` - Platform-specific JavaScript bundles
- `assets/` - Static assets (images, fonts, etc.)
- `metadata.json` - Bundle metadata
- Asset maps and manifests

## Current Limitations

### expo-updates Dependency

The current implementation relies on expo-updates for runtime bundle loading. This means:

1. **Cannot use custom bundle URLs directly**
   - expo-updates expects updates from EAS Update servers
   - Custom URLs require EAS Update integration or modification

2. **Runtime version constraints**
   - Updates must match the exact runtime version
   - Major version changes require new builds

3. **Update channels**
   - expo-updates uses channels for routing updates
   - Custom channels need to be configured in eas.json

### Alternatives to expo-updates

If you want to avoid expo-updates and EAS infrastructure, you would need to:

#### Option 1: Bare React Native Bundle Loading
1. Eject to bare React Native workflow
2. Implement custom native code for bundle loading
3. Use React Native's Metro bundler directly
4. Handle bundle downloads and reloads in native code

Example approach:
- Download bundle to device storage
- Use `RCTBridge` (iOS) or `ReactInstanceManager` (Android)
- Load bundle from file:// URL
- Restart React Native to apply changes

#### Option 2: CodePush Alternative
1. Use a CodePush-like service
2. Implement custom update mechanism
3. More control over update flow
4. Requires significant native code

#### Option 3: Manual Download Only
1. Keep the download functionality
2. Remove the auto-apply mechanism
3. Users manually install bundles (not practical)
4. Useful for debugging/validation only

## Recommended Approach

### For Production Use

If you want fully functional bundle loading without EAS:

1. **Use EAS Update**
   - Publish updates to EAS Update channels
   - Update the workflow to use `eas update` instead of `expo export`
   - Configure channel-based routing in eas.json
   - No custom hosting required

2. **Example EAS Update Workflow**
   ```yaml
   - name: Publish EAS Update
     run: |
       eas update --branch pr-${{ github.event.pull_request.number }} \
                  --message "PR #${{ github.event.pull_request.number }}: ${{ github.event.pull_request.title }}"
     env:
       EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
   ```

3. **In the App**
   - Set update channel to the PR branch name
   - expo-updates will automatically fetch from EAS
   - More reliable and secure

### For Custom Infrastructure

If you prefer not to use EAS:

1. **Eject to Bare Workflow**
   - Run `npx expo prebuild` to generate native projects
   - Implement custom bundle loading in native code
   - Full control over update mechanism

2. **Implement Native Bundle Loader**
   ```swift
   // iOS Example
   class BundleLoader {
       func loadBundle(from url: URL) {
           // Download bundle
           // Validate bundle
           // Update RCTBridge bundleURL
           // Reload bridge
       }
   }
   ```

3. **Security Considerations**
   - Verify bundle signatures
   - Use HTTPS for downloads
   - Validate bundle integrity
   - Implement rollback mechanism

## Testing

### Manual Testing

1. **Build TestFlight App**
   ```bash
   eas build --profile preview --platform ios
   ```

2. **Make JS Changes**
   - Modify JavaScript code
   - Commit and push to PR

3. **Download Bundle**
   - Get bundle from GitHub Actions artifacts
   - Host on accessible server

4. **Load in App**
   - Use Bundle Loader screen
   - Enter bundle URL
   - Check for updates and apply

5. **Verify Changes**
   - Test the new functionality
   - Check bundle info shows correct version

### Automated Testing

Consider adding:
- Bundle validation tests
- Update flow integration tests
- Rollback scenario tests
- Version compatibility checks

## Troubleshooting

### "Updates not enabled"

- Check that expo-updates is installed: `npm list expo-updates`
- Verify app.json has updates configuration
- Ensure build is production/preview, not development

### "No updates available"

- Verify bundle URL is correct and accessible
- Check runtime version matches
- Ensure bundle was exported for the correct platform
- Review expo-updates configuration

### "Update failed to apply"

- Check bundle integrity
- Verify asset paths are correct
- Ensure sufficient device storage
- Check for JavaScript errors in bundle

### Bundle download fails

- Verify URL is accessible from device
- Check network connectivity
- Ensure HTTPS certificate is valid (if using HTTPS)
- Review file permissions on hosting server

## Future Enhancements

Potential improvements:

1. **QR Code Support**
   - Scan QR code to load bundle URL
   - Easier than manual URL entry

2. **Bundle Verification**
   - Cryptographic signature validation
   - Prevent malicious bundles

3. **Automatic PR Detection**
   - Auto-detect PR number from branch name
   - Fetch bundle directly from GitHub
   - No manual hosting required

4. **Update History**
   - Track loaded bundles
   - Rollback to previous versions
   - Compare bundle versions

5. **EAS Update Integration**
   - Automatic update publishing to EAS
   - Channel-based routing
   - No manual bundle hosting

## References

- [Expo Updates Documentation](https://docs.expo.dev/versions/latest/sdk/updates/)
- [EAS Update Guide](https://docs.expo.dev/eas-update/introduction/)
- [React Native Bundle Loading](https://reactnative.dev/docs/ram-bundles-inline-requires)
- [Metro Bundler](https://facebook.github.io/metro/)

## Security Considerations

When implementing bundle loading:

1. **Verify Sources**
   - Only load bundles from trusted sources
   - Implement allowlist of bundle URLs
   - Consider signature verification

2. **HTTPS Only**
   - Require HTTPS for bundle downloads
   - Prevent MITM attacks
   - Validate SSL certificates

3. **Version Validation**
   - Check runtime version compatibility
   - Validate bundle metadata
   - Prevent downgrades

4. **User Consent**
   - Inform users about bundle loading
   - Require explicit confirmation
   - Provide update details

5. **Rollback Capability**
   - Implement automatic rollback on errors
   - Keep previous bundle as backup
   - Monitor crash rates after updates

## Conclusion

The bundle loading feature provides infrastructure for loading custom bundles in TestFlight builds. The current implementation uses expo-updates and requires proper configuration to function. For production use, integrating with EAS Update is recommended. For custom solutions, ejecting to bare React Native and implementing native bundle loading provides the most flexibility.
