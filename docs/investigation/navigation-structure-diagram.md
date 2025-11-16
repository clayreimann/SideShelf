# Navigation Structure Diagram

## App Navigation Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                      Root Layout (_layout.tsx)                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ View (flex: 1)                                              │ │
│  │ ┌──────────────────────────────────────────────────────┐   │ │
│  │ │ DbProvider (Database initialization)                │   │ │
│  │ │ ┌────────────────────────────────────────────────┐   │   │ │
│  │ │ │ AuthProvider (Auth state management)           │   │   │ │
│  │ │ │ ┌──────────────────────────────────────────┐   │   │   │ │
│  │ │ │ │ StoreProvider (Zustand stores)            │   │   │   │ │
│  │ │ │ │ ┌────────────────────────────────────┐   │   │   │   │ │
│  │ │ │ │ │ Stack (Root Navigation)             │   │   │   │   │ │
│  │ │ │ │ │ ├─ index (redirect to tabs/home)    │   │   │   │   │ │
│  │ │ │ │ │ ├─ (tabs) ──────────────────────┐   │   │   │   │   │ │
│  │ │ │ │ │ │  Tab Navigation               │   │   │   │   │   │ │
│  │ │ │ │ │ │                               │   │   │   │   │   │ │
│  │ │ │ │ │ │ Standard Mode:                │   │   │   │   │   │ │
│  │ │ │ │ │ │ Tabs (from @react-navigation) │   │   │   │   │   │ │
│  │ │ │ │ │ │   + FloatingPlayer overlay    │   │   │   │   │   │ │
│  │ │ │ │ │ │                               │   │   │   │   │   │ │
│  │ │ │ │ │ │ Native Mode:                  │   │   │   │   │   │ │
│  │ │ │ │ │ │ NativeTabs (Expo Router)      │   │   │   │   │   │ │
│  │ │ │ │ │ │   + FloatingPlayer overlay    │   │   │   │   │   │ │
│  │ │ │ │ │ └────────────────────────────┘   │   │   │   │   │   │ │
│  │ │ │ │ │ ├─ login (Form sheet modal)      │   │   │   │   │   │ │
│  │ │ │ │ │ ├─ FullScreenPlayer (Modal)     │   │   │   │   │   │ │
│  │ │ │ │ │ └─ +not-found (404)             │   │   │   │   │   │ │
│  │ │ │ │ └────────────────────────────────┘   │   │   │   │   │ │
│  │ │ │ └──────────────────────────────────────┘   │   │   │   │ │
│  │ │ └────────────────────────────────────────────┘   │   │   │ │
│  │ └──────────────────────────────────────────────────┘   │   │ │
│  └──────────────────────────────────────────────────────────┘   │ │
└─────────────────────────────────────────────────────────────────┘
```

## Tab Navigation Detail

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    (tabs)/_layout.tsx - TAB_CONFIG[5]                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐   │
│  │ HOME TAB         │  │ LIBRARY TAB      │  │ SERIES TAB           │   │
│  ├──────────────────┤  ├──────────────────┤  ├──────────────────────┤   │
│  │ home/            │  │ library/         │  │ series/              │   │
│  │ ├─ _layout.tsx   │  │ ├─ _layout.tsx   │  │ ├─ _layout.tsx       │   │
│  │ │  (Stack)       │  │ │  (Stack)       │  │ │  (Stack)           │   │
│  │ │                │  │ │                │  │ │                    │   │
│  │ ├─ index.tsx     │  │ ├─ index.tsx     │  │ ├─ index.tsx         │   │
│  │ │ (Main screen)  │  │ │ (Main screen)  │  │ │ (Series list)      │   │
│  │ │                │  │ │                │  │ │                    │   │
│  │ └─ item/         │  │ └─ [item]/       │  │ └─ [seriesId]/       │   │
│  │    └─[itemId].   │  │    └─ index.tsx  │  │    ├─ index.tsx      │   │
│  │       tsx        │  │      (Detail)    │  │    │ (Series detail) │   │
│  │    (Detail)      │  │                  │  │    │                 │   │
│  │                  │  │                  │  │    └─ item/         │   │
│  │                  │  │                  │  │       └─[itemId].   │   │
│  │                  │  │                  │  │          tsx         │   │
│  │                  │  │                  │  │                      │   │
│  │ Uses:            │  │ Uses:            │  │ Uses:               │   │
│  │ - Home store     │  │ - Library store  │  │ - Series store      │   │
│  │ - SectionList    │  │ - LibraryItem    │  │ - FlatList          │   │
│  │ - CoverItem/Item │  │ - GridList/List  │  │ - Dynamic images    │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘   │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────────────────────────────────┐  │
│  │ AUTHORS TAB      │  │ MORE TAB                                      │  │
│  ├──────────────────┤  ├──────────────────────────────────────────────┤  │
│  │ authors/         │  │ more/                                         │  │
│  │ ├─ _layout.tsx   │  │ ├─ _layout.tsx (Stack)                       │  │
│  │ │  (Stack)       │  │ │                                             │  │
│  │ │                │  │ ├─ index.tsx (Main menu)                     │  │
│  │ ├─ index.tsx     │  │ │                                             │  │
│  │ │ (Authors list) │  │ ├─ me.tsx (Profile)                          │  │
│  │ │                │  │ ├─ settings.tsx                              │  │
│  │ └─ [authorId]/   │  │ ├─ collections.tsx                           │  │
│  │    ├─ index.tsx  │  │ ├─ library-stats.tsx                         │  │
│  │    │ (Author     │  │ ├─ logger-settings.tsx                       │  │
│  │    │  detail)    │  │ ├─ logs.tsx                                  │  │
│  │    │             │  │ ├─ track-player.tsx                          │  │
│  │    └─ item/      │  │ ├─ storage.tsx                               │  │
│  │       └─[itemId] │  │ └─ actions.tsx                               │  │
│  │          .tsx    │  │                                               │  │
│  │                  │  │ Uses:                                         │  │
│  │ Uses:            │  │ - Logger system                               │  │
│  │ - Authors store  │  │ - Player service                              │  │
│  │ - FlatList       │  │ - Database                                    │  │
│  │ - Author images  │  │ - Settings store                              │  │
│  └──────────────────┘  └──────────────────────────────────────────────┘  │
│                                                                             │
│ [Tab Bar at Bottom - Platform specific rendering]                        │
│ Icons: iOS SF Symbols | Android Ionicons                                 │
│ Badge: Error count on "more" tab (when diagnosticsEnabled)                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Screen Navigation Flow Example (Home Tab)

```
User opens app
    |
    v
