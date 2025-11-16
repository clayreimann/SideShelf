# GitHub Pages OTA Updates (Without EAS)

This guide explains how to use GitHub Pages to host Expo OTA updates without requiring EAS Update.

## Overview

expo-updates doesn't load raw JavaScript bundles - it requires a proper update manifest with metadata, assets, and integrity hashes. However, you can host these updates anywhere, including GitHub Pages.

## How It Works

```
┌─────────────────┐
│   GitHub PR     │
│   Opened/Push   │
└────────┬────────┘
         │
         ├─► Build & Export Update (expo export)
         │   Creates: manifest, bundles, assets
         │
         ├─► Deploy to GitHub Pages
         │   Location: /updates/pr-{number}/
         │
         └─► Comment on PR with URL
             https://user.github.io/repo/updates/pr-123
```

## Workflow Setup

### 1. Enable GitHub Pages

1. Go to your repository **Settings → Pages**
2. Source: Deploy from a branch
3. Branch: `gh-pages` / `(root)`
4. Click Save

### 2. Workflow Configuration

The `.github/workflows/publish-pr-update.yml` workflow automatically:

- Exports a proper Expo update with manifest
- Deploys to `gh-pages` branch
- Creates a URL: `https://{user}.github.io/{repo}/updates/pr-{number}`
- Comments on PR with instructions

### 3. Build App with Custom Update URL

To use GitHub Pages updates, build your app with the base URL:

```bash
# Using the helper script
./scripts/build-with-custom-updates.sh \
  https://username.github.io/repo/updates/pr-123 \
  preview

# Or manually
EXPO_PUBLIC_UPDATE_URL="https://username.github.io/repo/updates/pr-123" \
  eas build --profile preview --platform ios
```

## Update Structure

GitHub Pages hosts a complete Expo update:

```
updates/pr-123/
├── metadata.json           # Expo update manifest
├── bundles/
│   ├── ios-{hash}.js      # iOS JavaScript bundle
│   └── android-{hash}.js  # Android JavaScript bundle
├── assets/
│   ├── {hash}             # Images, fonts, etc.
│   └── ...
├── pr-metadata.json       # PR info (custom)
└── index.html             # Human-readable info page
```

## Using Updates in the App

### Option 1: Build with Update URL (Recommended)

Build your TestFlight app pointing to the GitHub Pages URL:

```bash
./scripts/build-with-custom-updates.sh \
  https://username.github.io/repo/updates \
  preview
```

Then in the app:
- Updates check automatically uses GitHub Pages
- No manual URL entry needed
- Works exactly like EAS Update

### Option 2: Manual URL Entry (Current UI)

The current UI allows entering URLs, but **this only works if you rebuild** the app with that URL configured in `app.config.js`.

Limitation: expo-updates reads the update URL from build-time configuration, not runtime storage.

## Update Flow

```
1. Developer pushes to PR
   └─► GitHub Actions runs

2. Workflow exports update
   ├─► npx expo export
   ├─► Creates manifest + bundles
   └─► Deploys to gh-pages branch

3. GitHub Pages serves update
   └─► https://user.github.io/repo/updates/pr-123

4. Tester loads in app
   ├─► App built with GitHub Pages URL
   ├─► Checks for updates
   ├─► Downloads manifest
   ├─► Fetches bundles & assets
   └─► Reloads with new code
```

## Comparison: GitHub Pages vs EAS Update

| Feature | GitHub Pages | EAS Update |
|---------|-------------|------------|
| Cost | Free | Paid (above free tier) |
| Setup | Manual workflow | Integrated |
| Hosting | Your GitHub Pages | Expo's CDN |
| URL | Custom domain/GH Pages | eas.com subdomain |
| Build integration | Manual env var | Automatic |
| Runtime URL change | ❌ Requires rebuild | ❌ Requires rebuild |
| Manifest format | Same | Same |
| Client compatibility | ✅ expo-updates | ✅ expo-updates |

Both use the same expo-updates client - only the hosting differs.

## Runtime Version Matching

**Critical**: Updates must match the app's runtime version.

```json
// app.config.js
{
  "runtimeVersion": {
    "policy": "appVersion"  // Uses version from package.json
  }
}
```

If your app is version `1.0.0`, the update manifest must also be `1.0.0`.

### Handling Version Mismatches

If you update the app version in `package.json`:
1. The new build will have a different runtime version
2. Old updates won't be compatible
3. You need to publish new updates matching the new version

## Security Considerations

### 1. HTTPS Required
- GitHub Pages serves over HTTPS ✅
- expo-updates requires secure connections
- Self-hosting requires valid SSL certificate

### 2. CORS Headers
GitHub Pages automatically allows cross-origin requests ✅

If self-hosting, configure:
```nginx
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD
```

### 3. Manifest Integrity
expo-updates validates:
- Bundle hashes match manifest
- Runtime version compatibility
- Asset integrity

### 4. No Built-in Signature Verification
expo-updates does not verify manifest signatures by default.

