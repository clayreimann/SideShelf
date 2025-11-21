# Custom Expo Plugins

This directory contains custom Expo config plugins for SideShelf. These plugins extend the native capabilities of the app while maintaining compatibility with Expo's Continuous Native Generation (CNG).

## What is Expo CNG?

Expo CNG allows us to:

- Keep `ios/` and `android/` directories out of git (they're build artifacts)
- Regenerate native projects on-demand with `expo prebuild`
- Customize native code through config plugins
- Maintain a clean, JavaScript-first development workflow

## Available Plugins

### excludeFromBackup

Adds a native iOS module to exclude files from iCloud backup.

**Purpose**: Large downloaded content (audiobooks) shouldn't consume users' iCloud storage.

**Files**: See `excludeFromBackup/README.md`

## How Plugins Work

Each plugin:

1. **Stores native source code** in this `plugins/` directory (committed to git)
2. **Defines a config plugin** that runs during `expo prebuild`
3. **Copies files** into the generated `ios/` or `android/` directories
4. **Modifies build files** (Xcode project, Podfile, Gradle, etc.)

## Adding a New Plugin

1. Create a new directory: `plugins/myFeature/`
2. Add native source files: `plugins/myFeature/ios/` and/or `plugins/myFeature/android/`
3. Create config plugin: `plugins/myFeature/withMyFeature.ts`
4. Register in `app.json`:

```json
{
  "expo": {
    "plugins": ["./plugins/myFeature/withMyFeature.ts"]
  }
}
```

5. Test with:

```bash
rm -rf ios android
npx expo prebuild --clean
npx expo run:ios
```

## Rules

1. **Never edit `ios/` or `android/` directly** - those changes will be lost
2. **Always use config plugins** for native modifications
3. **Keep plugins focused** - one feature per plugin
4. **Document your plugins** - add a README in each plugin directory

## Resources

- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)
- [@expo/config-plugins API](https://github.com/expo/expo/tree/main/packages/@expo/config-plugins)
- [Creating Custom Native Modules](https://docs.expo.dev/modules/overview/)