RootIndex (index.tsx)
    |
    ├─> Login check
    |   ├─> Not authenticated? → /login
    |   └─> Authenticated? → Continue
    |
    v
(tabs)/_layout.tsx (Tab Navigator)
    |
    v
home/_layout.tsx (Stack Navigator)
    |
    v
home/index.tsx (HomeScreen)
    |
    ├─> [useFocusEffect] Refresh home data when screen focused
    |
    ├─> Render Sections:
    |   ├─ Continue Listening (SectionList)
    |   │  ├─ CoverItem components
    |   │  └─ Item components
    |   │
    |   ├─ Downloaded
    |   │  └─ CoverItem components
    |   │
    |   └─ Listen Again
    |      └─ CoverItem components
    |
    └─> User taps item
            |
            v
        home/item/[itemId].tsx (Detail Screen)
```

## Error Boundary Placement Opportunities

```
┌─────────────────────────────────────────────────────────────┐
│ Root Layout (_layout.tsx)                                    │
│ ┌──────── TOP-LEVEL ERROR BOUNDARY ──────────────────────┐  │
│ │ DbProvider > AuthProvider > StoreProvider               │  │
│ │                                                          │  │
│ │ ┌──────── TAB ERROR BOUNDARY ──────────────────────┐   │  │
│ │ │ (tabs)/_layout.tsx - Isolate tab failures        │   │  │
│ │ │                                                   │   │  │
│ │ │ ┌─ home/ ──────────────────────────────────────┐ │   │  │
│ │ │ │ ┌─ LAYOUT EB (Stack level)                 │ │ │   │  │
│ │ │ │ │ ┌─ INDEX EB (Screen level)               │ │ │ │   │  │
│ │ │ │ │ │ ┌─ Section EB (FlatList/Section level)│ │ │ │ │   │  │
│ │ │ │ │ │ │ Components rendering items           │ │ │ │ │   │  │
│ │ │ │ │ │ └───────────────────────────────────────┘ │ │ │   │  │
│ │ │ │ │ └───────────────────────────────────────────┘ │ │   │  │
│ │ │ │ └───────────────────────────────────────────────┘ │   │  │
│ │ │ │                                                   │   │  │
│ │ │ │ ┌─ item/[itemId].tsx ──────────────────────────┐ │   │  │
│ │ │ │ │ ┌─ DETAIL EB                                │ │   │  │
│ │ │ │ │ │ Detail component rendering                │ │   │  │
│ │ │ │ │ └───────────────────────────────────────────┘ │   │  │
│ │ │ │ └───────────────────────────────────────────────┘ │   │  │
│ │ │ └───────────────────────────────────────────────────┘ │   │  │
│ │ │                                                       │   │  │
│ │ ├─ library/ (Similar structure)                        │   │  │
│ │ ├─ series/ (Similar structure)                         │   │  │
│ │ ├─ authors/ (Similar structure)                        │   │  │
│ │ └─ more/ (Similar structure)                           │   │  │
│ │                                                         │   │  │
│ │ ┌─ FloatingPlayer EB ──────────────────────────────┐   │   │  │
│ │ │ Isolated from rest of app                        │   │   │  │
│ │ └───────────────────────────────────────────────────┘   │   │  │
│ │                                                          │   │  │
│ └──────────────────────────────────────────────────────────┘   │  │
│                                                                  │  │
└──────────────────────────────────────────────────────────────────┘
```

## State Management Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                     Zustand Stores                           │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  appStore (main store with slices):                         │
│                                                               │
│  ├─ playerSlice                                              │
│  │  ├─ currentTrack                                          │
│  │  ├─ currentChapter                                        │
│  │  ├─ playbackState                                         │
│  │  └─ Used by: FloatingPlayer, FullScreenPlayer            │
│  │                                                            │
│  ├─ homeSlice                                                │
│  │  ├─ continueListening                                     │
│  │  ├─ downloaded                                            │
│  │  ├─ listenAgain                                           │
│  │  ├─ isLoadingHome                                         │
│  │  └─ Used by: home/index.tsx                               │
│  │                                                            │
│  ├─ librarySlice                                             │
│  │  ├─ items                                                 │
│  │  ├─ selectedLibrary                                       │
│  │  ├─ isLoadingItems                                        │
│  │  └─ Used by: library/index.tsx                            │
│  │                                                            │
│  ├─ seriesSlice                                              │
│  │  ├─ items                                                 │
│  │  └─ Used by: series/index.tsx                             │
│  │                                                            │
│  ├─ authorsSlice                                             │
│  │  ├─ items                                                 │
│  │  └─ Used by: authors/index.tsx                            │
│  │                                                            │
│  ├─ downloadSlice                                            │
│  │  ├─ downloads tracking                                    │
│  │  └─ Used by: Various screens                              │
│  │                                                            │
│  ├─ settingsSlice                                            │
│  │  ├─ Theme settings                                        │
│  │  ├─ homeLayout preference                                 │
│  │  └─ Used by: All tabs                                     │
│  │                                                            │
│  └─ loggerSlice                                              │
│     ├─ errorCount                                            │
│     ├─ diagnosticsEnabled                                    │
│     └─ Used by: Tab badge display                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Error Propagation Path (Current vs With Error Boundaries)

### Current (Without Error Boundaries)
```
Component throws error
         |
         v
