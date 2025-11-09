# Build Variant Implementation Guide

## Quick Start

This guide provides step-by-step instructions for implementing free vs paid variants of the SideShelf app.

---

## Part 1: Create Variant Configuration Files

### 1.1 Create `src/lib/variants.ts`

```typescript
import Constants from "expo-constants";

export type AppVariant = "free" | "pro";

// Detect variant from app.json extra.variant
const appConfig = Constants.expoConfig;
export const appVariant: AppVariant = (appConfig?.extra?.variant as AppVariant) || "free";

export const isProVersion = appVariant === "pro";
export const isFreeVersion = !isProVersion;

// Feature configuration based on variant
export const variantConfig = {
  // App branding
  appName: isProVersion ? "SideShelf Pro" : "SideShelf",

  // Library features
  maxLibraries: isProVersion ? Infinity : 1,
  multipleLibrariesEnabled: isProVersion,

  // Downloads
  maxDownloads: isProVersion ? Infinity : 1,
  unlimitedDownloads: isProVersion,

  // Series and Authors
  seriesEnabled: isProVersion,
  authorsEnabled: isProVersion,

  // Advanced features
  collectionsEnabled: isProVersion,
  advancedSearch: isProVersion,
  customPlaybackSpeeds: isProVersion,
  backgroundSync: isProVersion,
  statistics: isProVersion,
} as const;

// Type-safe feature check
export type FeatureKey = keyof typeof variantConfig;

export function hasFeature(feature: FeatureKey): boolean {
  return variantConfig[feature] !== false && variantConfig[feature] !== 0;
}
```

### 1.2 Create `src/lib/features.ts`

```typescript
import { variantConfig, isProVersion } from "./variants";

// Feature flag object for easier imports in components
export const features = {
  // Libraries
  multipleLibraries: variantConfig.multipleLibrariesEnabled,

  // Browse tabs
  series: variantConfig.seriesEnabled,
  authors: variantConfig.authorsEnabled,

  // Download features
  unlimited_downloads: variantConfig.unlimitedDownloads,
  max_downloads: variantConfig.maxDownloads,

  // Advanced features
  collections: variantConfig.collectionsEnabled,
  advanced_search: variantConfig.advancedSearch,
  custom_speeds: variantConfig.customPlaybackSpeeds,
  background_sync: variantConfig.backgroundSync,
  statistics: variantConfig.statistics,

  // Metadata
  is_pro: isProVersion,
} as const;

// Helper to show upgrade prompts
export function requiresPro(feature: keyof typeof features): boolean {
  return isProVersion === false && features[feature as keyof typeof features] === false;
}
```

---

## Part 2: App Configuration Files

### 2.1 Create `app-free.json`

Keep most of `app.json` the same, but add:

```json
{
  "expo": {
    "name": "SideShelf",
    "slug": "side-shelf",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "side-shelf",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "cloud.madtown.sideshelf"
    },
    "android": {
      "package": "cloud.madtown.sideshelf"
    },
    "extra": {
      "variant": "free",
      "eas": {
        "projectId": "YOUR_PROJECT_ID"
      }
    },
    "plugins": ["expo-router", "expo-splash-screen", "expo-font", "expo-web-browser"],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

### 2.2 Create `app-pro.json`

```json
{
  "expo": {
    "name": "SideShelf Pro",
    "slug": "side-shelf-pro",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon-pro.png",
    "scheme": "side-shelf-pro",
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "cloud.madtown.sideshelf.pro"
    },
    "android": {
      "package": "cloud.madtown.sideshelf.pro"
    },
    "extra": {
      "variant": "pro",
      "eas": {
        "projectId": "YOUR_PROJECT_ID"
      }
    },
    "plugins": ["expo-router", "expo-splash-screen", "expo-font", "expo-web-browser"],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

### 2.3 Create `eas-free.json`

```json
{
  "cli": {
    "version": ">= 16.24.1",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "6754254923"
      }
    }
  }
}
```

### 2.4 Create `eas-pro.json`

```json
{
  "cli": {
    "version": ">= 16.24.1",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "ascAppId": "YOUR_PRO_APP_ID"
      }
    }
  }
}
```

---

## Part 3: Build Scripts

### 3.1 Update `package.json`

Add variant-specific build scripts:

```json
{
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo prebuild --clean && expo run:ios",

    "start:free": "expo start --config app-free.json",
    "start:pro": "expo start --config app-pro.json",

    "build:free:ios": "eas build --platform ios --config eas-free.json --profile production",
    "build:free:android": "eas build --platform android --config eas-free.json --profile production",
    "build:pro:ios": "eas build --platform ios --config eas-pro.json --profile production",
    "build:pro:android": "eas build --platform android --config eas-pro.json --profile production",

    "submit:free:ios": "eas submit --platform ios --config eas-free.json --profile production",
    "submit:pro:ios": "eas submit --platform ios --config eas-pro.json --profile production",

    "test:free": "expo start --config app-free.json",
    "test:pro": "expo start --config app-pro.json"
  }
}
```

---

## Part 4: Navigation Updates

### 4.1 Update `src/app/(tabs)/_layout.tsx`

```typescript
import { features } from '@/lib/features';

// Filter TAB_CONFIG based on features
const FULL_TAB_CONFIG: TabConfig[] = [
  { name: "home", titleKey: "tabs.home", ... },
  { name: "library", titleKey: "tabs.library", ... },
  ...(features.series
    ? [{ name: "series", titleKey: "tabs.series", ... }]
    : []),
  ...(features.authors
    ? [{ name: "authors", titleKey: "tabs.authors", ... }]
    : []),
  { name: "more", titleKey: "tabs.more", ... },
];

// Use filtered config in component
export default function TabLayout() {
  // ... existing code ...

  // In render, use FULL_TAB_CONFIG instead of TAB_CONFIG
  {FULL_TAB_CONFIG.map((tab) => {
    // ... existing mapping code ...
  })}
}
```

---

## Part 5: Store Initialization

### 5.1 Update `src/providers/StoreProvider.tsx`

```typescript
import { features } from '@/lib/features';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { apiConfigured, username } = useAuth();
  const { initialized: dbInitialized } = useDb();

  // Always initialize core stores
  useLibraryStoreInitializer(apiConfigured, dbInitialized);
  usePlayerStoreInitializer();
  useSettingsStoreInitializer();
  useDownloadsStoreInitializer();
  useHomeStoreInitializer(username ? username : null);
  useUserProfileStoreInitializer(username);

  // Conditionally initialize advanced stores
  if (features.series) {
    useSeriesStoreInitializer(apiConfigured, dbInitialized);
  }

  if (features.authors) {
    useAuthorsStoreInitializer(apiConfigured, dbInitialized);
  }

  return <>{children}</>;
}
```

---

## Part 6: Feature-Based UI

### 6.1 Create Download Limit Check

```typescript
// In a download component
import { features } from '@/lib/features';
import { useDownloads } from '@/stores/appStore';

function DownloadButton({ itemId }: { itemId: string }) {
  const { downloadedItems, startDownload } = useDownloads();
  const canDownload = features.unlimited_downloads ||
                      downloadedItems.length < features.max_downloads;

  if (!canDownload && !features.unlimited_downloads) {
    return (
      <Button
        title="Upgrade to download more"
        onPress={() => navigateToUpgrade()}
        style={styles.disabledButton}
      />
    );
  }

  return (
    <Button
      title="Download"
      onPress={() => startDownload(itemId)}
      enabled={canDownload}
    />
  );
}
```

### 6.2 Create Upgrade Prompt Component

```typescript
// src/components/ui/UpgradePrompt.tsx
import { features, requiresPro } from '@/lib/features';

interface UpgradePromptProps {
  feature: string;
  title: string;
  description: string;
  onUpgradePress: () => void;
}

export function UpgradePrompt({
  feature,
  title,
  description,
  onUpgradePress
}: UpgradePromptProps) {
  if (features.is_pro) {
    return null; // Pro users don't see upgrade prompts
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Button
        title="Upgrade to Pro"
        onPress={onUpgradePress}
        style={styles.button}
      />
    </View>
  );
}
```

### 6.3 Usage in Components

```typescript
import { features } from '@/lib/features';
import { UpgradePrompt } from '@/components/ui/UpgradePrompt';

function SeriesTab() {
  if (!features.series) {
    return (
      <UpgradePrompt
        feature="series"
        title="Series Browsing"
        description="Browse audiobooks organized by series"
        onUpgradePress={() => navigateToUpgrade()}
      />
    );
  }

  return <SeriesTabContent />;
}
```

---

## Part 7: Testing Both Variants

### 7.1 Test Free Variant

```bash
# Install dependencies
npm install

# Start free variant
npm run start:free

# In another terminal, build free variant
npm run build:free:ios
```

**Checklist:**

- [ ] Only Home, Library, More tabs visible
- [ ] Series tab hidden
- [ ] Authors tab hidden
- [ ] Download limit enforced (max 1)
- [ ] Upgrade prompts appear for premium features
- [ ] Settings show basic options only

### 7.2 Test Pro Variant

```bash
npm run start:pro
npm run build:pro:ios
```

**Checklist:**

- [ ] All tabs visible (Home, Library, Series, Authors, More)
- [ ] No download limit
- [ ] No upgrade prompts
- [ ] All advanced features available
- [ ] Settings show all options

---

## Part 8: App Store Submission

### 8.1 iOS Submission

```bash
# Build and submit free version
npm run build:free:ios
npm run submit:free:ios

# Build and submit pro version
npm run build:pro:ios
npm run submit:pro:ios
```

### 8.2 Android Submission

```bash
# Free version
npm run build:free:android
# Submit to Google Play Console manually

# Pro version
npm run build:pro:android
# Submit to Google Play Console manually
```

---

## Part 9: Analytics Integration

### 9.1 Track Variant in Analytics

```typescript
import { appVariant } from "@/lib/variants";

function initializeAnalytics() {
  // Example with Firebase
  analytics().setUserProperty("app_variant", appVariant);

  // Track feature access
  analytics().logEvent("feature_accessed", {
    feature: "series_browsing",
    variant: appVariant,
    timestamp: new Date().toISOString(),
  });
}
```

---

## Part 10: Common Implementation Patterns

### Pattern 1: Feature Flag in Component

```typescript
import { features } from '@/lib/features';

function MyComponent() {
  return (
    <>
      <BasicFeature />

      {features.advanced_search && <AdvancedSearch />}

      {!features.custom_speeds && (
        <UpgradePrompt feature="custom_speeds" />
      )}
    </>
  );
}
```

### Pattern 2: Conditional Service Behavior

```typescript
// In a service file
import { features } from "@/lib/features";

export async function downloadItem(itemId: string) {
  if (!features.unlimited_downloads) {
    const downloadCount = getDownloadCount();
    if (downloadCount >= features.max_downloads) {
      throw new Error("Download limit reached. Upgrade to Pro.");
    }
  }

  // ... download logic ...
}
```

### Pattern 3: Navigate to Upgrade Screen

```typescript
import { useRouter } from "expo-router";
import { isProVersion } from "@/lib/variants";

function navigateToUpgrade() {
  const router = useRouter();
  if (!isProVersion) {
    router.push("/more/upgrade"); // Create this screen
  }
}
```

---

## Checklist for Implementation

- [ ] Create `src/lib/variants.ts`
- [ ] Create `src/lib/features.ts`
- [ ] Create `app-free.json`
- [ ] Create `app-pro.json`
- [ ] Create `eas-free.json`
- [ ] Create `eas-pro.json`
- [ ] Update `package.json` with variant scripts
- [ ] Update `src/app/(tabs)/_layout.tsx` for conditional tabs
- [ ] Update `src/providers/StoreProvider.tsx` for conditional initialization
- [ ] Create `UpgradePrompt` component
- [ ] Add feature checks in relevant components
- [ ] Test free variant thoroughly
- [ ] Test pro variant thoroughly
- [ ] Submit both variants to app stores
- [ ] Set up analytics tracking
- [ ] Create upgrade/pricing screen

---

## Troubleshooting

### Issue: Features not loading based on variant

**Solution:** Ensure `app.json` (or `app-free.json`/`app-pro.json`) has `extra.variant` set correctly.

### Issue: Store slices not conditional

**Solution:** Check that `StoreProvider.tsx` has conditional initialization with feature checks.

### Issue: Navigation not updated

**Solution:** Verify `TAB_CONFIG` filtering in `_layout.tsx` and cache clearing.

### Issue: Build fails with variant config

**Solution:** Run `expo prebuild --clean` and verify all app.json files are valid JSON.

---

## Performance Considerations

1. **Bundle Size:** Pro version slightly larger due to additional features
2. **Store Initialization:** Free version skips Series/Authors slices, faster startup
3. **Download Logic:** Download limit checks add minimal overhead
4. **Feature Checks:** Use static import, resolved at build time when possible

---

## Future Enhancements

1. Add more tiers (e.g., Basic, Pro, Premium)
2. Implement in-app purchase for premium features
3. Trial period for pro features
4. Family sharing
5. Cloud backup of progress

---

## References

- Expo Router Documentation: https://expo.dev/routing
- Zustand Documentation: https://github.com/pmndrs/zustand
- EAS Build Configuration: https://docs.expo.dev/build/
- Feature Flag Patterns: https://martinfowler.com/articles/feature-toggles.html
