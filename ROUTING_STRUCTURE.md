# Expo Router Tab Navigation Structure

## Current Routing Configuration

Your app now has the correct routing structure to default to the home tab when launched.

### Tab Routes Mapping

| Tab Trigger Name | File Path | Route URL |
|-----------------|-----------|-----------|
| `home` | `src/app/(tabs)/home/index.tsx` | `/(tabs)/home` |
| `library` | `src/app/(tabs)/library/index.tsx` | `/(tabs)/library` |
| `series` | `src/app/(tabs)/series/index.tsx` | `/(tabs)/series` |
| `authors` | `src/app/(tabs)/authors/index.tsx` | `/(tabs)/authors` |
| `more` | `src/app/(tabs)/more/index.tsx` | `/(tabs)/more` |

### Directory Structure

```
src/app/
├── _layout.tsx              # Root layout
├── +not-found.tsx          # 404 page (themed)
├── login.tsx               # Login screen
└── (tabs)/                 # Tab group
    ├── _layout.tsx         # Tab navigation layout
    ├── home/               # Home tab
    │   ├── _layout.tsx     # Home stack layout
    │   └── index.tsx       # Home screen
    ├── library/            # Library tab
    │   ├── _layout.tsx     # Library stack layout
    │   ├── index.tsx       # Library list
    │   └── [item]/
    │       └── index.tsx   # Library item detail
    ├── authors/            # Authors tab
    │   ├── _layout.tsx     # Authors stack layout
    │   └── index.tsx       # Authors screen
    ├── series/             # Series tab
    │   ├── _layout.tsx     # Series stack layout
    │   └── index.tsx       # Series screen
    └── more/               # More tab
        ├── _layout.tsx     # More stack layout
        ├── index.tsx       # More menu
        ├── settings.tsx    # Settings screen
        ├── advanced.tsx    # Advanced settings
        └── collections.tsx # Collections screen
```

## Why This Works

1. **Tab Trigger Match**: The `<NativeTabs.Trigger name="home">` matches the `home/` directory
2. **Default Route**: Expo Router automatically uses the first tab as the default route
3. **Index Files**: Each `index.tsx` file serves as the default screen for its directory
4. **Proper Nesting**: Each tab has its own Stack layout for navigation within that tab

## Default Navigation Flow

When your app launches:
1. Root layout loads (`_layout.tsx`)
2. Tab layout loads (`(tabs)/_layout.tsx`)
3. First tab (`home`) is automatically selected
4. Home stack layout loads (`home/_layout.tsx`)
5. Home screen displays (`home/index.tsx`)

## Troubleshooting

If you still see the +not-found screen, check:

1. **Tab trigger names match directory names** in `(tabs)/_layout.tsx`
2. **Each tab directory has an `index.tsx` file**
3. **Each tab directory has a `_layout.tsx` file**
4. **No typos in directory or file names**

The routing should now work correctly and default to your home tab!
