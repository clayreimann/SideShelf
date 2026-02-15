# Coding Conventions

**Analysis Date:** 2026-02-15

## Naming Patterns

**Files:**

- Services: PascalCase with `Service` suffix (e.g., `PlayerService.ts`, `ProgressService.ts`, `ApiClientService.ts`)
- Store slices: camelCase with `Slice` suffix (e.g., `playerSlice.ts`, `librarySlice.ts`, `authorsSlice.ts`)
- Database helpers: camelCase plural (e.g., `users.ts`, `libraries.ts`, `chapters.ts`)
- Components: PascalCase (e.g., `ChapterList.tsx`, `CollapsibleSection.tsx`)
- Test files: Match source file name with `.test.ts` or `.test.tsx` suffix (e.g., `playerSlice.test.ts`)
- Type definition files: camelCase or domain-specific (e.g., `player.ts`, `api.ts`, `database.ts`, `coordinator.ts`)

**Functions:**

- camelCase for all functions (async and sync)
- Private/internal functions: prefix with underscore (e.g., `_setCurrentTrack`, `_updateCurrentChapter`, `_setTrackLoading`)
- Public service methods: action verbs in camelCase (e.g., `startSession`, `updateProgress`, `syncSession`)
- Getter functions: prefix with `get` (e.g., `getUserByUsername`, `getMediaProgressForLibraryItem`)
- Marshal/transformation functions: prefix with `marshal` (e.g., `marshalUserFromAuthResponse`, `marshalMediaProgressFromApi`)

**Variables:**

- camelCase for local variables and state properties
- Constants: UPPER_SNAKE_CASE (e.g., `SYNC_INTERVAL_UNMETERED`, `MIN_SESSION_DURATION`, `ASYNC_KEYS`)
- Mocked values in tests: prefix with `mock` (e.g., `mockPlayerTrack`, `mockApiUser`, `mockLoginResponse`)
- Private class properties: underscore prefix (e.g., `private syncInterval`, `private startSessionLocks`)

**Types and Interfaces:**

- PascalCase for all type names
- State interfaces: `{Domain}SliceState` pattern (e.g., `PlayerSliceState`, `LibrarySliceState`)
- Actions interfaces: `{Domain}SliceActions` pattern (e.g., `PlayerSliceActions`, `LibrarySliceActions`)
- Row types (database): `{Entity}Row` suffix (e.g., `UserRow`, `LibraryItemRow`, `LocalListeningSessionRow`)
- Request/response types: `Api{Action}{Entity}` pattern (e.g., `ApiLoginResponse`, `ApiMeResponse`, `ApiLibraryItemsResponse`)
- Error/utility types: descriptive PascalCase (e.g., `ApiError`, `SessionInfo`, `CurrentChapter`)

## Code Style

**Formatting:**

- Prettier configuration: `.prettierrc.json`
- Print width: 100 characters
- Tab width: 2 spaces
- Use spaces (not tabs)
- Trailing commas: `es5` style (objects/arrays only, not function parameters)
- Quotes: double quotes (`"`) for strings
- Semicolons: enabled
- Arrow function parentheses: always required
- Bracket spacing: enabled

**Linting:**

- ESLint with expo configuration: `eslint-config-expo`
- Rule: `complexity` max 10 (warn level)
- Config file: `eslint.config.js`
- Run with: `npm run lint`
- Auto-fix with Prettier on save (pre-commit hook via lint-staged)

## Import Organization

**Order:**

1. External packages from `node_modules` (React, React Native, third-party libraries)
2. Internal absolute imports using `@/` prefix (project-relative imports)
3. Type imports (`import type { ... } from ...`)

**Path Aliases:**

- `@/` resolves to `./src/` (configured in `tsconfig.json`)
- Always use `@/` prefix for all imports within the project
- Never use relative imports (`../` or `./`)

**Example:**

```typescript
import React from "react";
import { View } from "react-native";
import { create } from "zustand";

import { getUserByUsername } from "@/db/helpers/users";
import { logger } from "@/lib/logger";
import { playerService } from "@/services/PlayerService";
import type { PlayerTrack, CurrentChapter } from "@/types/player";
import type { SliceCreator } from "@/types/store";
```

## Error Handling

**Patterns:**