For production, consider:
- Restricting who can push to `gh-pages`
- Using branch protection rules
- Implementing custom signature checking

## Troubleshooting

### "No updates available"

**Check:**
1. Is GitHub Pages enabled?
2. Is the `gh-pages` branch deployed?
3. Does the URL return `metadata.json`?
4. Does the runtime version match?

**Test:**
```bash
# Check if manifest is accessible
curl https://username.github.io/repo/updates/pr-123/metadata.json

# Should return JSON with "runtimeVersion", "bundleUrl", etc.
```

### "Update failed to download"

**Check:**
1. Network connectivity
2. CORS headers (should work on GitHub Pages)
3. Bundle file exists at URL in manifest
4. No authentication required

### "Update downloaded but app crashes"

**Check:**
1. Runtime version matches exactly
2. Bundle compiled for correct platform (iOS/Android)
3. No JavaScript errors in bundle
4. Assets are accessible

### GitHub Pages not deploying

**Check:**
1. Workflow has `contents: write` permission
2. `gh-pages` branch exists
3. No merge conflicts in `gh-pages`
4. Workflow completes successfully

**Manually trigger:**
```bash
git checkout gh-pages
git pull origin gh-pages
# Verify updates/ directory exists
ls -la updates/
```

## Alternative: Self-Hosted Server

You can host updates anywhere, not just GitHub Pages:

### Requirements:
1. Static file server with HTTPS
2. CORS enabled
3. Proper Expo update manifest structure
4. Same runtime version as app

### Examples:

**Netlify:**
```bash
# Deploy dist/ folder
npx expo export --output-dir dist
netlify deploy --dir dist
```

**Vercel:**
```bash
# Deploy dist/ folder
npx expo export --output-dir dist
vercel deploy dist
```

**AWS S3 + CloudFront:**
```bash
npx expo export --output-dir dist
aws s3 sync dist s3://your-bucket/updates/
```

**Your own server:**
```bash
npx expo export --output-dir dist

# Copy to server
scp -r dist/* user@server:/var/www/updates/

# Configure nginx
server {
  location /updates/ {
    add_header Access-Control-Allow-Origin *;
    root /var/www;
  }
}
```

## Limitations

### Cannot Change Update URL at Runtime
expo-updates reads the server URL from build configuration, not runtime settings.

**Current UI limitation:**
The Bundle Loader UI allows entering a URL, but this doesn't actually change where expo-updates checks.

**To use different URLs:**
You must rebuild the app with a different `EXPO_PUBLIC_UPDATE_URL`.

### Requires Rebuild for Different PRs
Each PR has a different URL. To test different PRs:
- Option A: Rebuild app with each PR's URL
- Option B: Use a dynamic URL that redirects

### Example Dynamic URL:
```bash
# Build with base URL
EXPO_PUBLIC_UPDATE_URL="https://username.github.io/repo/updates/latest" \
  eas build --profile preview

# Deploy each PR to /updates/latest
# App always checks same URL, but content changes
```

## Best Practices

### 1. One Build, Multiple Updates
Build once with a stable URL:
```bash
EXPO_PUBLIC_UPDATE_URL="https://username.github.io/repo/updates" \
  eas build --profile preview
```

Deploy each PR to subdirectories:
```
/updates/pr-123/
/updates/pr-124/
/updates/pr-125/
```

Share different URLs, but testers need different builds.

### 2. Use Channels for Different Environments
```bash
# Development
EXPO_PUBLIC_UPDATE_URL="https://...github.io/repo/updates/dev"

# Staging
EXPO_PUBLIC_UPDATE_URL="https://...github.io/repo/updates/staging"

# Production
EXPO_PUBLIC_UPDATE_URL="https://...github.io/repo/updates/prod"
```

### 3. Automate Cleanup
Old PR updates consume space:
```yaml
# Add to workflow
- name: Clean old PR updates
  run: |
    # Keep only last 10 PRs
    cd updates/
    ls -t | tail -n +11 | xargs -I {} rm -rf {}
```

### 4. Add Monitoring
Track update success rate:
```typescript
Updates.addListener(event => {
  if (event.type === Updates.UpdateEventType.ERROR) {
    // Log to analytics
    logUpdateError(event.message);
  }
});
```

## Future Enhancements

### Possible Improvements:
1. **Update manifest server** - Dynamic routing to PR updates
2. **QR code generation** - Scan to load update
3. **Update preview UI** - Show changelog before applying
4. **Rollback mechanism** - Revert to previous update
5. **Update notifications** - Push notification when update available

### Community Projects:
- [expo-updates-server](https://github.com/expo/expo-updates-server) - Official self-hosted server
- Custom update routers and proxies
- Update management dashboards

## Conclusion

GitHub Pages provides a free, reliable way to host Expo OTA updates without EAS:

✅ No additional cost
✅ Simple CI/CD integration
✅ Same expo-updates client
✅ Full control over hosting

⚠️ Requires build-time configuration
⚠️ Manual workflow setup
⚠️ No built-in rollback/analytics

For most teams testing PR changes, GitHub Pages is an excellent solution.
