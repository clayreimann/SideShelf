# iCloud Backup Exclusion Native Module

This plugin adds a native iOS module that allows the app to exclude files and directories from iCloud backup. This is useful for large downloadable content (audiobooks, podcasts) that shouldn't consume users' iCloud storage.

## How It Works

This follows the Expo CNG (Continuous Native Generation) pattern where:

1. **Native source files** are committed to the repo in `plugins/excludeFromBackup/ios/`
2. **Config plugin** (`withExcludeFromBackup.ts`) copies these files into `ios/` during `expo prebuild`
3. **The `ios/` directory** is NOT committed to git and can be regenerated at any time

## Usage

### JavaScript/TypeScript

```typescript
import {
  setExcludeFromBackup,
  isExcludedFromBackup,
} from "@/lib/iCloudBackupExclusion";

// Exclude a directory from iCloud backup
await setExcludeFromBackup("/path/to/downloads");

// Check if a file is excluded
const { excluded } = await isExcludedFromBackup("/path/to/file");
```

### With expo-file-system

```typescript
import * as FileSystem from "expo-file-system";
import { setExcludeFromBackup } from "@/lib/iCloudBackupExclusion";

// Download a file and exclude it from backup
const downloadPath = FileSystem.documentDirectory + "audiobook.m4b";
await FileSystem.downloadAsync(url, downloadPath);
await setExcludeFromBackup(downloadPath);
```

## Files

- `ios/ICloudBackupExclusion.h` - Objective-C header
- `ios/ICloudBackupExclusion.m` - Native implementation
- `withExcludeFromBackup.ts` - Expo config plugin

## Platform Support

- **iOS**: Full support
- **Android**: No-op (methods return successfully but don't do anything)
- **Web**: No-op

## Apple Documentation

This module uses the `NSURLIsExcludedFromBackupKey` resource value:
https://developer.apple.com/documentation/foundation/nsurl/1617553-setresourcevalues

## Regenerating Native Projects

If you need to regenerate the iOS project:

```bash
rm -rf ios android
npx expo prebuild --clean
npx expo run:ios
```

The plugin will automatically copy the native source files and register them with Xcode.
