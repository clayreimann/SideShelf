# Technology Stack

**Analysis Date:** 2026-02-15

## Languages

**Primary:**

- TypeScript 5.9.2 - All source code (src/), full strict mode enabled
- JavaScript - Build configuration and test utilities

**Secondary:**

- HTML5 - Web platform output
- JSON - Configuration and manifest files

## Runtime

**Environment:**

- React Native 0.81.5 - Mobile application framework
- Expo 54.0.21 - Managed development and build platform
- Hermes - JavaScript engine (specified in app.json)
- React 19.1.0 - UI component library

**Package Manager:**

- npm - Primary package manager
- Lockfile: package-lock.json (present via npm)
- Configuration: `.npmrc` with `legacy-peer-deps=true` for dependency compatibility

## Frameworks

**Core:**

- Expo Router 6.0.14 - File-based routing (src/app/)
- React Navigation 7.1.8 - Navigation infrastructure
- React Native 0.81.5 - Mobile framework
- New Architecture enabled (Hermes + JSI)

**State Management:**

- Zustand 5.0.8 - Global state with slice pattern (src/stores/slices/)
- @react-native-async-storage/async-storage 2.2.0 - Persistent storage for non-sensitive data
- expo-secure-store 15.0.7 - Secure credential storage

**Database:**

- Drizzle ORM 0.44.5 - SQL query builder and ORM
- expo-sqlite 16.0.8 - SQLite database runtime (production)
- better-sqlite3 12.4.1 - SQLite for development/testing
- expo-sqlite-mock 3.0.0 - Mock database for tests
- drizzle-kit 0.31.4 - Migration and schema management

**Audio & Media:**

- react-native-track-player 4.1.2 - Audio playback and background control
- react-native-render-html 6.3.4 - HTML content rendering
- expo-image 3.0.10 - Image display optimization

**Downloads & Background:**

- @kesha-antonov/react-native-background-downloader (custom fork) - Background file downloads
- Managed via github:clayreimann/react-native-background-downloader#spike-event-queue

**Navigation & UI:**

- @react-navigation/bottom-tabs 7.4.0 - Tab-based navigation
- @react-navigation/native 7.1.8 - Navigation core
- react-native-gesture-handler 2.28.0 - Gesture handling
- react-native-reanimated 4.1.1 - Animation library
- react-native-safe-area-context 5.6.0 - Safe area management
- react-native-screens 4.16.0 - Native screen optimization
- @expo/vector-icons 15.0.2 - Icon library (FontAwesome, MaterialCommunityIcons, Octicons)

**Utilities:**

- react-native-device-info 14.1.1 - Device metadata and system info
- @react-native-community/netinfo 11.4.1 - Network connectivity status
- uuid 13.0.0 & @types/uuid 10.0.0 - UUID generation
- react-native-logs 5.5.0 - Logging infrastructure
- async-lock 1.4.1 - Mutex for async operations
- eventemitter3 5.0.1 - Event bus pattern
- react-native-get-random-values 1.11.0 - Cryptographic randomness
- expo-localization 17.0.7 - Internationalization support

**File System & Permissions:**

- expo-file-system 19.0.17 - File system access and management
- expo-clipboard 8.0.7 - Clipboard operations
- expo-sharing 14.0.7 - Share dialog
- expo-web-browser 15.0.8 - Web browser integration
- expo-linking 8.0.8 - Deep linking support
- expo-system-ui 6.0.8 - System UI integration
- expo-splash-screen 31.0.10 - App splash screen
- expo-status-bar 3.0.8 - Status bar control
- expo-haptics 15.0.7 - Haptic feedback
- expo-symbols 1.0.7 - System symbols support

**Platform Updates:**

- expo-updates 29.0.12 - Over-the-air updates
- expo-dev-client 6.0.16 - Development client with custom plugins
- expo-drizzle-studio-plugin 0.2.0 - Database debugging in dev client

## Testing

**Framework:**

- Jest 29.7.0 - Test runner and assertion library
- jest-expo 54.0.13 - Expo-specific test utilities
- @testing-library/react-native 13.3.3 - Component testing utilities
- @testing-library/jest-native 5.4.3 - Jest matchers for React Native
- jest-html-reporter 4.3.0 - HTML test report generation

**Development Mocking:**

- expo-sqlite-mock 3.0.0 - SQLite mock for unit tests

## Build & Dev Tools

**Linting & Formatting:**

- ESLint 9.25.0 - Code linting
- eslint-config-expo 10.0.0 - Expo ESLint preset
- eslint-plugin-prettier 5.5.4 - Prettier integration
- Prettier 3.6.2 - Code formatting
- lint-staged 16.2.6 - Pre-commit hooks with Husky

**Build & Prebuild:**

- Expo CLI (included with expo 54.0.21)
- @expo/config-plugins 54.0.1 - Native config management
- Prebuild system for native code generation

**Type Checking:**

- TypeScript 5.9.2 - Language and type checking

**Babel & Transpilation:**

- babel-plugin-inline-import 3.0.0 - Inline import handling
- Hermes bytecode compilation (via Expo)

## Configuration

**Environment:**

- App configuration: `app.json` (Expo app.json format)
  - App name: SideShelf
  - iOS bundle ID: cloud.madtown.sideshelf
  - Android package: cloud.madtown.sideshelf
  - New Architecture enabled
  - Hermes engine active
- Build configuration: `eas.json` (EAS Build CI/CD)
  - Development, preview, and production build profiles
  - Automatic version management from remote
  - iOS submission to App Store via ASC (App Store Connect)

**TypeScript:**

- `tsconfig.json` configured with:
  - Strict mode enabled
  - Path alias: `@/*` → `./src/*`
  - Extends: `expo/tsconfig.base`

**Database Migrations:**

- Drizzle config: `drizzle.config.ts`
  - Dialect: SQLite
  - Driver: Expo (uses expo-sqlite)
  - Schema path: `./src/db/schema`
  - Migrations path: `./src/db/migrations`

## Platform Requirements

**Development:**

- Node.js (managed via mise)
- npm 6+
- iOS: Xcode with appropriate deployment targets
- Android: Android Studio with SDK configuration
- React Native: Pre-built or prebuild (Expo manages this)

**Production:**

- iOS 14.0+ (inferred from app.json configuration)
- Android API 24+ (from android configuration)
- Network access to Audiobookshelf server (required)
- Local storage for offline downloads and SQLite database

**Data Storage:**

- Local SQLite database: `abs2.sqlite` (in app documents directory)
- Async storage: App preferences and playback state
- Secure storage: API credentials (tokens, server URL, username)
- File system: Downloaded audio files in app-specific documents directory

---

_Stack analysis: 2026-02-15_
