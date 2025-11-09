# Build Variant Architecture Investigation

## Overview

This document outlines the current architecture of the Audiobookshelf React Native app and provides recommendations for implementing free vs paid build variants.

**Date:** November 9, 2025
**App Name:** SideShelf
**Technology Stack:** React Native with Expo, Zustand for state management, SQLite with Drizzle ORM

---

## 1. Navigation Architecture

### Current Structure

- **Framework:** Expo Router (file-based routing)
- **Main Entry:** `/src/app/_layout.tsx`

#### Tab Structure

The app uses a bottom tab navigation with 5 main tabs defined in `/src/app/(tabs)/_layout.tsx`:

1. **Home** - Continue listening, downloaded items, listen again
2. **Library** - Main library with items organized by selected library
3. **Series** - Browse series (collections of items)
4. **Authors** - Browse authors
5. **More** - Settings, logs, advanced options, collections

#### Key Files

- `/src/app/(tabs)/_layout.tsx` - Tab navigation configuration
- `/src/app/(tabs)/home/index.tsx` - Home tab
- `/src/app/(tabs)/library/index.tsx` - Library tab
- `/src/app/(tabs)/series/index.tsx` - Series tab
- `/src/app/(tabs)/authors/index.tsx` - Authors tab
- `/src/app/(tabs)/more/index.tsx` - More/Settings tab

#### Tab Configuration

The tabs are defined as a TAB_CONFIG array that can be conditionally filtered based on variant.

**Variant Implication:** Tab visibility and feature access can be controlled conditionally based on a build variant flag.

---

## 2. Library & Server Management

### Authentication Flow

**File:** `/src/providers/AuthProvider.tsx`

The authentication system handles:

- Server URL configuration
- Username/password login
- Token management (access + refresh tokens)
- Auto-refresh of expired tokens
- Secure credential storage

#### Key Components

```
Auth State: {
  serverUrl: string | null
  accessToken: string | null
  refreshToken: string | null
  username: string | null
}
```

#### Token Management

- Tokens stored securely in `expo-secure-store`
- Tokens persisted via `/src/lib/secureStore.ts`
- Auto-refresh mechanism for expired tokens
- Login endpoint: `/api/v1/login`
- Refresh endpoint: `/api/v1/auth/refresh`

### Library Connection Logic

**File:** `/src/stores/slices/librarySlice.ts`

The library selection flow:

1. User logs in with server URL, username, password
2. AuthProvider stores credentials securely
3. API client configured with base URL and access token
4. Libraries fetched via API endpoint
5. Selected library items fetched and cached
6. All data persisted to local SQLite database

### Database Storage

**Files:**

- `/src/db/client.ts` - SQLite connection (Drizzle ORM)
- `/src/db/schema/` - Schema definitions (libraries, items, authors, series, etc.)
- `/src/db/helpers/` - Data access helpers

**Current Database Name:** `abs2.sqlite`

#### Key Tables

- `libraries` - Available libraries
- `libraryItems` - Individual items (books, podcasts)
- `authors` - Author information
- `series` - Series information
- `mediaProgress` - User's listening progress
- `listeningSession` - Active/completed sessions
- `downloads` - Downloaded items metadata

**Variant Implication:** Database schema remains the same; variant differences handled at feature/UI level.

---

## 3. App Configuration Structure

### Entry Point & Initialization

**File:** `/src/index.ts` - Contains `initializeApp()` function

Initialization sequence:

1. Logger initialization (with persistent settings)
2. App version checking (handles updates)
3. React Native Track Player setup
4. Player state restoration
5. Progress service rehydration

### Current Configuration Management

#### App Settings Module

**File:** `/src/lib/appSettings.ts`

Stores user preferences in AsyncStorage with keys for:

- Background service reconnection
- Jump intervals (forward/backward)
- Smart rewind enabled
- Periodic now playing updates

#### Expo Configuration

**File:** `app.json`

Current configuration includes:

- App name: "SideShelf"
- Bundle IDs for iOS and Android
- Plugin configuration
- Splash screen settings

#### Build Configuration

**File:** `eas.json`

Current build profiles:

- `development` - Development client with hot reload
- `preview` - Internal testing builds
- `production` - App store submission builds

**Current Limitation:** No variant-specific configuration exists yet.

---

## 4. Feature Flags & Environment Configuration

### Current State

**No explicit feature flag system exists.** However, the infrastructure supports implementation:

#### Available Detection Methods

1. **Build-time:** Via `app.json` configuration
2. **Runtime:** Custom app constant
3. **Environment variables:** Via build-time substitution

#### Existing Development Detection

The codebase uses `__DEV__` for development-specific logic, demonstrating conditional execution patterns already in use.

### Recommended Approach for Variants

**Recommended: Hybrid Approach**

- Use build-time variant for app metadata (bundle ID, app name, version strings)
- Use runtime feature flag module for feature gating logic
- Provides both compile-time and runtime flexibility

