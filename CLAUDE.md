# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native app built with Expo for Audiobookshelf - a self-hosted audiobook and podcast server. The app provides offline downloads, audio playback, and progress synchronization across devices.

## Common Commands

### Development

```bash
npx expo start              # Start development server
npm run ios                 # Build and run on iOS simulator (includes prebuild --clean)
npm run ios:device          # Build and run on physical iOS device
npm run android             # Build and run on Android emulator
```

### Testing

```bash
npm test                    # Run all tests once
npm run test:watch          # Run tests in watch mode
npm run test:coverage       # Generate coverage report
npm run test:report         # Generate HTML test report + coverage (opens test-report.html)
jest path/to/file.test.ts   # Run a single test file
```

### Database

```bash
npm run drizzle:generate    # Generate database migrations from schema changes
```

### Linting

```bash
npm run lint                # Run ESLint
npm run lint:complexity     # Generate complexity report
```

## Architecture

### Tech Stack

- **Framework**: React Native with Expo 54
- **Navigation**: Expo Router (file-based routing in `src/app/`)
- **State Management**: Zustand with slice pattern (see `src/stores/`)
- **Database**: SQLite with Drizzle ORM
- **Audio**: react-native-track-player
- **Downloads**: @kesha-antonov/react-native-background-downloader (custom fork)

### Project Structure

```
src/
├── app/                    # Expo Router file-based routes
│   ├── (tabs)/            # Tab navigation screens
│   ├── FullScreenPlayer/  # Player modal
│   └── _layout.tsx        # Root layout
├── components/            # Reusable UI components
│   ├── ui/               # Generic UI components
│   ├── library/          # Library-specific components
│   ├── player/           # Player controls & UI
│   └── home/             # Home screen components
├── db/                    # Database layer
│   ├── schema/           # Drizzle table schemas
│   ├── migrations/       # Generated migration files
│   └── helpers/          # DB helper functions (see DB Guidelines below)
├── lib/                   # Utilities and API clients
│   ├── api/              # Audiobookshelf API client (api.ts, endpoints.ts)
│   ├── downloads/        # Download management utilities
│   └── logger/           # Logging configuration
├── providers/             # React context providers (e.g., AuthProvider)
├── services/              # Business logic and background services
│   ├── PlayerService.ts          # Audio playback with TrackPlayer
│   ├── DownloadService.ts        # Download management & progress
│   ├── ProgressService.ts        # Progress sync with server
│   ├── ApiClientService.ts       # API wrapper service
│   └── coordinator/              # Service coordination
├── stores/                # Zustand state slices
│   ├── appStore.ts       # Main store combining all slices
│   └── slices/           # Individual domain slices (library, player, etc.)
├── types/                 # TypeScript type definitions
└── i18n/                  # Internationalization (locales/)
```

### Key Patterns

#### State Management (Zustand Slices)

The app uses a **slice pattern** in Zustand to organize state by domain:

- Each slice (e.g., `librarySlice`, `playerSlice`) manages a specific concern
- Slices are combined in `appStore.ts` to form the main store
- Use `subscribeWithSelector` middleware for selective subscriptions

#### Database Guidelines (Important!)

- **ALL database marshalling and writes must go through helpers in `src/db/helpers/`**
- One helper file per entity/table (e.g., `users.ts`, `libraries.ts`)
- Helpers export:
  - `marshal...FromApi()` functions (pure transformations)
  - `upsert...()` and `insert...()` functions for writes
  - Transaction variants (`...Tx()`) for batch operations
- **Never** write inline `db.insert()` or `db.update()` in UI code or providers
- See `.cursor/rules/db-coding-standards.mdc` for detailed examples

#### TypeScript

- Use `@/` prefix for all imports (configured in tsconfig.json)
- Strict mode enabled
- Imports at top of file unless avoiding circular dependencies
- Document types with JSDoc

#### API Integration

- Audiobookshelf API documentation: https://api.audiobookshelf.org/
- API client in `src/lib/api/api.ts`
- API endpoints defined in `src/lib/api/endpoints.ts`
- Use `ApiClientService` for authenticated requests

### Services Architecture

#### PlayerService

Manages audio playback using react-native-track-player:

- Playback controls (play, pause, seek, speed)
- Progress tracking and sync
- Chapter navigation
- Background audio support

#### DownloadService

Handles content downloads with background support:

- Queue management
- Progress tracking
- Auto-repair for iOS path changes (container path migrations)
- Storage cleanup

#### ProgressService

Synchronizes playback progress with Audiobookshelf server:

- Session management (local vs playback sessions)
- Periodic sync intervals
- Conflict resolution

## Development Workflow

### Making Changes

1. Read existing code before proposing changes
   1. make only a single change at a time
   2. do not add nice to have features until the initial, requested change is complete
2. Write tests for expected behavior, ensure they fail
3. Write code to implement features
4. Run tests after changes: `npm test`, ensure these tests pass
5. Use the TodoWrite tool to track multi-step tasks
6. Follow existing patterns and architecture

### Testing

- Unit tests use Jest + React Native Testing Library
- Mock setup in `src/__tests__/setup.ts` and `src/__tests__/mocks/`
- Test utilities in `src/__tests__/utils/`
- Run related tests: `jest --findRelatedTests path/to/file.ts`

### Database Changes

1. Modify schema in `src/db/schema/`
2. Run `npm run drizzle:generate` to create migration
3. Create/update helpers in `src/db/helpers/` for the entity
4. Test marshalling and write operations

### Documentation

- Architecture docs go in `docs/architecture/` (strategy and rationale)
- Investigation reports in `docs/investigation/`
- Don't prompt to create docs - just write them
- Code-level advice belongs in JSDoc comments, not markdown docs
- You may create intermediate markdown files to track investigation, but these files should be cleaned up after the feature is complete

## Tools and Environment

- Use `mise` for managing development tooling (Node.js versions, etc.)
- Pre-commit hooks configured via Husky (lint-staged runs prettier + tests)

## External References

- Audiobookshelf API: https://api.audiobookshelf.org/
- Expo Router docs: https://docs.expo.dev/router/introduction/
- Drizzle ORM: https://orm.drizzle.team/
- react-native-track-player: https://react-native-track-player.js.org/
