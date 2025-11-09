# SideShelf Architecture Summary

## Quick Reference

**App Name:** SideShelf (Audiobookshelf React Native Client)
**Framework:** Expo/React Native
**State Management:** Zustand (slice pattern)
**Database:** SQLite (Drizzle ORM)
**Platform Support:** iOS (primary), Android
**Last Updated:** November 9, 2025

---

## Architecture at a Glance

### Core Layers

```
┌─────────────────────────────────────────────────────────┐
│                   UI Layer (Tabs)                       │
│   Home | Library | Series | Authors | More              │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              State Management (Zustand)                 │
│  Multiple slices: Library, Authors, Series, Player, etc │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│              Services Layer                             │
│  PlayerService | ProgressService | DownloadService     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│          Data Access Layer                              │
│  Database (SQLite) | API (REST) | Storage (Secure)     │
└─────────────────────────────────────────────────────────┘
```

---

## Key Components Map

### Navigation Structure

```
RootLayout (_layout.tsx)
├── index.tsx (Splash/Redirect)
├── login.tsx (Authentication)
├── (tabs) (_layout.tsx - Bottom Tab Navigation)
│   ├── home/
│   ├── library/
│   ├── series/
│   ├── authors/
│   └── more/
│       ├── settings.tsx
│       ├── advanced.tsx
│       ├── collections.tsx
│       ├── me.tsx (Profile)
│       └── logs.tsx
└── FullScreenPlayer/ (Modal overlay)
```

### Provider Stack

```
RootLayout
└── DbProvider (SQLite)
    └── AuthProvider (Credentials)
        └── StoreProvider (Zustand)
            └── Tab Navigation
```

### State Management Slices

1. **LibrarySlice** - Selected library, items, sorting
2. **AuthorsSlice** - Authors list, items by author
3. **SeriesSlice** - Series list, items by series
4. **PlayerSlice** - Now playing, playback state
5. **HomeSlice** - Continue listening, downloaded, etc.
6. **DownloadSlice** - Download progress, completed
7. **SettingsSlice** - User preferences
8. **UserProfileSlice** - User and device info
9. **StatisticsSlice** - Usage analytics
10. **LoggerSlice** - Logger state
11. **LibraryItemDetailsSlice** - Item detail cache

---

## Data Flow

### Authentication & Initialization

```
1. RootLayout mounts
2. Load fonts, setup providers
3. initializeApp()
   ├── Logger initialization
   ├── TrackPlayer setup
   ├── Player state restoration
   └── Progress service init
4. DbProvider initializes SQLite
5. AuthProvider loads stored credentials
6. API configured with auth tokens
7. StoreProvider initializes Zustand slices
8. Tab navigation renders
```

### Library Selection Flow

```
User selects library
    ↓
selectLibrary() in LibrarySlice
    ├── Fetch library from API if needed
    ├── Load items from database
    ├── Cache cover images
    ├── Apply sorting
    └── Update store state
    ↓
Component re-renders with new items
```

### Playback Flow

```
User taps play on item
    ↓
PlayerService.playTrack()
    ├── Load track metadata from database
    ├── Queue tracks in TrackPlayer
    ├── Start playback
    ├── Update player store
    └── Report progress to server
    ↓
TrackPlayer background service handles
    ├── Remote control events
    ├── Progress updates
    └── Session management
```

---

## Technology Stack Details

### Frontend

- **React Native 0.81.5**
- **Expo 54.0.21**
- **Expo Router** (file-based routing)
- **React Native Track Player 4.1.2** (Audio playback)

### State & Storage

- **Zustand 5.0.8** (State management)
- **AsyncStorage** (User preferences)
- **Expo Secure Store** (Credentials)

### Database

- **Expo SQLite 16.0.8**
- **Drizzle ORM 0.44.5** (Type-safe database)

### UI Components

- **React Native Reanimated** (Animations)
- **React Navigation** (Navigation components)
- **Expo Vector Icons** (Icon library)

### API

- **Fetch API** (HTTP client)
- **Custom wrapper** with auto-retry for 401s

---

## File Organization

```
src/
├── app/                          # Expo Router pages
│   ├── (tabs)/                   # Tab navigation
│   ├── _layout.tsx               # Root layout
│   ├── index.tsx                 # Entry screen
│   └── login.tsx                 # Login screen
├── components/                   # React components
│   ├── ui/                       # Generic UI components
│   ├── player/                   # Playback controls
│   ├── library/                  # Library display
│   ├── home/                     # Home screen components
│   └── icons/                    # Icon components
├── db/                           # Database
│   ├── client.ts                 # SQLite connection
│   ├── schema/                   # Table definitions
│   └── helpers/                  # Data access functions
├── lib/                          # Utilities
│   ├── api/                      # API client
│   ├── logger/                   # Logging system
│   ├── theme.ts                  # Styling
│   └── appSettings.ts            # User preferences
├── providers/                    # React context providers
│   ├── AuthProvider.tsx
│   ├── DbProvider.tsx
│   └── StoreProvider.tsx
├── services/                     # Business logic
│   ├── PlayerService.ts
│   ├── ProgressService.ts
│   └── DownloadService.ts
├── stores/                       # Zustand state
│   ├── appStore.ts               # Main store
│   └── slices/                   # Slices by domain
├── types/                        # TypeScript types
└── i18n/                         # Internationalization
```

---

## API Integration

### Base Configuration

```
Base URL: Stored securely in device
Auth: Bearer token in Authorization header
Token Refresh: Automatic on 401 response
User-Agent: Custom with device info
```

### Key Endpoints

```
POST /auth/login
POST /auth/refresh

GET /api/libraries
GET /api/libraries/{id}
GET /api/libraries/{id}/items
GET /api/items/{id}

GET /api/authors
GET /api/series

POST /api/me/progress/{id}
GET /api/me/progress

POST /api/sessions
```