---

## 5. State Management Architecture

### Zustand Store Structure

**File:** `/src/stores/appStore.ts`

Uses Zustand slice pattern with multiple domain-specific slices:

#### Key Slices

1. **LibrarySlice** - Selected library and items, sorting
2. **AuthorsSlice** - Authors list and browsing
3. **SeriesSlice** - Series list and browsing
4. **PlayerSlice** - Current playback state
5. **HomeSlice** - Home tab data (continue listening, downloaded, etc.)
6. **SettingsSlice** - User preferences
7. **DownloadSlice** - Download management and progress
8. **StatisticsSlice** - Usage and listening statistics
9. **LibraryItemDetailsSlice** - Detailed item data cache
10. **UserProfileSlice** - User and device info
11. **LoggerSlice** - Logging state

#### Provider Initialization

**File:** `/src/providers/StoreProvider.tsx`

Initializes stores based on API and database readiness:

```
Each slice is initialized with conditional checks for:
- apiConfigured (auth tokens and server URL available)
- dbInitialized (database connection ready)
```

**Variant Implication:** Slice initialization can be conditionally skipped in free version.

---

## 6. Main Entry Points & App Initialization

### Complete Initialization Flow

```
1. app.json (Expo configuration)
   ↓
2. src/app/_layout.tsx (RootLayout - Expo Router)
   ↓
3. initializeApp() - Core app initialization
   ├─ Logger setup
   ├─ TrackPlayer registration
   ├─ Player state restoration
   └─ Progress service rehydration
   ↓
4. DbProvider - Initialize SQLite database
   ↓
5. AuthProvider - Load stored credentials, configure API
   ↓
6. StoreProvider - Initialize all Zustand slices
   ↓
7. Tab Navigation - Display main UI
```

### Key Entry Files

1. **`src/app/_layout.tsx`**
   - Root layout using Expo Router Stack
   - App initialization trigger
   - Provider composition
   - Font loading
   - Deep link handling for logger configuration

2. **`src/index.ts`**
   - `initializeApp()` - Application startup function
   - Logger and service initialization
   - State restoration logic

3. **`src/providers/DbProvider.tsx`**
   - Database context provider
   - SQLite initialization

4. **`src/providers/AuthProvider.tsx`**
   - Authentication context
   - Token management
   - API configuration

5. **`src/providers/StoreProvider.tsx`**
   - Zustand store initialization
   - Conditional slice initialization based on API/DB readiness

---

## 7. Services Architecture

### Key Services

**Location:** `/src/services/`

1. **PlayerService** (`PlayerService.ts`)
   - Audio playback control
   - TrackPlayer integration
   - Playback state management

2. **PlayerBackgroundService** (`PlayerBackgroundService.ts`)
   - Background audio event handling
   - Remote control integration

3. **ProgressService** (`ProgressService.ts`)
   - Listening progress tracking
   - Session management
   - Server progress synchronization

4. **DownloadService** (`DownloadService.ts`)
   - Download management
   - File system handling
   - Progress reporting

### API Configuration

**File:** `/src/lib/api/api.ts`

Centralized API handling:

- Dynamic base URL from authentication state
- Bearer token authorization
- Automatic 401 token refresh
- Custom User-Agent with device information
- Request/response logging

---

## 8. Recommendations for Build Variant Implementation

### Architecture Overview

Use a **hybrid approach:**

1. **Build-time metadata** - Different app names, bundle IDs, EAS configurations
2. **Runtime feature detection** - Feature flag module for conditional features

### Recommended File Structure

New files to create:

```
src/lib/variants.ts               - Variant detection and configuration
src/lib/features.ts               - Feature availability checks
docs/VARIANT_SETUP.md             - Setup instructions
eas-free.json                     - EAS build config for free variant
eas-pro.json                      - EAS build config for pro variant
app-free.json                     - App config for free variant
app-pro.json                      - App config for pro variant
.env.free                         - Environment for free variant
.env.pro                          - Environment for pro variant
```

Files to modify:

```
src/app/(tabs)/_layout.tsx        - Conditional tab rendering
src/providers/StoreProvider.tsx   - Conditional store initialization
src/app/(tabs)/more/index.tsx     - Upsell/upgrade prompts
Various components                - Feature flag checks
package.json scripts              - Build variant commands
```

### Variant Detection Implementation

**Recommended approach using Expo Constants:**

```typescript
// src/lib/variants.ts
import Constants from "expo-constants";

export type AppVariant = "free" | "pro";

const appConfig = Constants.expoConfig;
export const appVariant: AppVariant = (appConfig?.extra?.variant as AppVariant) || "free";

export const isProVersion = appVariant === "pro";

export const features = {
  multipleLibraries: isProVersion,
  advancedFilters: isProVersion,
  series: isProVersion,
  collections: isProVersion,
  backgroundSync: isProVersion,
  customPlaybackSpeeds: isProVersion,
  statistics: isProVersion,
  unlimitedDownloads: isProVersion,
} as const;
```

