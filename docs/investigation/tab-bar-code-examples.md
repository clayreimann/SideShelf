# Tab Bar Implementation - Code Examples

## 1. Tab Navigation Configuration

### Location
`/home/user/SideShelf/src/app/(tabs)/_layout.tsx`

### View the Current Tab Config
```typescript
// Lines 37-77 define all tabs
const TAB_CONFIG: TabConfig[] = [
  {
    name: "home",
    titleKey: "tabs.home",
    sfSymbol: { default: "house", selected: "house.fill" },
    androidIcon: { default: "home-outline", selected: "home" },
  },
  // ... 4 more tabs defined similarly
];
```

### Adding a New Tab (Complete Example)

1. **Create folder and files**:
   ```bash
   mkdir -p src/app/\(tabs\)/explore
   touch src/app/\(tabs\)/explore/_layout.tsx
   touch src/app/\(tabs\)/explore/index.tsx
   ```

2. **Update TAB_CONFIG** in `src/app/(tabs)/_layout.tsx`:
   ```typescript
   const TAB_CONFIG: TabConfig[] = [
     // ... existing tabs
     {
       name: "explore",
       titleKey: "tabs.explore",
       sfSymbol: { default: "binoculars", selected: "binoculars.fill" },
       androidIcon: { default: "search-outline", selected: "search" },
     },
   ];
   ```

3. **Create screen files**:

   `src/app/(tabs)/explore/_layout.tsx`:
   ```typescript
   import { Stack } from "expo-router";
   import { useThemedStyles } from "@/lib/theme";
   
   export default function ExploreLayout() {
     const { header } = useThemedStyles();
     
     return (
       <Stack
         screenOptions={{
           headerStyle: { backgroundColor: header.backgroundColor },
           headerTintColor: header.tintColor,
           headerTitleStyle: { color: header.titleColor },
         }}
       >
         <Stack.Screen name="index" options={{ title: "Explore" }} />
       </Stack>
     );
   }
   ```

   `src/app/(tabs)/explore/index.tsx`:
   ```typescript
   import { useThemedStyles } from "@/lib/theme";
   import { View, Text } from "react-native";
   
   export default function ExploreScreen() {
     const { styles, colors } = useThemedStyles();
     
     return (
       <View style={[styles.container, { backgroundColor: colors.background }]}>
         <Text style={styles.text}>Explore Screen</Text>
       </View>
     );
   }
   ```

4. **Add translation key** in `src/i18n/locales/en.ts`:
   ```typescript
   export const en = {
     // ... existing translations
     tabs: {
       home: "Home",
       library: "Library",
       series: "Series",
       authors: "Authors",
       explore: "Explore",  // NEW
       more: "More",
     },
   };
   ```

## 2. Accessing Settings

### Import the Hook
```typescript
import { useSettings } from "@/stores";
```

### Get Settings Values
```typescript
function MyComponent() {
  const {
    homeLayout,
    diagnosticsEnabled,
    jumpForwardInterval,
    jumpBackwardInterval,
    smartRewindEnabled,
    initialized,
    isLoading,
  } = useSettings();
  
  if (!initialized) {
    return <ActivityIndicator />;
  }
  
  return (
    <View>
      <Text>Current layout: {homeLayout}</Text>
      <Text>Jump forward: {jumpForwardInterval}s</Text>
    </View>
  );
}
```

### Update Settings
```typescript
function SettingsPanel() {
  const { updateHomeLayout, updateDiagnosticsEnabled } = useSettings();
  
  const handleLayoutChange = async () => {
    try {
      await updateHomeLayout("cover");
      console.log("Layout updated successfully");
    } catch (error) {
      console.error("Failed to update layout:", error);
      Alert.alert("Error", "Failed to save layout preference");
    }
  };
  
  const toggleDiagnostics = async () => {
    try {
      await updateDiagnosticsEnabled(true);
    } catch (error) {
      console.error("Failed to toggle diagnostics:", error);
    }
  };
  
  return (
    <View>
      <Button title="Toggle Layout" onPress={handleLayoutChange} />
      <Button title="Enable Diagnostics" onPress={toggleDiagnostics} />
    </View>
  );
}
```

### Conditional Rendering Based on Settings
```typescript
function HomeScreen() {
  const { homeLayout } = useSettings();
  
  if (homeLayout === "cover") {
    return <CoverGridLayout />;
  } else {
    return <ListLayout />;
  }
}
```

## 3. Platform-Specific Icon Implementation

### Current Implementation
`src/app/(tabs)/_layout.tsx` lines 86-121:

```typescript
const TabBarIcon = ({ config, focused, color, size }: TabBarIconProps) => {
  if (isAndroid) {
    return (
      <Ionicons
        name={focused ? config.androidIcon.selected : config.androidIcon.default}
        size={size ?? 24}
        color={color}
      />
    );
  }

  if (isIOS) {
    return (
      <SymbolView
        name={focused ? config.sfSymbol.selected : config.sfSymbol.default}
        size={size ?? 24}
        tintColor={color}
        fallback={
          <Ionicons
            name={focused ? config.androidIcon.selected : config.androidIcon.default}
            size={size ?? 24}
            color={color}
          />
        }
      />
    );
  }

  return (
    <Ionicons
      name={focused ? config.androidIcon.selected : config.androidIcon.default}
      size={size ?? 24}
      color={color}
    />
  );
};
```