---

## Database Schema Highlights

### Key Tables

```
libraries        - Available libraries
libraryItems     - Individual books/podcasts
authors          - Author information
series           - Series information
mediaProgress    - User's listening progress
listeningSession - Active/completed sessions
downloads        - Downloaded content metadata
users            - User information
```

### Storage

```
Database File: abs2.sqlite
Location: App Document Directory
Migrations: Via Drizzle Kit
Persistence: Survives app updates
```

---

## Variant Implementation Strategy

### Recommended Approach

1. **Build-time:** Separate app.json and eas.json per variant
2. **Runtime:** Feature flag module for conditional features
3. **Database:** Single schema, variant checked at runtime
4. **Navigation:** Conditionally render tabs based on features

### Variant-Specific Changes

```
Free Version:
- Single library only
- No series browsing
- No authors browsing
- Limited downloads (1)
- No advanced features

Pro Version:
- Multiple libraries
- Full series browsing
- Author browsing
- Unlimited downloads
- Advanced statistics, search, etc.
```

---

## Performance Considerations

### Optimizations in Place

1. **Zustand Selectors** - Components subscribe to specific state slices
2. **Database Queries** - Using Drizzle ORM with efficient queries
3. **Lazy Loading** - Store slices initialized on-demand
4. **Caching** - Cover images and item details cached
5. **Memoization** - React components properly memoized

### Bottlenecks to Monitor

1. Large library (1000+ items) - pagination recommended
2. Download performance - background downloader used
3. Player initialization - async loading with progress

---

## Security

### Credential Storage

```
Server URL: Expo Secure Store
Access Token: Expo Secure Store
Refresh Token: Expo Secure Store
Username: Expo Secure Store
```

### API Security

```
HTTPS: Required (configured via app.json)
Token Refresh: Automatic, secure
Header Redaction: API tokens redacted in logs
```

### Local Storage

```
AsyncStorage: Non-sensitive preferences only
SQLite: Local database, not encrypted by default
File System: Downloads in app document directory
```

---

## Testing

### Unit Tests

- Located in `**/__tests__` directories
- Using Jest and React Testing Library
- Fixtures in `src/__tests__/fixtures`

### Test Coverage

- Store slices (authorsSlice, playerSlice, etc.)
- Services (PlayerService)
- Helpers (formatting, database operations)

### Manual Testing

```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

---

## Build & Deployment

### Development

```bash
npm run start           # Expo dev server
npm run android        # Android emulator
npm run ios           # iOS simulator
```

### Testing

```bash
npm run test           # Jest tests
npm run lint           # ESLint check
```

### Production Build

```bash
npm run build:free:ios     # Free version
npm run build:pro:ios      # Pro version
npm run submit:free:ios    # Submit to App Store
```

---

## Common Patterns

### Using Store State in Component

```typescript
import { usePlayer } from "@/stores/appStore";

function MyComponent() {
  const { currentTrack, isPlaying } = usePlayer();
  // Component subscribes only to these fields
}
```

### API Call with Store Update

```typescript
const selectLibrary = async (id: string) => {
  const library = await fetchLibrary(id);
  set((state) => ({
    ...state,
    library: { ...state.library, selectedLibrary: library },
  }));
};
```

### Database Operation

```typescript
import { libraryHelpers } from "@/db/helpers";

const libraries = await libraryHelpers.getAllLibraries();
```

---

## Troubleshooting Guide

### Player Not Starting

- Check TrackPlayer initialization in `index.ts`
- Verify PlayerService singleton
- Check audio permissions

### Store Not Updating

- Verify provider stack is correct
- Check selector in component
- Ensure set() is called in slice action

### Database Queries Failing

- Check schema definition in `db/schema/`
- Verify database initialization in DbProvider
- Check migration status

### API Calls Failing

- Verify server URL is set
- Check auth token is valid
- Verify API endpoints exist

---

## Key Files Reference

| Purpose        | File                             |
| -------------- | -------------------------------- |
| App entry      | `src/index.ts`                   |
| Root layout    | `src/app/_layout.tsx`            |
| Tab navigation | `src/app/(tabs)/_layout.tsx`     |
| Authentication | `src/providers/AuthProvider.tsx` |
| Database       | `src/db/client.ts`               |
| Store          | `src/stores/appStore.ts`         |
| Player service | `src/services/PlayerService.ts`  |
| API client     | `src/lib/api/api.ts`             |
| App config     | `app.json`                       |
| Build config   | `eas.json`                       |

---

## Next Steps for Variants

1. Create `src/lib/variants.ts` for variant detection
2. Create `app-free.json` and `app-pro.json`
3. Create `eas-free.json` and `eas-pro.json`
4. Add variant build scripts to `package.json`
5. Update `src/app/(tabs)/_layout.tsx` for conditional tabs
6. Update `src/providers/StoreProvider.tsx` for conditional initialization
7. Add feature checks in components
8. Test both variants thoroughly
9. Submit to app stores

See `BUILD_VARIANT_ARCHITECTURE.md` and `VARIANT_IMPLEMENTATION_GUIDE.md` for detailed implementation steps.

---

## Resources

- **Expo Documentation:** https://expo.dev
- **Zustand Guide:** https://github.com/pmndrs/zustand
- **Drizzle ORM:** https://orm.drizzle.team
- **React Native Track Player:** https://rntp.dev
- **Expo Router:** https://expo.dev/routing
- **EAS Build:** https://docs.expo.dev/build

---

## Contact & Support

For architecture questions or clarifications, refer to:

- Code documentation in source files
- Comment annotations on complex functions
- Test files for usage examples
- PR discussions for design decisions
