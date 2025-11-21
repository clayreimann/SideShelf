# Tab Bar Implementation - Documentation Index

This documentation set covers the complete tab bar implementation in the SideShelf React Native application, including navigation configuration, current tabs, structure, and settings infrastructure.

## Documents Overview

### 1. Quick Reference (START HERE)
**File**: `docs/investigation/tab-bar-summary.md`

Perfect for getting a quick understanding of:
- Where the tab navigator is configured
- What tabs currently exist
- How tabs are defined and structured
- Where settings/preferences are stored

**Key Takeaways**:
- 5 main tabs: Home, Library, Series, Authors, More
- Configured in: `src/app/(tabs)/_layout.tsx` (lines 37-77)
- Settings stored in: AsyncStorage + Zustand store
- Uses React Navigation via Expo Router

---

### 2. Architecture & System Design
**File**: `docs/architecture/tab-bar-implementation.md`

Deep dive into the architecture including:
- Complete navigation structure and Expo Router setup
- Tab configuration type definitions
- Two rendering modes (Native vs Cross-platform)
- Theme system and styling
- Icon implementation with platform-specific fallbacks
- Settings infrastructure (3-tier architecture)
- Error badge system
- Navigation helpers
- Initialization flow
- Platform-specific considerations

**Best For**: Understanding the "why" behind the architecture and how systems interact.

---

### 3. Code Examples & Usage Patterns
**File**: `docs/investigation/tab-bar-code-examples.md`

Practical examples for:
- Adding a new tab (complete step-by-step)
- Accessing settings in components
- Updating settings with error handling
- Platform-specific icon rendering
- Using the theme system
- Navigation helpers usage
- Error badge system implementation
- Settings initialization patterns
- Common patterns and best practices

**Best For**: Getting code copy-paste ready, learning by example.

---

### 4. File Locations & Quick Navigation
**File**: `docs/investigation/tab-bar-file-locations.md`

Complete reference of:
- All relevant file paths and their purposes
- Line numbers for quick navigation
- File dependency graph
- Quick navigation map for common tasks
- Summary table of responsibilities

**Best For**: Finding files quickly, understanding file organization.

---

## Answer to Your Original Questions

### 1. Where is the tab navigator configured?

**Primary File**: `/home/user/SideShelf/src/app/(tabs)/_layout.tsx` (245 lines)

Contains the `TAB_CONFIG` array (lines 37-77) that defines all 5 tabs with their names, icons, and labels.

### 2. What tabs currently exist?

The app has **5 tabs**:
1. **Home** - Continue listening, recommendations
2. **Library** - Browse all library items
3. **Series** - Browse series collections
4. **Authors** - Browse authors
5. **More** - Settings, account, diagnostics

### 3. How are tabs defined and structured?

Tabs are:
- Defined via `TAB_CONFIG` array (TypeScript)
- Structured as `Expo Router` file-based routes in `src/app/(tabs)/`
- Each tab has platform-specific icons (SF Symbols for iOS, Ionicons for Android)
- Rendered as either Native Tabs (iOS 18+) or Cross-platform Tabs (Android/iOS <18)

### 4. Where are settings/preferences stored?

**3-Tier Architecture**:

1. **Persistent Storage**: AsyncStorage
   - File: `src/lib/appSettings.ts`
   - Keys: `@app/jumpForwardInterval`, `@app/homeLayout`, etc.

2. **In-Memory State**: Zustand Store
   - File: `src/stores/slices/settingsSlice.ts`
   - Scoped under `settings.*`
   - Includes: `jumpForwardInterval`, `homeLayout`, `diagnosticsEnabled`, etc.

3. **Hook Interface**: React Hook
   - File: `src/stores/appStore.ts` (lines 807-859)
   - Usage: `import { useSettings } from "@/stores"`
   - Provides: State values + update actions with optimistic updates

---

## Quick Start Examples

### Access Settings in a Component
```typescript
import { useSettings } from "@/stores";

function MyComponent() {
  const { homeLayout, updateHomeLayout } = useSettings();
  
  return (
    <Button 
      title="Change Layout"
      onPress={() => updateHomeLayout("cover")}
    />
  );
}
```

### Add a New Tab
1. Edit `src/app/(tabs)/_layout.tsx` - add to `TAB_CONFIG`
2. Create `src/app/(tabs)/newtab/_layout.tsx` and `index.tsx`
3. Add translation keys to `src/i18n/locales/*.ts`
4. Done - Expo Router automatically handles routing

### Check Theme/Colors
```typescript
import { useThemedStyles } from "@/lib/theme";

const { colors, tabs, isDark } = useThemedStyles();
```

---

## Key Files at a Glance

| What | Where | Lines |
|------|-------|-------|
| Tab Configuration | `src/app/(tabs)/_layout.tsx` | 37-77 |
| Settings State | `src/stores/slices/settingsSlice.ts` | All |
| Settings Storage | `src/lib/appSettings.ts` | All |
| Settings Hook | `src/stores/appStore.ts` | 807-859 |
| Theme System | `src/lib/theme.ts` | 38-54 |
| Icons | `src/app/(tabs)/_layout.tsx` | 86-121 |
| Navigation Helpers | `src/lib/navigation.ts` | All |
| i18n Labels | `src/i18n/locales/en.ts` | tabs.* |

---

## Technology Stack

- **Framework**: React Native with Expo
- **Router**: Expo Router (file-based routing)
- **State Management**: Zustand
- **Persistent Storage**: React Native AsyncStorage
- **Icons**: Ionicons (Android/iOS fallback) + SF Symbols (iOS 18+)
- **Styling**: React Native StyleSheet
- **i18n**: Custom i18n system

---

## Platform Support

- **iOS**: 
  - Native tabs: iOS 18+
  - Cross-platform tabs: iOS < 18
  - SF Symbols for native icons
  
- **Android**: 
  - Cross-platform tabs
  - Ionicons for icons

---

## Related Systems

- **Authentication**: `src/providers/AuthProvider.tsx`
- **Database**: SQLite via Drizzle ORM
- **Player**: React Native Track Player
- **Logging**: Custom logger with tag-based filtering
- **Downloads**: Download service with progress tracking

---

## Document Hierarchy

```
INDEX-TAB-BAR.md (THIS FILE)
├── tab-bar-summary.md (Quick Reference)
├── tab-bar-implementation.md (Architecture)
├── tab-bar-code-examples.md (Code Patterns)
└── tab-bar-file-locations.md (File Reference)
```

---

## Next Steps

1. **To understand the system quickly**: Read `tab-bar-summary.md`
2. **To understand the architecture**: Read `tab-bar-implementation.md`
3. **To implement features**: Refer to `tab-bar-code-examples.md`
4. **To find specific files**: Use `tab-bar-file-locations.md`

---

## Contact & Notes

- The tab bar system is well-structured with clear separation of concerns
- Settings follow an optimistic update pattern for better UX
- Platform adaptation is automatic and transparent
- The system is extensible for adding new tabs or settings