- Use try-catch blocks for async operations and API calls
- Log errors at appropriate levels: `error`, `warn`, `info`, `debug`
- Error messages should be descriptive and actionable
- Include context in log messages using tagged logger: `logger.forTag("ComponentName")`
- Throw errors only when necessary; prefer returning error types or null for expected failures

**Error Response Handling:**

- API endpoint errors follow pattern in `src/lib/api/endpoints.ts`
- Use `handleResponseError()` helper to parse JSON errors or plain text responses
- Catch JSON parse errors and fall back to raw text response
- Log all error responses before throwing

**Example Pattern:**

```typescript
const log = logger.forTag("PlayerSlice");

try {
  await someAsyncOperation();
} catch (error) {
  log.error(`Operation failed: ${error}`);
  // Handle or rethrow
}
```

## Logging

**Framework:** `react-native-logs` (configured via `src/lib/logger`)

**Patterns:**

- Always use tagged logger: `logger.forTag("FileName")`
- Log level: error > warn > info > debug
- Include operation context in messages: `[functionName] description`
- Use square brackets for function/context: `[getCurrentUserContext] No username found`

**Usage:**

```typescript
const log = logger.forTag("PlayerSlice");

log.debug("Debug message");
log.info("Info message");
log.warn("Warning message");
log.error("Error message");
```

## Comments

**When to Comment:**

- Non-obvious logic or complex algorithms
- Workarounds for known issues (prefix with NOTE: or FIXME:)
- Important state transitions or side effects
- Explanations of "why", not "what" (code shows the "what")
- Document assumptions about input/state

**JSDoc/TSDoc:**

- Use for exported functions, classes, and interfaces
- Include: description, @param, @returns, @example for complex functions
- Include `@unit` tags for numeric parameters with specific units (seconds, milliseconds, etc.)
- Use /\*_ ... _/ style (not ///)
- JSDoc for public APIs, inline comments (// or /\* \*/) for implementation details

**Example:**

```typescript
/**
 * Gets current user context, optionally including active session.
 * Centralizes the username→user→session lookup pattern.
 *
 * @param libraryItemId - Optional library item to fetch session for
 * @returns User context with userId, username, and optional session, or null if user not found
 */
private async getCurrentUserContext(libraryItemId?: string): Promise<{
  userId: string;
  username: string;
  session?: LocalListeningSessionRow | null;
} | null>
```

## Function Design

**Size:**

- Prefer smaller functions (< 50 lines)
- Complexity max 10 (ESLint rule enforced)
- Break complex logic into helper functions

**Parameters:**

- Named parameters for functions with 3+ parameters
- Use object parameter syntax when function has many related parameters
- Destructure parameters in function signature when possible

**Return Values:**

- Use null for "no value" rather than undefined
- Return error info or null for expected failures (not exceptions)
- Async functions always return Promise (even if void)
- Use union types for multiple return value types (e.g., `T | null`, `Result | Error`)

## Module Design

**Exports:**

- Named exports for utility functions and types
- Default export for components and slices
- Export types separately from implementations
- Group related exports together

**Barrel Files:**

- Located at `index.ts` in directories with multiple exports
- Re-export public API only, not internal helpers
- Example: `src/types/index.ts`

**Database Helpers Pattern:**

- One file per entity (e.g., `users.ts`, `libraries.ts`)
- Export:
  - `marshal...FromApi()` functions (pure transformations)
  - `upsert...()` and `insert...()` functions for writes
  - `get...()` functions for queries
  - Transaction variants (`...Tx()`) for batch operations
- Never write inline `db.insert()` in UI code or providers
- See `src/db/helpers/` for detailed examples

**Service Design:**

- Singleton pattern with `getInstance()` static method
- Encapsulate related business logic
- Separate concerns: PlayerService (playback), ProgressService (sync), DownloadService (downloads)
- Example files: `src/services/PlayerService.ts`, `src/services/ProgressService.ts`

## TypeScript Configuration

- **Mode:** Strict enabled (`strict: true` in tsconfig.json)
- **Imports:** All imports at top of file (unless avoiding circular dependencies)
- **Type Annotations:** Required for function parameters and returns (strict mode enforced)
- **Any:** Never use `any` without explicit comment explaining why

---

_Convention analysis: 2026-02-15_
