# SideShelf Codebase Overview

## Project Summary

**SideShelf** is a modern, feature-rich React Native mobile application for [Audiobookshelf](https://www.audiobookshelf.org/) - a self-hosted audiobook and podcast server.

- **Type**: React Native (Expo) mobile application
- **Language**: TypeScript
- **Total Lines of Code**: ~9,735 lines
- **License**: MIT

### Key Features
- Complete library management and browsing
- Offline downloads with intelligent storage management
- Advanced audio player with progress tracking and playback controls
- Real-time progress synchronization across devices
- Beautiful UI with dark/light theme support
- Smart search and advanced filtering

---

## Technology Stack

### Core Framework & Runtime
- **Framework**: React Native 0.81.5
- **Runtime**: Expo 54.0.21
- **JavaScript Engine**: Hermes
- **Language**: TypeScript 5.9.2
- **React Version**: 19.1.0

### Navigation & Routing
- **Navigation**: Expo Router 6.0.14 (file-based routing)
- **React Navigation**: 7.1.8
- **Bottom Tabs Navigation**: @react-navigation/bottom-tabs 7.4.0

### State Management
- **State Management**: Zustand 5.0.8
- **Persistence**: AsyncStorage, Secure Store, Custom async store

### Database & Storage
- **Database**: SQLite with Expo SQLite 16.0.8
- **ORM**: Drizzle ORM 0.44.5
- **Database Toolkit**: Drizzle Kit 0.31.4
- **Better SQLite3**: 12.4.1 (for testing)
- **Storage**: expo-file-system, expo-secure-store

### Audio & Playback
- **Audio Player**: react-native-track-player 4.1.2
- **Audio Format Support**: Native track player with chapter support
- **Playback Control**: Full playback speed, sleep timer, skip features

### Download Management
- **Background Downloads**: @kesha-antonov/react-native-background-downloader
- **Download Tracking**: Custom speed tracker and progress management

### UI & Styling
- **Component Library**: React Native (built-in)
- **Styling**: React Native StyleSheet with theme support
- **Icons**: @expo/vector-icons 15.0.2 (Font Awesome, Material Community)
- **HTML Rendering**: react-native-render-html 6.3.4

### Utilities & Libraries
- **UUID Generation**: uuid 13.0.0
- **Date/Time**: Native React Native features
- **Networking**: Fetch API + custom API client
- **HTTP Client**: Custom implementation with async/await
- **Animation**: react-native-reanimated 4.1.1
- **Gesture Handling**: react-native-gesture-handler 2.28.0
- **Safe Area**: react-native-safe-area-context 5.6.0
- **Screens**: react-native-screens 4.16.0
- **Localization**: expo-localization 17.0.7

### Developer Tools & Quality Assurance
- **Testing Framework**: Jest 29.7.0
- **Test Utilities**: 
  - @testing-library/react-native 13.3.3
  - @testing-library/jest-native 5.4.3
  - jest-expo 54.0.13
- **Linting**: ESLint 9.25.0 with Expo config
- **Code Formatting**: Prettier 3.6.2
- **Pre-commit Hooks**: Husky, lint-staged
- **Build Tool**: Metro (Expo's bundler)
- **Babel**: babel-preset-expo with inline-import plugin for SQL

### Logging & Debugging
- **Custom Logger**: In-house logging system with database persistence
- **Console Utilities**: react-native-logs 5.5.0
- **Device Info**: react-native-device-info 14.1.1
- **Network Info**: @react-native-community/netinfo 11.4.1

### Platform-Specific
- **iOS Support**: Tablet support, background audio modes
- **Android Support**: Edge-to-edge support
- **Web Support**: React Native Web 0.21.0
- **Native Modules**: Expo modules and plugins

---

## Project Structure

```
SideShelf/
├── src/                           # Main source code directory
│   ├── app/                       # Expo Router file-based routing
│   │   ├── (tabs)/               # Tab-based navigation screens
│   │   │   ├── home/             # Home tab with library items
│   │   │   ├── library/          # Full library browsing
│   │   │   ├── authors/          # Author browsing
│   │   │   ├── series/           # Series browsing
│   │   │   ├── more/             # Settings and additional screens
│   │   │   └── _layout.tsx       # Tab navigation layout
│   │   ├── FullScreenPlayer/     # Full-screen player interface
│   │   ├── _layout.tsx           # Root layout with providers
│   │   ├── index.tsx             # Entry point
│   │   ├── login.tsx             # Authentication screen
│   │   └── +not-found.tsx        # 404 page
│   │
│   ├── components/               # Reusable UI components
│   │   ├── home/                 # Home screen specific components
│   │   │   ├── CoverItem.tsx     # Cover display component
│   │   │   └── Item.tsx          # Item list component
│   │   ├── library/              # Library browsing components
│   │   │   ├── LibraryItem.tsx   # Single item display
│   │   │   ├── LibraryItemList.tsx
│   │   │   ├── LibraryItemDetail.tsx
│   │   │   ├── LibraryItemDetail/
│   │   │   │   ├── ChapterList.tsx
│   │   │   │   └── DownloadProgressView.tsx
│   │   │   └── LibraryPicker.tsx
│   │   ├── player/               # Player control components
│   │   │   ├── PlayPauseButton.tsx
│   │   │   ├── SkipButton.tsx
│   │   │   ├── JumpTrackButton.tsx
│   │   │   ├── PlaybackSpeedControl.tsx
│   │   │   ├── SleepTimerControl.tsx
│   │   │   └── ChapterList.tsx
│   │   ├── ui/                   # Shared UI components
│   │   │   ├── FloatingPlayer.tsx # Mini player widget
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── Toggle.tsx
│   │   │   ├── SortMenu.tsx
│   │   │   ├── HeaderControls.tsx
│   │   │   ├── CollapsibleSection.tsx
│   │   │   └── CoverImage.tsx
│   │   ├── icons/                # Icon components
│   │   │   ├── DownloadButton.tsx
│   │   │   ├── AuthorIcon.tsx
│   │   │   ├── NarratorIcon.tsx
│   │   │   └── SeriesIcon.tsx
│   │   └── index.ts              # Component exports
│   │
│   ├── db/                       # Database layer
│   │   ├── client.ts             # Database client initialization
│   │   ├── schema/               # Database table schemas (Drizzle)
│   │   │   ├── libraries.ts
│   │   │   ├── libraryItems.ts
│   │   │   ├── authors.ts
│   │   │   ├── series.ts
│   │   │   ├── chapters.ts
│   │   │   ├── audioFiles.ts
│   │   │   ├── mediaMetadata.ts
│   │   │   ├── mediaProgress.ts
│   │   │   ├── mediaJoins.ts
│   │   │   ├── users.ts
│   │   │   ├── libraryFiles.ts
│   │   │   ├── tags.ts
│   │   │   ├── genres.ts
│   │   │   ├── languages.ts
│   │   │   ├── narrators.ts
│   │   │   └── localData.ts      # Local-only data
│   │   ├── migrations/           # Drizzle SQL migrations
│   │   │   ├── 0000_*.sql
│   │   │   ├── 0001_*.sql
│   │   │   └── ... (11 total migrations)
│   │   └── helpers/              # Database query helpers
│   │       ├── libraries.ts      # Library queries
│   │       ├── libraryItems.ts   # Item queries
│   │       ├── authors.ts        # Author queries
│   │       ├── series.ts         # Series queries
│   │       ├── users.ts          # User queries
│   │       ├── mediaProgress.ts  # Progress tracking
│   │       ├── mediaMetadata.ts
│   │       ├── audioFiles.ts
│   │       ├── chapters.ts
│   │       ├── fullLibraryItems.ts
│   │       ├── combinedQueries.ts
│   │       ├── statistics.ts
│   │       ├── tokens.ts
│   │       ├── localListeningSessions.ts
│   │       ├── homeScreen.ts
│   │       ├── filterData.ts
│   │       ├── libraryFiles.ts
│   │       ├── localData.ts
│   │       ├── migrationHelpers.ts
│   │       └── __tests__/        # Database tests
│   │
│   ├── lib/                      # Utility functions and helpers
│   │   ├── api/                  # API client
│   │   │   ├── api.ts            # Main HTTP client
│   │   │   └── endpoints.ts      # API endpoint definitions
│   │   ├── logger/               # Custom logging system
│   │   │   ├── index.ts          # Logger implementation
│   │   │   ├── types.ts          # Logger types
│   │   │   └── db.ts             # Logger persistence
│   │   ├── downloads/            # Download utilities
│   │   │   └── speedTracker.ts   # Download speed tracking
│   │   ├── helpers/              # General utilities
│   │   │   └── formatters.ts     # String/number formatting
│   │   ├── appSettings.ts        # App configuration
│   │   ├── appVersion.ts         # Version management
│   │   ├── asyncStore.ts         # AsyncStorage wrapper
│   │   ├── secureStore.ts        # Secure storage wrapper
│   │   ├── theme.ts              # Theme configuration
│   │   ├── styles.ts             # Style utilities
│   │   ├── trackPlayerConfig.ts  # Track player setup
│   │   ├── smartRewind.ts        # Smart rewind logic
│   │   ├── audioFiles.ts         # Audio file utilities
│   │   ├── authorImages.ts       # Author image handling
│   │   ├── covers.ts             # Cover image handling
│   │   ├── fileSystem.ts         # File system operations
│   │   └── navigation.ts         # Navigation utilities
│   │
│   ├── services/                 # Business logic services
│   │   ├── PlayerService.ts      # Audio player management
│   │   ├── PlayerBackgroundService.ts  # Background playback
│   │   ├── ProgressService.ts    # Progress tracking & sync
│   │   ├── DownloadService.ts    # Download management
│   │   ├── libraryItemBatchService.ts
│   │   └── __tests__/            # Service tests
│   │
│   ├── stores/                   # Zustand state management
│   │   ├── appStore.ts           # Root store configuration
│   │   ├── index.ts              # Store exports
│   │   ├── utils.ts              # Store utilities
│   │   ├── slices/               # Store slices (feature states)
│   │   │   ├── playerSlice.ts
│   │   │   ├── librarySlice.ts
│   │   │   ├── homeSlice.ts
│   │   │   ├── authorsSlice.ts
│   │   │   ├── seriesSlice.ts
│   │   │   ├── downloadSlice.ts
│   │   │   ├── settingsSlice.ts
│   │   │   ├── userProfileSlice.ts
│   │   │   ├── libraryItemDetailsSlice.ts
│   │   │   ├── statisticsSlice.ts
│   │   │   ├── loggerSlice.ts
│   │   │   └── __tests__/        # Slice tests
│   │   └── __tests__/            # Store tests
│   │
│   ├── providers/                # React Context Providers
│   │   ├── StoreProvider.tsx     # Zustand store provider
│   │   ├── AuthProvider.tsx      # Authentication context
│   │   └── DbProvider.tsx        # Database initialization
│   │
│   ├── types/                    # TypeScript type definitions
│   │   ├── index.ts              # Main type exports
│   │   ├── api.ts                # API response types
│   │   ├── database.ts           # Database entity types
│   │   ├── store.ts              # Store state types
│   │   ├── player.ts             # Player-related types
│   │   ├── services.ts           # Service types
│   │   ├── components.ts         # Component prop types
│   │   └── utils.ts              # Utility types
│   │
│   ├── i18n/                     # Internationalization
│   │   ├── index.ts              # i18n configuration
│   │   └── locales/              # Translation files
│   │       ├── en.ts             # English translations
│   │       └── es.ts             # Spanish translations
│   │
│   ├── hooks/                    # Custom React hooks
│   │   └── useFloatingPlayerPadding.ts
│   │
│   ├── __tests__/                # Test files
│   │   ├── setup.ts              # Test setup and configuration
│   │   ├── setup-before.js       # Pre-setup configuration
│   │   ├── backgroundRestoration.integration.test.ts
│   │   ├── fixtures/             # Test data
│   │   ├── mocks/                # Mock implementations
│   │   │   ├── asyncStorage.ts
│   │   │   ├── trackPlayer.ts
│   │   │   ├── services.ts
│   │   │   ├── stores.ts
│   │   │   └── index.ts
│   │   └── utils/                # Test utilities
│   │       └── testDb.ts
│   │
│   └── index.ts                  # App initialization entry point
│
├── assets/                       # Static assets
│   └── images/                   # App icons and splash screen
│       ├── icon.png
│       ├── splash-icon.jpeg
│       ├── favicon.png
│       └── android-*
│
├── docs/                         # Documentation
│   ├── architecture/             # Architecture documentation
│   ├── investigation/            # Investigation reports
│   ├── reports/                  # Generated reports
│   ├── LOCALIZATION.md
│   ├── localization-implementation-complete.md
│   └── localization-summary.md
│
├── expo-plugins/                 # Custom Expo plugins
│
├── api-response-samples/         # Sample API responses for testing
│
├── scripts/                      # Build and utility scripts
│   └── abs-debug.mjs            # API debugging utility
│
├── Configuration Files:
│   ├── package.json              # Dependencies and scripts
│   ├── tsconfig.json             # TypeScript configuration
│   ├── app.json                  # Expo configuration
│   ├── jest.config.js            # Jest testing configuration
│   ├── babel.config.js           # Babel transpilation config
│   ├── metro.config.js           # Metro bundler config
│   ├── drizzle.config.ts         # Drizzle ORM configuration
│   ├── eslint.config.js          # ESLint rules
│   ├── .prettierrc.json          # Code formatting rules
│   ├── eas.json                  # Expo Application Services
│   └── .gitignore                # Git ignore rules
│
├── .github/                      # GitHub workflows and config
├── .husky/                       # Git hooks
├── .vscode/                      # VS Code settings
├── .cursor/                      # Cursor IDE settings
│
├── README.md                     # Project overview and setup
├── CLAUDE.md                     # Claude Code instructions
├── RELEASE.md                    # Release process
├── TODO.md                       # Development roadmap
├── CONSOLE_LOGGING_AUDIT.md      # Logging audit report
├── LOCALIZATION_AUDIT.md         # i18n audit report
└── LICENSE                       # MIT License
```

---

## Core Architectural Patterns

### 1. **Layered Architecture**
- **UI Layer** (`app/`, `components/`): Expo Router screens and React components
- **State Layer** (`stores/`): Zustand stores with slices for feature state
- **Service Layer** (`services/`): Business logic (player, progress, downloads)
- **Data Layer** (`db/`, `lib/api/`): Database and API access

### 2. **State Management with Zustand**
- **Root Store**: `appStore` orchestrates all slices
- **Feature Slices**: Individual slices manage domain-specific state
  - `playerSlice`: Playback state and controls
  - `librarySlice`: Library and items state
  - `settingsSlice`: User preferences
  - `downloadSlice`: Download management
  - `loggerSlice`: Debug logging state
- **Persistence**: Automatic state persistence to AsyncStorage

### 3. **Database Layer**
- **Drizzle ORM**: Type-safe SQL queries
- **Migrations**: 11 versioned schema migrations
- **Helpers**: Query helpers organize common database operations
- **Schema**: 17 interconnected tables modeling Audiobookshelf data

### 4. **Service Architecture**
- **PlayerService**: Wraps react-native-track-player, manages playback state
- **ProgressService**: Tracks listening progress, syncs with server
- **DownloadService**: Manages offline content downloads
- **Background Services**: `PlayerBackgroundService` for non-visual audio playback

### 5. **File-Based Routing (Expo Router)**
- Routes determined by file structure in `src/app/`
- Tab navigation through `(tabs)/` group
- Dynamic routes using `[paramName]/` syntax
- Deep linking support

### 6. **Type Safety**
- **Full TypeScript**: All source files are `.ts` or `.tsx`
- **Strict Mode**: tsconfig.json enables strict type checking
- **Path Aliases**: `@/*` maps to `src/*` for clean imports

---

## Key Components & Their Purposes

### Navigation Layer
- **Root Layout** (`app/_layout.tsx`): Initializes providers and app setup
- **Tab Navigation** (`app/(tabs)/_layout.tsx`): Bottom tab bar with 5 main sections
- **Full Screen Player** (`FullScreenPlayer/`): Expanded player interface
- **Login Screen** (`app/login.tsx`): Authentication interface

### Feature Screens
1. **Home Tab** - Personalized library view
2. **Library Tab** - Browse all items with filtering
3. **Authors Tab** - Browse by author
4. **Series Tab** - Browse by series
5. **More Tab** - Settings, statistics, developer tools

### Core Services

#### PlayerService
- Manages react-native-track-player lifecycle
- Handles play, pause, skip, seek operations
- Manages queue and chapter navigation
- Syncs player state with storage
- Implements smart rewind functionality

#### ProgressService
- Tracks user listening progress
- Creates local listening sessions
- Synchronizes progress with Audiobookshelf server
- Handles session lifecycle (open/sync/close)

#### DownloadService
- Manages offline content downloads
- Tracks download progress
- Handles background downloads
- Manages storage and cleanup

### Data Models

**Database Schema (17 Tables)**:
- Libraries, LibraryItems, Authors, Series
- MediaMetadata, MediaProgress, MediaJoins
- Chapters, AudioFiles
- Users, Tokens
- Tags, Genres, Languages, Narrators
- LibraryFiles, LocalData

---

## Development Workflow

### Key Scripts
```bash
npm start              # Start Expo dev server
npm run ios           # Run on iOS simulator
npm run android       # Run on Android emulator
npm test              # Run Jest tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run lint          # ESLint check
npm run drizzle:generate  # Generate DB migrations
npm run drizzle:push      # Apply DB migrations
npm run abs:debug     # API debugging utility
```

### Testing Strategy
- **Unit Tests**: Service and store logic
- **Component Tests**: React component testing with React Native Testing Library
- **Integration Tests**: Full feature workflows
- **Mock Setup**: Comprehensive mocks for AsyncStorage, TrackPlayer, Services

### Code Quality
- **ESLint**: Enforces code style
- **Prettier**: Code formatting
- **Pre-commit Hooks**: Lint and test on commit via Husky
- **TypeScript**: Strict type checking

---

## API & External Integration

### Audiobookshelf API Integration
- Custom API client with authentication
- Session-based communication for streaming
- Real-time progress synchronization
- Media library queries and filtering

### Storage & Caching
- **Local SQLite Database**: Persistent data storage
- **AsyncStorage**: Simple key-value cache
- **Secure Storage**: Credentials and sensitive data
- **File System**: Audio file and cover image caching

### Internationalization (i18n)
- **Supported Languages**: English (en), Spanish (es)
- **Implementation**: Custom i18n with locale-specific files
- **Translation Keys**: Centralized in locale files

---

## Notable Features & Implementation Details

### 1. **Smart Rewind**
- Implements intelligent rewind logic (`lib/smartRewind.ts`)
- Handles cold-start scenarios with recent fixes

### 2. **Offline-First Architecture**
- Full offline playback capability
- Local progress tracking before server sync
- Intelligent background downloading

### 3. **Background Audio Playback**
- `PlayerBackgroundService` runs audio playback in background
- Continues playback when app is minimized

### 4. **Advanced Player Controls**
- Playback speed adjustment
- Sleep timer
- Chapter navigation
- Skip forward/backward with configurable duration

### 5. **Comprehensive Logging**
- Custom logger system with database persistence
- Developer screens for debugging
- Log level filtering and searching
- Separate logger slice in Zustand store

### 6. **Theme Support**
- Dark/light theme with system preference detection
- Consistent styling throughout app
- Theme configuration in `lib/theme.ts`

---

## Performance Optimizations

- **Hermes Engine**: JavaScript engine for better performance
- **React Compiler**: Experimental React compiler enabled
- **Reanimated**: Native animation library
- **TypedRoutes**: Type-safe navigation
- **Code Splitting**: Modular component structure
- **Asset Optimization**: Cover image caching

---

## Build & Deployment

### Platforms Supported
- iOS (with tablet support)
- Android
- Web (static output)

### Build Configuration
- **Expo Build Service**: EAS integration
- **Native Builds**: Metro bundler with expo-router
- **Environment**: Hermes engine, new React architecture enabled

### Release Process
See `RELEASE.md` for detailed release procedures.

---

## Documentation Structure

- **CODEBASE_OVERVIEW.md** (this file): Project structure and architecture
- **LOCALIZATION.md**: i18n implementation details
- **architecture/**: Detailed architecture decisions
- **investigation/**: Technical investigations and findings
- **reports/**: Generated analysis reports
- **README.md**: Project overview and getting started
- **TODO.md**: Development roadmap and future features

---

## Development Best Practices

1. **Use TypeScript**: All new code must be TypeScript
2. **Follow File Structure**: Place files in appropriate directories
3. **Test Coverage**: Write tests for new features
4. **Type Safety**: Leverage TypeScript's strict mode
5. **State Management**: Use Zustand slices for domain state
6. **Localization**: Add new strings to locale files
7. **Code Style**: Follow ESLint and Prettier configs
8. **Documentation**: Update docs for significant changes
9. **Logging**: Use custom logger for debugging
10. **Database**: Use Drizzle helpers for queries

---

## Current Branch & Recent Activity

- **Current Branch**: `claude/codebase-refactoring-review-01MUKZBqQa77JfjfYUg7U7Gi`
- **Recent Commits**:
  - Fix cold start smart rewind bug
  - Add diagnostics mode and developer screens
  - Fix home tab
  - Refactor home screen component
  - Fix settings screen

---

## Key Statistics

- **Total Lines of Code**: ~9,735 TypeScript/TSX lines
- **Source Files**: 180+ files
- **Database Tables**: 17
- **Database Migrations**: 11
- **Component Files**: 30+
- **Service Files**: 6
- **Store Slices**: 11
- **Test Files**: 10+
- **Type Definition Files**: 8

---

*Last Updated: November 2024*
*Generated for comprehensive codebase exploration and understanding*

