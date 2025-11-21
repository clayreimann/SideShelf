# Tab Bar Implementation - File Location Reference

## Core Tab Navigation Files

### Tab Navigator Configuration (PRIMARY)
**`/home/user/SideShelf/src/app/(tabs)/_layout.tsx`**
- Location: 245 lines
- Contains: `TAB_CONFIG` array definition, tab renderer logic, floating player
- Key Components: `TabBarIcon`, `RootLayout` component
- Lines 37-77: Tab definitions
- Lines 145-193: Cross-platform tabs (Android/iOS <18)
- Lines 194-244: Native tabs (iOS 18+)

### Tab Screens Root
**`/home/user/SideShelf/src/app/(tabs)/`**
```
├── _layout.tsx          (THIS FILE - Tab navigator)
├── home/
│   ├── _layout.tsx      (home screen layout)
│   ├── index.tsx        (home screen)
│   └── item/[itemId].tsx
├── library/
│   ├── _layout.tsx
│   ├── index.tsx
│   └── [item]/index.tsx
├── series/
│   ├── _layout.tsx
│   ├── index.tsx
│   └── [seriesId]/...
├── authors/
│   ├── _layout.tsx
│   ├── index.tsx
│   └── [authorId]/...
└── more/
    ├── _layout.tsx
    ├── index.tsx        (main settings/more screen)
    ├── settings.tsx
    ├── me.tsx
    ├── logger-settings.tsx
    ├── storage.tsx
    ├── logs.tsx
    ├── track-player.tsx
    ├── actions.tsx
    ├── library-stats.tsx
    └── collections.tsx
```

### Root App Layout
**`/home/user/SideShelf/src/app/_layout.tsx`**
- Contains: Root Stack navigator, app initialization, deep linking
- Lines 54-65: App initialization with `initializeApp()`
- Lines 290-319: Stack.Screen definitions

### App Entry Point
**`/home/user/SideShelf/src/app/index.tsx`**
- Simple redirect to `/(tabs)/home`
- Checks authentication status

---

## Settings & Preferences Files

### AsyncStorage Settings Interface (LOW-LEVEL)
**`/home/user/SideShelf/src/lib/appSettings.ts`**
- 210 lines
- Direct AsyncStorage functions
- Storage keys: `@app/jumpForwardInterval`, `@app/jumpBackwardInterval`, etc.
- Functions:
  - `getJumpForwardInterval()` / `setJumpForwardInterval()`
  - `getJumpBackwardInterval()` / `setJumpBackwardInterval()`
  - `getSmartRewindEnabled()` / `setSmartRewindEnabled()`
  - `getHomeLayout()` / `setHomeLayout()`
  - `getDiagnosticsEnabled()` / `setDiagnosticsEnabled()`
  - `getPeriodicNowPlayingUpdatesEnabled()` / `setPeriodicNowPlayingUpdatesEnabled()`
  - `calculateSmartRewindTime()` - Helper for smart rewind calculation

### Zustand Settings Slice (MID-LEVEL)
**`/home/user/SideShelf/src/stores/slices/settingsSlice.ts`**
- 385 lines
- Zustand store slice for settings
- Interfaces:
  - `SettingsSliceState` - State structure (settings object)
  - `SettingsSliceActions` - Available actions
  - `SettingsSlice` - Combined interface
- Key function: `createSettingsSlice` - Creates the slice
- State properties (all scoped under `settings.`):
  - `jumpForwardInterval`
  - `jumpBackwardInterval`
  - `smartRewindEnabled`
  - `homeLayout`
  - `diagnosticsEnabled`
  - `initialized`
  - `isLoading`

### Main App Store (HIGH-LEVEL)
**`/home/user/SideShelf/src/stores/appStore.ts`**
- Main Zustand store combining all slices
- Lines 807-859: `useSettings()` hook definition
- Lines 1066-1073: `useSettingsStoreInitializer()` hook

### Store Provider
**`/home/user/SideShelf/src/providers/StoreProvider.tsx`**
- Wraps app with store provider
- Initializes store on mount

### Store Exports
**`/home/user/SideShelf/src/stores/index.ts`**
- Line 24: Exports `useSettings`, `useSettingsStoreInitializer`
- Central re-export location for store hooks

---

## Theme & Styling Files

### Theme System (with Tab Styling)
**`/home/user/SideShelf/src/lib/theme.ts`**
- 96 lines
- `useThemedStyles()` hook - Returns themed styles based on dark/light mode
- Lines 38-54: Tab styling configuration
- Lines 18-21: Color scheme detection
- Dark mode tab colors: `#1C1C1E` background, `rgba(255,255,255,0.65)` icons
- Light mode tab colors: `#F8F8F8` background, `#6A6A6A` icons
- Platform detection: Lines 14-15 detect iOS 18+ for native tabs