No catch at component level
         |
         v
Error propagates up → NavigationContainer catches it
         |
         v
App white screen / crash
         |
         v
User sees broken app
         |
         v
Only recovery: Force quit & restart
```

### With Error Boundaries (Proposed)
```
Component throws error
         |
         v
Component-level EB catches it
    (if exists)
    |         \
    |          v
   (YES)   Log error & fallback UI
    |          |
    |          v
    |    Try again button?
    |
    v (if no component EB)
Tab Screen EB catches it
    (if exists)
    |
    v
Tab-level fallback UI
    |
    v
User can:
- Retry
- Navigate to another tab
- See error details

If no tab EB, error goes to:
    |
    v
Top-level EB catches it
    |
    v
App-level fallback UI
    |
    v
Full recovery options
```

## Service Integration Points

```
┌──────────────────────────────────────────────────────────────────┐
│                    Services Layer                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─ PlayerService (Singleton)                                    │
│  │  ├─ TrackPlayer setup & config                                │
│  │  ├─ Play/pause/skip operations                                │
│  │  └─ Used by: FloatingPlayer, FullScreenPlayer, Controls       │
│  │     Errors: Track loading, playback state sync                │
│  │                                                                │
│  ├─ ProgressService                                              │
│  │  ├─ Fetch server progress                                     │
│  │  ├─ Update progress in DB                                     │
│  │  └─ Used by: home/index.tsx, detail screens                   │
│  │     Errors: API failures, DB errors                           │
│  │                                                                │
│  ├─ DownloadService                                              │
│  │  ├─ Manage downloads                                          │
│  │  ├─ Track progress                                            │
│  │  └─ Used by: Download tracking, more/storage.tsx              │
│  │     Errors: Network failures, file system errors              │
│  │                                                                │
│  └─ PlayerBackgroundService                                      │
│     ├─ Background playback handling                              │
│     └─ Errors: Background task failures                          │
│                                                                    │
│  ┌─ API Layer (lib/api/)                                         │
│  │  ├─ REST calls to Audiobookshelf server                       │
│  │  ├─ Auth tokens                                               │
│  │  └─ Errors: 401, 404, 500, network timeouts                   │
│  │                                                                │
│  ├─ Database Layer (Drizzle ORM)                                 │
│  │  ├─ SQLite queries                                            │
│  │  ├─ Schema defined in src/db/schema/                          │
│  │  └─ Errors: Query failures, constraint violations             │
│  │                                                                │
│  └─ Logger System (lib/logger/)                                  │
│     ├─ Tag-based logging                                         │
│     ├─ Error logging & storage                                   │
│     ├─ Diagnostic mode via deep links                            │
│     └─ Error display in more/logger-settings.tsx                 │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```
