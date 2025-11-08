# Shared Mock Library

This directory contains reusable mock factories for common dependencies used across test files. These factories eliminate duplication, ensure consistency, and make tests easier to write and maintain.

## Overview

Instead of duplicating 150-200 lines of mock setup code across multiple test files, we provide centralized, configurable mock factories that can be imported and customized as needed.

## Available Mocks

### TrackPlayer Mocks

Located in `trackPlayer.ts`. Provides comprehensive mocks for `react-native-track-player`.

#### `createMockTrackPlayer(options?)`

Creates a full mock TrackPlayer with all methods, events, and enums.

```typescript
import { createMockTrackPlayer, State } from "@/__tests__/mocks";

// Basic usage with defaults
const mockTrackPlayer = createMockTrackPlayer();
jest.mock("react-native-track-player", () => mockTrackPlayer);

// With custom initial state
const mockTrackPlayer = createMockTrackPlayer({
  initialState: State.Playing,
  initialQueue: [mockTrack],
  initialPosition: 300,
  initialDuration: 1000,
  initialRate: 1.5,
  initialVolume: 0.8,
});

// With method overrides
const mockTrackPlayer = createMockTrackPlayer({
  overrides: {
    play: jest.fn().mockRejectedValue(new Error("Playback failed")),
  },
});
```

**Options:**

- `initialState`: Playback state (default: `State.None`)
- `initialQueue`: Array of tracks (default: `[]`)
- `initialPosition`: Position in seconds (default: `0`)
- `initialDuration`: Duration in seconds (default: `0`)
- `initialRate`: Playback rate (default: `1.0`)
- `initialVolume`: Volume (default: `1.0`)
- `overrides`: Override any specific mock functions

#### `createMinimalMockTrackPlayer()`

Creates a lightweight mock with only essential methods. Useful for slice tests that don't need full TrackPlayer functionality.

```typescript
import { createMinimalMockTrackPlayer } from "@/__tests__/mocks";

const mockTrackPlayer = createMinimalMockTrackPlayer();
jest.mock("react-native-track-player", () => mockTrackPlayer);
```

### AsyncStorage Mocks

Located in `asyncStorage.ts`. Provides mocks for `@react-native-async-storage/async-storage`.

#### `createMockAsyncStorage()`

Creates a standard AsyncStorage mock.

```typescript
import { createMockAsyncStorage } from "@/__tests__/mocks";

const mockAsyncStorage = createMockAsyncStorage();
jest.mock("@react-native-async-storage/async-storage", () => ({
  default: mockAsyncStorage,
}));
```

#### `createMockAsyncStorageWithDefault()`

Creates a mock with the proper default export structure. Use this in `setup.ts`.

```typescript
import { createMockAsyncStorageWithDefault } from "@/__tests__/mocks";

jest.mock("@react-native-async-storage/async-storage", () => createMockAsyncStorageWithDefault());
```

### Store Slice Mocks

Located in `stores.ts`. Provides mocks for Zustand store slices.

#### `createMockPlayerSlice(options?)`

Creates a mock player slice with all state and methods.

```typescript
import { createMockPlayerSlice } from "@/__tests__/mocks";

// Basic usage
const mockStore = createMockPlayerSlice();
useAppStore.getState.mockReturnValue(mockStore);

// With custom state
const mockStore = createMockPlayerSlice({
  state: {
    position: 300,
    isPlaying: true,
    currentTrack: mockTrack,
  },
});

// With custom methods
const mockStore = createMockPlayerSlice({
  methods: {
    updatePosition: jest.fn().mockImplementation((pos) => {
      mockStore.player.position = pos;
    }),
  },
});
```

**Options:**

- `state`: Override player state properties
- `methods`: Override action methods

#### `createMockLibrarySlice(options?)`

Creates a mock library slice.

```typescript
import { createMockLibrarySlice } from "@/__tests__/mocks";

const mockStore = createMockLibrarySlice({
  state: {
    libraryItems: [mockItem1, mockItem2],
    selectedLibraryId: "library-1",
  },
});
```

#### `createMockSettingsSlice(options?)`

Creates a mock settings slice.

```typescript
import { createMockSettingsSlice } from "@/__tests__/mocks";

const mockStore = createMockSettingsSlice({
  state: {
    jumpForwardInterval: 30,
    smartRewindEnabled: true,
  },
});
```

### Service Mocks

Located in `services.ts`. Provides mocks for service classes.

#### `createMockProgressService()`

Creates a mock ProgressService with sensible defaults.

```typescript
import { createMockProgressService } from "@/__tests__/mocks";

const mockProgressService = createMockProgressService();
jest.mock("@/services/ProgressService", () => ({
  progressService: mockProgressService,
}));

// Customize behavior
mockProgressService.getCurrentSession.mockResolvedValue({
  id: "session-1",
  libraryItemId: "item-1",
  currentTime: 300,
});
```

#### `createMockPlayerService()`

Creates a mock PlayerService with sensible defaults.

```typescript
import { createMockPlayerService } from "@/__tests__/mocks";

const mockPlayerService = createMockPlayerService();
```

## Best Practices

### 1. Import from Index

Always import from the main index file for cleaner imports:

```typescript
// ✅ Good
import { createMockTrackPlayer, State } from "@/__tests__/mocks";

// ❌ Avoid
import { createMockTrackPlayer } from "@/__tests__/mocks/trackPlayer";
```

### 2. Customize Only What You Need

Use the options parameter to customize only the specific values needed for your test:

```typescript
// ✅ Good - customize only what matters for this test
const mockTrackPlayer = createMockTrackPlayer({
  initialState: State.Playing,
});

// ❌ Avoid - don't override everything when defaults work
const mockTrackPlayer = createMockTrackPlayer({
  initialState: State.None,
  initialQueue: [],
  initialPosition: 0,
  // ... unnecessary explicit defaults
});
```

### 3. Use Minimal Mocks When Possible

If you only need a few TrackPlayer methods, use the minimal mock:

```typescript
// ✅ Good for slice tests
const mockTrackPlayer = createMinimalMockTrackPlayer();

// ❌ Overkill for simple tests
const mockTrackPlayer = createMockTrackPlayer();
```

### 4. Reset Mocks Between Tests

Always reset mocks in `beforeEach` to prevent test pollution:

```typescript
beforeEach(() => {
  jest.clearAllMocks();

  // Reset custom behavior
  mockTrackPlayer.play.mockResolvedValue(undefined);
});
```

### 5. Document Custom Behavior

When overriding default behavior, add a comment explaining why:

```typescript
// Simulate playback failure to test error handling
const mockTrackPlayer = createMockTrackPlayer({
  overrides: {
    play: jest.fn().mockRejectedValue(new Error("Playback failed")),
  },
});
```

## Migration Guide

### Before (Duplicated Mocks)

```typescript
// In every test file...
jest.mock("react-native-track-player", () => ({
  setupPlayer: jest.fn().mockResolvedValue(undefined),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  getPlaybackState: jest.fn().mockResolvedValue({ state: 0 }),
  getQueue: jest.fn().mockResolvedValue([]),
  // ... 50+ more lines
  State: { None: 0, Ready: 1, Playing: 2, Paused: 3, Stopped: 4 },
  Event: {
    /* ... */
  },
}));
```

### After (Shared Mocks)

```typescript
import { createMockTrackPlayer } from "@/__tests__/mocks";

const mockTrackPlayer = createMockTrackPlayer();
jest.mock("react-native-track-player", () => mockTrackPlayer);
```

## TypeScript Support

All mocks are fully typed with TypeScript interfaces. This provides:

- **Autocomplete**: IntelliSense for all mock properties and methods
- **Type Safety**: Compile-time checking for correct mock usage
- **Documentation**: Hover over types to see documentation

```typescript
import type { MockTrackPlayer, MockPlayerSlice } from "@/__tests__/mocks";

// TypeScript knows all available properties and methods
const mockTrackPlayer: MockTrackPlayer = createMockTrackPlayer();
const mockStore: MockPlayerSlice = createMockPlayerSlice();
```

## Contributing

When adding new mocks:

1. **Create a factory function**: Follow the `createMock*` naming convention
2. **Export types**: Export both the factory and its TypeScript interface
3. **Add options**: Support customization via an options parameter
4. **Provide defaults**: Ensure sensible defaults for common use cases
5. **Document examples**: Add JSDoc comments with usage examples
6. **Update index.ts**: Add exports to the main index file
7. **Update README**: Document the new mock in this file

## Examples

### Testing PlayerService

```typescript
import { createMockTrackPlayer, createMockProgressService, State } from "@/__tests__/mocks";

const mockTrackPlayer = createMockTrackPlayer({
  initialState: State.Ready,
  initialQueue: [mockTrack],
});
const mockProgressService = createMockProgressService();

jest.mock("react-native-track-player", () => mockTrackPlayer);
jest.mock("@/services/ProgressService", () => ({
  progressService: mockProgressService,
}));

describe("PlayerService", () => {
  it("should play track", async () => {
    await playerService.play();
    expect(mockTrackPlayer.play).toHaveBeenCalled();
  });
});
```

### Testing Player Slice

```typescript
import { createMockPlayerSlice } from "@/__tests__/mocks";
import { useAppStore } from "@/stores";

jest.mock("@/stores", () => ({
  useAppStore: {
    getState: jest.fn(),
    setState: jest.fn(),
  },
}));

describe("playerSlice", () => {
  let mockStore: MockPlayerSlice;

  beforeEach(() => {
    mockStore = createMockPlayerSlice();
    (useAppStore.getState as jest.Mock).mockReturnValue(mockStore);
  });

  it("should update position", () => {
    mockStore.updatePosition(100);
    expect(mockStore.player.position).toBe(100);
  });
});
```

## Troubleshooting

### Mock not working in test

**Problem**: Mock methods are not being called as expected.

**Solution**: Ensure you're mocking at the module level before imports:

```typescript
// ✅ Mock before imports
import { createMockTrackPlayer } from "@/__tests__/mocks";
const mockTrackPlayer = createMockTrackPlayer();
jest.mock("react-native-track-player", () => mockTrackPlayer);

// Now import the code that uses TrackPlayer
import { PlayerService } from "@/services/PlayerService";
```

### Type errors with mock

**Problem**: TypeScript complains about missing properties on mock.

**Solution**: Use the provided TypeScript interfaces:

```typescript
import type { MockTrackPlayer } from "@/__tests__/mocks";

const mockTrackPlayer: MockTrackPlayer = createMockTrackPlayer();
```

### Test pollution between tests

**Problem**: Tests pass individually but fail when run together.

**Solution**: Reset mocks in `beforeEach`:

```typescript
beforeEach(() => {
  jest.clearAllMocks();

  // Reset any stateful mocks
  mockStore.player.position = 0;
  mockStore.player.isPlaying = false;
});
```