---

## Navigation Files

### Navigation Utilities
**`/home/user/SideShelf/src/lib/navigation.ts`**
- 78 lines
- Helper functions for tab-aware navigation
- Functions:
  - `navigateToTabDetail()` - Generic tab detail navigation
  - `navigateToAuthor()` - Convenience for author tab
  - `navigateSeries()` - Convenience for series tab
  - `navigateToLibraryItem()` - Convenience for library tab

---

## Internationalization (i18n) Files

### English Translations
**`/home/user/SideShelf/src/i18n/locales/en.ts`**
- Contains translation key `tabs.*` for tab labels
- Required keys:
  - `tabs.home`
  - `tabs.library`
  - `tabs.series`
  - `tabs.authors`
  - `tabs.more`

### Spanish Translations
**`/home/user/SideShelf/src/i18n/locales/es.ts`**
- Spanish translations for all tab labels

### i18n Index
**`/home/user/SideShelf/src/i18n/index.ts`**
- `translate()` function - Used in tab labels (line 4 of _layout.tsx)
- i18n setup and configuration

---

## Component Files

### Floating Player (Displayed in Tabs)
**`/home/user/SideShelf/src/components/ui/FloatingPlayer.tsx`**
- Rendered in TabLayout (line 189 of `_layout.tsx`)
- Overlaid above tab content

### Error Boundary (For Floating Player)
**`/home/user/SideShelf/src/components/errors/TabErrorBoundary.tsx`**
- Wraps floating player
- Error handling for tab content

---

## Type Definition Files

### Store Types
**`/home/user/SideShelf/src/types/store.ts`**
- TypeScript types for store-related items
- `SliceCreator` type used in settings slice

### Database & Component Types
**`/home/user/SideShelf/src/types/database.ts`**
**`/home/user/SideShelf/src/types/components.ts`**
- Related type definitions

---

## Quick Navigation Map

### To Modify Tab Configuration
1. Edit: `/home/user/SideShelf/src/app/(tabs)/_layout.tsx` (lines 37-77)
2. Add translations: `/home/user/SideShelf/src/i18n/locales/en.ts`
3. Create screen folder: `/home/user/SideShelf/src/app/(tabs)/newtab/`

### To Access Settings in Components
```typescript
// Import from stores
import { useSettings } from "@/stores";

// Use the hook
const { homeLayout, updateHomeLayout } = useSettings();
```

### To Modify Settings Storage
1. Add async function: `/home/user/SideShelf/src/lib/appSettings.ts`
2. Add to slice: `/home/user/SideShelf/src/stores/slices/settingsSlice.ts`
3. Update state interface: Add to `SettingsSliceState`
4. Add actions: Create update/get methods
5. Update store: `/home/user/SideShelf/src/stores/appStore.ts`
6. Update hook: `useSettings()` function

### To Change Tab Bar Styling
1. Edit: `/home/user/SideShelf/src/lib/theme.ts` (lines 38-54)
2. Or override in: `/home/user/SideShelf/src/app/(tabs)/_layout.tsx` (screenOptions)

### To Add Platform-Specific Logic
1. Check: `/home/user/SideShelf/src/lib/theme.ts` for iOS version detection
2. Implement: `/home/user/SideShelf/src/app/(tabs)/_layout.tsx` (lines 145-244)

---

## File Dependency Graph

```
App Structure:
  src/app/_layout.tsx (root)
    ↓
  src/app/(tabs)/_layout.tsx (tab navigator)
    ├─→ lib/theme.ts (styling)
    ├─→ lib/navigation.ts (navigation helpers)
    ├─→ i18n/index.ts (translations)
    ├─→ components/ui/FloatingPlayer.tsx
    └─→ stores/appStore.ts (settings access)
        ↓
    src/stores/slices/settingsSlice.ts
        ↓
    src/lib/appSettings.ts (AsyncStorage)
```

---

## Summary Table

| Responsibility | File | Key Lines |
|---|---|---|
| Tab definitions | `(tabs)/_layout.tsx` | 37-77 |
| Native tabs rendering | `(tabs)/_layout.tsx` | 194-244 |
| Cross-platform tabs | `(tabs)/_layout.tsx` | 145-193 |
| Settings state | `slices/settingsSlice.ts` | All |
| Settings storage | `lib/appSettings.ts` | All |
| Settings hook | `stores/appStore.ts` | 807-859 |
| Theme/colors | `lib/theme.ts` | 38-54 |
| Icons | `(tabs)/_layout.tsx` | 86-121 |
| Navigation helpers | `lib/navigation.ts` | All |
| i18n keys | `i18n/locales/en.ts` | tabs.* |
| Platform detection | `lib/theme.ts` | 1-14 |