## 4. Theme Styling

### Using useThemedStyles
```typescript
import { useThemedStyles } from "@/lib/theme";

function MyComponent() {
  const { colors, styles, isDark, tabs } = useThemedStyles();
  
  return (
    <View style={{ backgroundColor: colors.background }}>
      <Text style={{ color: colors.textPrimary }}>Hello</Text>
      <View 
        style={{
          borderBottomColor: tabs.borderColor,
          borderBottomWidth: 1,
        }}
      />
    </View>
  );
}
```

### Tab Bar Styling Values
```typescript
const tabs = {
  useNativeTabs: boolean;                    // Auto-detect for iOS 18+
  tabBarSpace: number;                       // Padding for tab bar (84 or 0)
  backgroundColor: string;                   // "#1C1C1E" (dark) or "#F8F8F8" (light)
  borderColor: string;                       // Top border color
  iconColor: string;                         // Inactive icon color
  selectedIconColor: string;                 // Active icon color
  labelColor: string;                        // Inactive label color
  selectedLabelColor: string;                // Active label color
  badgeBackgroundColor: string;              // "red"
  badgeTextColor: string;                    // "white"
  rippleColor: string;                       // Android ripple effect
  indicatorColor: string;                    // Bottom tab indicator
  shadowColor: string;                       // Shadow effect
  disableTransparentOnScrollEdge: boolean;   // true
};
```

## 5. Navigation Helpers

### Location
`/home/user/SideShelf/src/lib/navigation.ts`

### Navigating to Tab Details
```typescript
import { useRouter } from "expo-router";
import { navigateToAuthor, navigateToSeries, navigateToLibraryItem } from "@/lib/navigation";

function ItemCard({ itemId, authorId, seriesId }) {
  const router = useRouter();
  
  const handleAuthorPress = () => {
    navigateToAuthor(router, authorId);
  };
  
  const handleSeriesPress = () => {
    navigateToSeries(router, seriesId);
  };
  
  const handleItemPress = () => {
    navigateToLibraryItem(router, itemId);
  };
  
  return (
    <View>
      <Button title="View Author" onPress={handleAuthorPress} />
      <Button title="View Series" onPress={handleSeriesPress} />
      <Button title="View Item" onPress={handleItemPress} />
    </View>
  );
}
```

## 6. Error Badge System

### How It Works
`src/app/(tabs)/_layout.tsx` lines 127-129:

```typescript
const errorCount = useAppStore((state) => state.logger.errorCount);
const diagnosticsEnabled = useAppStore((state) => state.settings.diagnosticsEnabled);
const showErrorBadge = errorCount > 0 && diagnosticsEnabled;
```

### Applied to More Tab
```typescript
{TAB_CONFIG.map((tab) => {
  const label = translate(tab.titleKey);
  const isMoreTab = tab.name === "more";
  return (
    <Tabs.Screen
      key={tab.name}
      name={tab.name}
      options={{
        title: label,
        tabBarBadge: isMoreTab && showErrorBadge ? errorCount : undefined,
        // ...
      }}
    />
  );
})}
```

### Display Conditions
- Badge only shows on the "More" tab
- Only when `diagnosticsEnabled === true`
- Only when `errorCount > 0`
- Shows the count number

## 7. Initialization Flow

### Settings Initialization
```typescript
// In StoreProvider or App component initialization
const { initializeSettings } = useSettings();

useEffect(() => {
  initializeSettings().catch((error) => {
    console.error("Failed to initialize settings:", error);
  });
}, []);
```

### Full App Initialization
See `src/app/_layout.tsx`:
```typescript
useEffect(() => {
  const initialize = async () => {
    try {
      await initializeApp();  // Loads everything including settings
      log.info("App initialization completed successfully");
    } catch (error) {
      log.error("Failed to initialize app", error as Error);
    }
  };
  initialize();
}, []);
```

## 8. Common Patterns

### Reading Persisted Preference
```typescript
// AsyncStorage directly (low-level)
import { getHomeLayout } from "@/lib/appSettings";
const layout = await getHomeLayout(); // Returns "list" or "cover"

// Via Zustand store (recommended)
import { useSettings } from "@/stores";
const { homeLayout } = useSettings(); // Already loaded
```

### Updating and Syncing
```typescript
const { updateHomeLayout } = useSettings();

// Optimistic update - UI updates immediately
await updateHomeLayout("cover");

// Persists to AsyncStorage automatically
// Falls back to previous value if storage fails
```

### Checking Loading State
```typescript
const { initialized, isLoading } = useSettings();

if (!initialized) {
  return <LoadingScreen />;
}

if (isLoading) {
  return <ActivityIndicator />;
}

return <MainContent />;
```