### Suggested Feature Breakdown

**Free Tier:**

- Single library (with option to switch)
- Basic playback controls (play, pause, skip with preset intervals)
- Listening history
- Smart rewind
- Basic search and sorting
- Limited to 1 book download

**Pro Tier:**

- Multiple library access
- Advanced filtering (by author, series, narrator)
- Series browsing and management
- Collections/playlists
- Unlimited downloads
- Background sync options
- Custom playback speeds
- Detailed statistics and analytics
- Advanced settings

### Navigation Conditional Logic

**In `/src/app/(tabs)/_layout.tsx`:**

```typescript
const TAB_CONFIG = [
  { name: "home", ... },
  { name: "library", ... },
  ...(features.series ? [{ name: "series", ... }] : []),
  ...(features.multipleLibraries ? [{ name: "authors", ... }] : []),
  { name: "more", ... },
];
```

### Store Initialization Conditional Logic

**In `/src/providers/StoreProvider.tsx`:**

```typescript
if (features.series) {
  useSeriesStoreInitializer(apiConfigured, dbInitialized);
}
if (features.multipleLibraries) {
  useAuthorsStoreInitializer(apiConfigured, dbInitialized);
}
// Always initialize core slices
useLibraryStoreInitializer(apiConfigured, dbInitialized);
```

### Component-Level Feature Checks

Any component can check features:

```typescript
import { features } from '@/lib/features';

function MyComponent() {
  if (!features.advancedFilters) {
    return <BasicFilterUI />;
  }

  return <AdvancedFilterUI />;
}
```

---

## 9. Key Architectural Advantages

1. **Minimal Code Changes** - Feature flags are additive, doesn't break existing code
2. **Clean Separation** - Variant logic isolated in dedicated modules
3. **Single Database** - Both variants use same schema, same tables
4. **Scalable** - Easy to add more tiers (Basic, Pro, Premium) later
5. **Runtime Flexibility** - Can disable features without rebuild if needed for testing
6. **User Migration** - Users can upgrade without data loss or migration
7. **Testing** - Each variant independently testable

---

## 10. Database Considerations

### Schema Compatibility

- Use same database file for both variants
- Premium features stored in same tables (just not displayed/functional in free version)
- No migration or versioning issues between variants

### Storage Keys

- All storage keys can remain the same
- `appSettings.ts` settings apply to both variants (user preferences persist)
- Feature availability determined by variant, not by storage

---

## 11. Implementation Roadmap

### Phase 1: Foundation (1-2 days)

- [ ] Create variant detection module (`src/lib/variants.ts`)
- [ ] Create feature flags module (`src/lib/features.ts`)
- [ ] Create variant-specific `app-free.json` and `app-pro.json`
- [ ] Create variant-specific EAS configs

### Phase 2: Navigation & UI (2-3 days)

- [ ] Implement conditional tab rendering
- [ ] Add upsell/upgrade prompts for locked features
- [ ] Update feature availability checks in components
- [ ] Create upgrade flow UI

### Phase 3: Store & Services (1-2 days)

- [ ] Conditional store initialization
- [ ] Feature-based API call restrictions
- [ ] Download limit enforcement

### Phase 4: Testing & Builds (1-2 days)

- [ ] Test both variants locally
- [ ] Build both variants with EAS
- [ ] Test variant-specific features
- [ ] Create variant-specific submission configs

### Phase 5: Deployment (1-2 days)

- [ ] Submit free version to app stores
- [ ] Submit pro version to app stores
- [ ] Set up analytics tracking per variant
- [ ] Create marketing materials

---

## 12. Risk Mitigation

| Risk               | Mitigation                                               |
| ------------------ | -------------------------------------------------------- |
| Database conflicts | Use same schema, feature availability checked at runtime |
| User confusion     | Clear naming: "SideShelf" vs "SideShelf Pro"             |
| Feature regression | Feature flags are additive, free is base version         |
| Code maintenance   | Isolated variant logic, clear comments                   |
| Rollback           | Variant flag toggle disables premium features            |
| Testing complexity | Separate build configs for testing each variant          |

---

## Summary

The application is well-architected for implementing build variants. The recommended approach:

1. **Build-time separation** - Different app configurations and build profiles
2. **Runtime feature flags** - Conditional feature availability
3. **Shared codebase** - Single database, shared components with conditional rendering
4. **Scalable design** - Easy to add more tiers in the future

Key implementation points:

- Feature flag module (`src/lib/variants.ts` and `src/lib/features.ts`)
- Conditional tab rendering in navigation
- Store slice conditional initialization
- Component-level feature checks
- Proper app metadata per variant
- Separate EAS and app.json configurations

This approach requires minimal changes to existing code while providing a clean, maintainable system for managing multiple app variants.
