# SideShelf React Native App Structure Analysis

**Date**: November 16, 2025
**Scope**: App structure, bundler configuration, GitHub workflows, bundle loading, and developer settings

---

## 1. Project Overview

**App Name**: SideShelf (abs-react-native)
**Purpose**: Modern React Native client for Audiobookshelf - a self-hosted audiobook and podcast server
**Framework**: Expo (managed React Native)
**Main Branch**: main
**Current Branch**: claude/testflight-bundle-loading-01EqeiYHDbWC6oC41NQGGrvj

---

## 2. React Native Stack & Architecture

### 2.1 Core Dependencies

**React Native Setup:**
- React Native: 0.81.5
- Expo: 54.0.21
- React: 19.1.0
- Hermes Engine: Yes (configured in app.json as `jsEngine: "hermes"`)
- New Architecture: Enabled (`newArchEnabled: true` in app.json)

**Navigation & Routing:**
- expo-router: ~6.0.14 (File-based routing similar to Next.js)
- @react-navigation/*: 7.x versions (5 packages for navigation)

**State Management:**
- Zustand: ^5.0.8 (lightweight state management)
- AsyncStorage: 2.2.0 (persistence layer)

**Database & ORM:**
- expo-sqlite: ^16.0.8 (Local SQLite database)
- drizzle-orm: ^0.44.5 (Type-safe ORM)
- drizzle-kit: ^0.31.4 (Schema generation and migrations)

**Audio & Media:**
- react-native-track-player: ^4.1.2 (Background audio playback)
- expo-file-system: ~19.0.17 (File system access)
- react-native-background-downloader: Custom fork (background downloads)

**Development Tools:**
- Jest: ~29.7.0 (Testing framework)
- jest-expo: ~54.0.13 (Expo-specific Jest preset)
- @testing-library/react-native: ^13.3.3
- TypeScript: ~5.9.2
- ESLint: ^9.25.0
- Prettier: ^3.6.2
- expo-dev-client: ~6.0.16 (Custom dev client for enhanced development)

### 2.2 App Configuration Files

**Key Configuration Files:**

1. **app.json** (`/home/user/SideShelf/app.json`)
   - Expo configuration
   - Platform-specific settings (iOS, Android, web)
   - Bundle configuration with Hermes engine
   - Splash screen settings
   - Plugin declarations
   - Feature flags: `typedRoutes: true`, `reactCompiler: true`
   - iOS Bundle ID: `cloud.madtown.sideshelf`
   - Android Package: `cloud.madtown.sideshelf`

2. **metro.config.js** (`/home/user/SideShelf/metro.config.js`)
   ```javascript
   const { getDefaultConfig } = require('expo/metro-config');
   
   const config = getDefaultConfig(__dirname);
   config.resolver.sourceExts.push('sql');
   
   module.exports = config;
   ```
   - Uses Expo's Metro config as base
   - Adds SQL file support for database schema files
   - No custom bundler optimization configured

3. **babel.config.js** (`/home/user/SideShelf/babel.config.js`)
   ```javascript
   module.exports = function(api) {
     api.cache(true);
     return {
       presets: ['babel-preset-expo'],
       plugins: [["inline-import", { "extensions": [".sql"] }]],
     };
   };
   ```
   - Uses babel-preset-expo
   - Inline import plugin for .sql files
   - Cache enabled

4. **eas.json** (`/home/user/SideShelf/eas.json`)
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
   - EAS (Expo Application Services) build configuration
   - Development builds use custom Expo dev client
   - Production builds auto-increment version
   - iOS App Store ID configured

5. **tsconfig.json**
   - Strict TypeScript mode enabled
   - Path alias: `@/*` → `./src/*`
   - Extends expo/tsconfig.base

6. **jest.config.js**
   - Uses jest-expo preset
   - Custom setup files for SQLite mock
   - Test timeout: 10 seconds
   - Coverage collection configured
   - Transform ignore patterns for node_modules packages

### 2.3 Build Scripts

From `package.json`:
```json
"scripts": {
  "start": "expo start",
  "android": "expo run:android",
  "ios": "expo prebuild --clean && expo run:ios",
  "ios:device": "expo prebuild --clean && expo run:ios --device",
  "web": "expo start --web",
  "lint": "expo lint",
  "lint:complexity": "npx eslint . --ext .ts,.tsx,.js,.jsx --format json --output-file eslint-report.json || true",
  "test": "jest --watchAll=false",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage",
  "abs:debug": "node scripts/abs-debug.mjs",
  "drizzle:generate": "drizzle-kit generate --config=drizzle.config.ts",
  "drizzle:push": "drizzle-kit push --config=drizzle.config.ts"
}
```

---

## 3. Native Project Structure

**Important Note**: This is an Expo-managed app without traditional separate ios/ or android/ directories at the root level.

- **Prebuild Only**: Native code is generated on-demand using `expo prebuild`
- **Expo Plugins**: Custom plugins in `/home/user/SideShelf/expo-plugins/`
  - `ios-only-active-arch.ts` - iOS build optimization plugin
- **Native Configuration**: Managed through `app.json` and config plugins

### 3.1 Build Process

1. **Prebuild Phase**: `expo prebuild` generates ios/ and android/ directories
2. **Compilation**: 
   - iOS: Uses XCode (via `expo run:ios`)
   - Android: Uses Gradle (via `expo run:android`)
3. **Development**: 
   - Custom dev client (`expo-dev-client`)
   - Hot reload via Expo CLI
   - Metro bundler for JS bundling

---

## 4. GitHub Workflows

**Location**: `/home/user/SideShelf/.github/workflows/`

### 4.1 test-coverage.yml

**Purpose**: Test coverage reporting on pull requests

**Trigger**: PR opened/synchronized/reopened to main branch

**Jobs**:
1. Checkout code
2. Setup Node.js 20 with npm cache
3. Install dependencies (`npm ci`)
4. Run tests with coverage: `npm run test:coverage`
5. Run complexity check: `npm run lint:complexity`
6. Extract coverage summary from output
7. Post coverage comment to PR (upsert if exists)
8. Upload artifacts: coverage/ and eslint-report.json (30-day retention)

**Permissions**: 
- contents: read
- pull-requests: write
- checks: write

### 4.2 claude.yml

**Purpose**: Claude Code integration for PR assistance

**Triggers**:
- Issue comments containing @claude
- PR review comments containing @claude
- PR reviews containing @claude
- Issues opened/assigned with @claude in body or title

**Configuration**:
- Uses anthropics/claude-code-action@v1
- Requires CLAUDE_CODE_OAUTH_TOKEN secret
- Additional permissions: actions:read (for CI results)
- Runs on ubuntu-latest

### 4.3 claude-code-review.yml (Disabled)

**Status**: Commented out (disabled)

**Purpose**: Would provide automated Claude Code review on PRs

**Permissions Needed**:
- contents: read
- pull-requests: read
- issues: read
- id-token: write

---

## 5. JavaScript Bundle Loading & Development Settings

### 5.1 Development Mode Detection

The app uses **React Native's built-in `__DEV__`** global:

**Locations Where Used**:
- `/src/lib/logger/index.ts` - Line 74
  - Includes stack traces in development
  - Uses console transport in dev, SQLite only in prod
- `/src/index.ts` (app initialization)
  - Handles hot-reload scenarios
  - Error tolerance for track player init in dev
- `/src/services/PlayerBackgroundService.ts`
  - Includes "dev"/"prod" in service identifier
- `/src/services/PlayerService.ts`
  - Development-specific module cache clearing
  - Conditional hot-reload handling

### 5.2 Bundle Configuration

**Metro Bundler**:
- Configuration: `/home/user/SideShelf/metro.config.js`
- No custom bundle optimization configured
- Uses Expo's default Metro config
- Resolves `.sql` files as source extensions

**Hermes Engine**:
- Enabled in app.json
- Smaller bundle size (~40-50% smaller than JavaScriptCore)
- Faster startup time
- Cross-platform consistency

**JavaScript Polyfills**:
- `react-native-get-random-values` - Crypto polyfill for UUID generation
- Imported in `/src/index.ts`

### 5.3 Initialization & Startup Flow

**Entry Point**: `expo-router/entry` (in package.json main field)

**App Initialization Flow** (in `/src/index.ts`):

```typescript
export async function initializeApp(): Promise<void> {
  // 1. Check development mode
  if (__DEV__) {
    console.log('[App] Development mode: handling potential hot-reload scenario');
  }
  
  // 2. Initialize Logger (persisted settings loaded)
  await logger.initialize();
  
  // 3. Subscribe logger to store updates
  logger.subscribeToCountUpdates(...);
  
  // 4. Check app version & handle updates
  const appUpdated = await hasAppBeenUpdated();
  if (appUpdated) {
    await handleAppUpdate();
    await saveCurrentVersion();
  }
  
  // 5. Initialize Track Player (background audio)
  await initializeTrackPlayer();
  
  // 6. Restore persisted player state
  await useAppStore.getState().restorePersistedState();
  await progressService.rehydrateActiveSession();
  await playerService.restorePlayerServiceFromSession();
  await playerService.reconcileTrackPlayerState();
}
```

**Root Layout** (in `/src/app/_layout.tsx`):
1. Calls `initializeApp()` on mount
2. Manages font loading
3. Handles AppState changes (background/foreground)
4. Implements deep linking for logger configuration
5. Sets up providers: DbProvider, AuthProvider, StoreProvider

### 5.4 Deep Linking for Logger Configuration

**Feature**: Remote logger configuration via deep links

**Format**: `side-shelf://logger?level[TAG_NAME]=warn&enabled[TAG_NAME]=false`

**Supported Parameters**:
- `level[TAG_NAME]=debug|info|warn|error`
- `enabled[TAG_NAME]=true|false`

**Implementation**: In `/src/app/_layout.tsx` lines 188-276

---

## 6. Developer Settings & Diagnostics

### 6.1 Diagnostics Mode

**Location**: Settings screen at `/src/app/(tabs)/more/settings.tsx`

**Features**:
- User-facing toggle under "Developer" section
- Persisted to AsyncStorage via `enableDiagnostics` key
- Stored in Zustand settings slice as `diagnosticsEnabled`

**Setting Storage** (in `/src/lib/appSettings.ts`):
```typescript
const SETTINGS_KEYS = {
  enableDiagnostics: "@app/enableDiagnostics",
  // ... other keys
};

export async function getDiagnosticsEnabled(): Promise<boolean>
export async function setDiagnosticsEnabled(enabled: boolean): Promise<void>
```

### 6.2 Diagnostic Logging

**Logger Method**: `logger.forDiagnostics(tag: string): SubLogger`

**Implementation** (in `/src/lib/logger/index.ts` line 413):
```typescript
forDiagnostics(tag: string): SubLogger {
  const diagTag = `DIAG:${tag}`;
  return this.forTag(diagTag);
}
```

**How It Works**:
- Diagnostic logs are prefixed with `DIAG:` tag
- Can be enabled/disabled separately from main logs
- Useful for detailed debugging without log clutter

**Usage Examples**:
- In `/src/app/_layout.tsx`: `diagLog.info("RootLayout mounted")`
- Diagnostic logger created once and cached

### 6.3 Logger Settings Screen

**Location**: `/src/app/(tabs)/more/logger-settings.tsx`

**Capabilities**:
- Enable/disable specific log tags
- Set per-tag log levels (debug, info, warn, error, default)
- Configure global default log level
- Set log retention duration (1h, 6h, 12h, 1d, 3d, 7d)
- View database size
- View enabled/disabled tag counts
- Enable/disable all tags with single button

**Logger Configuration** (in `/src/lib/logger/index.ts`):
- **Default Disabled Tags**: `['api:fetch:detailed']`
- **Retention Duration**: Default 1 hour (clamped minimum)
- **Default Log Level**: 'info'
- **Log Levels**: debug (0), info (1), warn (2), error (3)

### 6.4 Logger Persistence

**Storage Keys**:
- `@logger/disabled_tags` - Array of disabled tag names
- `@logger/retention_duration_ms` - Retention duration in milliseconds
- `@logger/tag_levels` - Per-tag log level overrides
- `@logger/default_log_level` - Global default log level
- `@logger/defaulted_to_disabled` - Tracks which default tags have been processed

**Auto-Purging**:
- Triggers every 100 logs or every 5 minutes (whichever comes first)
- Older logs deleted based on retention setting
- Database vacuumed after purge

---

## 7. App Store Integration

### 7.1 Version Management

**File**: `/src/lib/appVersion.ts`

**Functions**:
- `getFullVersionString()` - Returns version string
- `hasAppBeenUpdated()` - Checks if version changed
- `getPreviousVersion()` - Gets last known version
- `saveCurrentVersion()` - Persists current version

**On App Update**:
- Logged to diagnostics
- Update-specific cleanup can be performed
- Module cache clearing attempted (limited in React Native)

### 7.2 EAS Builds

**Development Builds**:
- Custom Expo dev client
- Distribution: internal (for testing)
- Built with `eas build --profile development`

**Preview Builds**:
- Distribution: internal
- For testing before production

**Production Builds**:
- Auto-increment version enabled
- iOS: Uses App Store ID `6754254923`
- Distribution: App Store (iOS), Google Play (Android)

---

## 8. Project Structure

```
/home/user/SideShelf/
├── .github/
│   └── workflows/           # GitHub Actions CI/CD
│       ├── test-coverage.yml
│       ├── claude.yml
│       └── claude-code-review.yml
├── src/
│   ├── __tests__/          # Jest test files
│   │   ├── fixtures/
│   │   ├── mocks/
│   │   ├── utils/
│   │   ├── setup-before.js
│   │   └── setup.ts
│   ├── app/                # Expo Router file-based routing
│   │   ├── (tabs)/         # Tab-based layout
│   │   │   ├── home/
│   │   │   ├── authors/
│   │   │   ├── library/
│   │   │   ├── series/
│   │   │   └── more/       # Settings screens
│   │   ├── FullScreenPlayer/
│   │   ├── login.tsx
│   │   ├── index.tsx
│   │   └── _layout.tsx     # Root layout
│   ├── components/         # React components
│   │   ├── home/
│   │   ├── library/
│   │   ├── player/
│   │   ├── ui/
│   │   └── icons/
│   ├── db/                 # Database schema & migrations
│   │   ├── schema/
│   │   ├── migrations/
│   │   ├── helpers/
│   │   └── index.ts
│   ├── lib/                # Utility libraries
│   │   ├── api/            # Audiobookshelf API client
│   │   ├── logger/         # Centralized logging
│   │   ├── downloads/      # Download management
│   │   ├── helpers/
│   │   ├── appSettings.ts  # Settings persistence
│   │   ├── appVersion.ts   # Version tracking
│   │   ├── theme.ts        # Theme system
│   │   ├── smartRewind.ts  # Smart rewind logic
│   │   └── trackPlayerConfig.ts
│   ├── providers/          # React context providers
│   │   ├── AuthProvider.tsx
│   │   ├── DbProvider.tsx
│   │   └── StoreProvider.tsx
│   ├── services/           # Business logic services
│   │   ├── PlayerService.ts
│   │   ├── PlayerBackgroundService.ts
│   │   ├── ProgressService.ts
│   │   └── __tests__/
│   ├── stores/             # Zustand state management
│   │   ├── appStore.ts
│   │   ├── slices/
│   │   │   ├── settingsSlice.ts
│   │   │   ├── playerSlice.ts
│   │   │   ├── loggerSlice.ts
│   │   │   └── ...
│   │   └── __tests__/
│   ├── i18n/               # Internationalization
│   │   └── locales/        # Language files
│   ├── hooks/              # Custom React hooks
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   └── index.ts            # App initialization
├── expo-plugins/           # Custom Expo config plugins
├── docs/
│   ├── investigation/
│   ├── reports/
│   └── architecture/
├── app.json                # Expo app configuration
├── metro.config.js         # Metro bundler config
├── babel.config.js         # Babel transpiler config
├── eas.json                # EAS build config
├── tsconfig.json           # TypeScript config
├── jest.config.js          # Jest test config
├── package.json            # Dependencies & scripts
├── package-lock.json
└── README.md
```

---

## 9. Development & Testing Workflow

### 9.1 Local Development

**Starting Development**:
```bash
npm install              # Install dependencies
npm start               # Start Metro bundler & Expo CLI
# Scan QR code with Expo Go or dev client
```

**For iOS Testing**:
```bash
npm run ios            # Builds & runs on iOS simulator
npm run ios:device     # Builds & runs on connected iOS device
```

**For Android Testing**:
```bash
npm run android        # Builds & runs on Android emulator/device
```

### 9.2 Database Development

**Schema Modifications**:
```bash
npm run drizzle:generate  # Generate migration files
npm run drizzle:push      # Apply migrations to database
```

### 9.3 Testing & Linting

**Run Tests**:
```bash
npm test                  # Run all tests once
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

**Linting**:
```bash
npm run lint                  # Run ESLint
npm run lint:complexity       # Complexity analysis
```

### 9.4 Code Quality

**Pre-commit Hooks**: `.husky/` directory
- Runs prettier on *.{js,jsx,ts,tsx}
- Runs jest on related tests
- Runs prettier on *.{json,md}

**Complexity Metrics**:
- ESLint analysis (json output to `eslint-report.json`)
- Coverage reports (html, text, lcov formats)
- GitHub Actions artifact storage (30 days)

---

## 10. Key Features & Integrations

### 10.1 Audio Playback Architecture

**Service**: `PlayerService` (singleton)
- Manages react-native-track-player lifecycle
- Handles playback state, queue, position
- Background service integration
- TrackPlayer state reconciliation

**Background Service**: `PlayerBackgroundService`
- Runs independently when app is backgrounded
- Handles playback events
- Progress updates
- Notifications

### 10.2 Progress Synchronization

**Service**: `ProgressService`
- Fetches reading progress from server
- Syncs position with Audiobookshelf
- Manages active reading session in database
- Rehydrates on app foreground

### 10.3 Download Management

**Features**:
- Background downloads via custom downloader plugin
- Progress tracking
- Storage management
- Offline content support

### 10.4 Authentication

**Provider**: `AuthProvider`
- Token management in SecureStore
- Server connection handling
- Library selection
- Automatic token refresh

### 10.5 Database

**Storage**: SQLite with Drizzle ORM
- Progress tracking
- Download state
- App settings
- Logger output
- User preferences

---

## 11. Key Development Constants & Conventions

### 11.1 AsyncStorage Keys

**Format**: `@app/{featureName}` or `@logger/{feature}`

**Settings Keys**:
- `@app/jumpForwardInterval`
- `@app/jumpBackwardInterval`
- `@app/enableSmartRewind`
- `@app/enablePeriodicNowPlayingUpdates`
- `@app/homeLayout`
- `@app/enableDiagnostics`

**Logger Keys**:
- `@logger/disabled_tags`
- `@logger/retention_duration_ms`
- `@logger/tag_levels`
- `@logger/default_log_level`
- `@logger/defaulted_to_disabled`

### 11.2 Logger Tag Conventions

**Format**: `ComponentName`, `ServiceName`, or `DIAG:ComponentName`

**Default Disabled Tags**:
- `api:fetch:detailed` - Verbose API call logging

**Common Tags**:
- `RootLayout`
- `PlayerService`
- `ProgressService`
- `AuthProvider`
- `LoggerSettingsScreen`
- `App` (default fallback)

### 11.3 Zustand Store Slices

**Structure**:
- Settings slice: user preferences
- Player slice: playback state
- Logger slice: log counts & errors
- Library slice: library selection
- Auth slice: authentication state
- And more...

---

## 12. Build & Deployment Pipeline

### 12.1 Development Builds (Internal Testing)

**Command**: `eas build --profile development`
- Uses custom Expo dev client
- Installable on physical devices/emulators
- Fast iteration cycles
- OTA (over-the-air) updates possible

### 12.2 Preview Builds (Staging)

**Command**: `eas build --profile preview`
- Production-like builds
- Internal distribution only
- Testing before store release

### 12.3 Production Builds

**Command**: `eas build --profile production`
- Optimized bundles
- App Store/Play Store ready
- Auto-version increment
- Full TypeScript compilation
- Minification & optimization

### 12.4 Submission

**iOS**:
- Uses App Store ID: `6754254923`
- Requires Apple Developer account
- Uses `eas submit --platform ios --profile production`

**Android**:
- Configurable via EAS
- Uses Google Play Console

---

## 13. Recommendations for Bundle Loading

### 13.1 Current Setup

- Metro bundler configured via Expo
- Hermes engine for optimized bundles
- No custom bundle splitting
- Single entry point: expo-router/entry

### 13.2 Potential Optimization Opportunities

1. **Code Splitting**: 
   - Implement route-based code splitting with expo-router
   - Lazy load non-critical screens

2. **Asset Optimization**:
   - Image optimization with expo-image
   - SVG/vector icon optimization

3. **Bundle Analysis**:
   - Consider bundle analyzer tools
   - Monitor sizes in CI/CD

4. **Cache Strategy**:
   - Leverage AsyncStorage for persisted state
   - SQLite for complex queries

5. **Module Federation** (Advanced):
   - Consider for multi-module architecture
   - Not currently implemented

---

## 14. Security Considerations

### 14.1 Secure Storage

**Location**: `src/lib/secureStore.ts`
- Uses expo-secure-store for sensitive data
- API tokens stored securely
- Encryption handled by platform

### 14.2 Network Security

**app.json iOS Config**:
```json
"NSAppTransportSecurity": {
  "NSAllowsArbitraryLoads": true
}
```
- Allows arbitrary loads (development friendly)
- Should be restricted in production

### 14.3 Permissions

**iOS** (from app.json):
- `NSLocalNetworkUsageDescription` - Local network access
- `UIBackgroundModes: ["audio"]` - Background audio
- `ITSAppUsesNonExemptEncryption: false`

---

## 15. Debugging & Troubleshooting

### 15.1 Development Tools

**Logger Settings**:
- Access at: Settings → More → Logger Settings
- Enable/disable tags
- Set per-tag log levels
- Configure retention
- View database size

**Diagnostics Mode**:
- Access at: Settings → More → Settings → Developer section
- Toggle to enable detailed logging
- Uses `DIAG:` prefixed logs

### 15.2 Deep Linking Debug

**Format**: `side-shelf://logger?level[PlayerService]=debug&enabled[api]=true`

**Use Case**:
- Remote debugging without app updates
- Configure logging from QR code
- Testing logger settings

---

## 16. Summary of Key Files

| File | Purpose |
|------|---------|
| `/src/index.ts` | App initialization & services setup |
| `/src/app/_layout.tsx` | Root layout, providers, deep linking |
| `/src/lib/logger/index.ts` | Centralized logging system |
| `/src/lib/appSettings.ts` | Settings persistence |
| `/src/stores/slices/settingsSlice.ts` | Settings state management |
| `/src/app/(tabs)/more/settings.tsx` | Settings UI |
| `/src/app/(tabs)/more/logger-settings.tsx` | Logger configuration UI |
| `app.json` | Expo/app configuration |
| `metro.config.js` | Bundler configuration |
| `eas.json` | Build & submission configuration |
| `.github/workflows/test-coverage.yml` | CI test reporting |
| `.github/workflows/claude.yml` | Claude Code integration |

---

**Document End**
