# Localization Architecture

## Overview

This React Native app uses a custom localization system built on top of the `expo-localization` library. The system provides type-safe translation keys, automatic locale detection, and simple placeholder replacement for dynamic content.

## Current Implementation

### Library Used

- **Primary**: `expo-localization` (v17.0.7) - For detecting device locale settings
- **Custom wrapper**: Home-built i18n system with TypeScript type safety

### Architecture

The localization system is located in `/src/i18n/` with the following structure:

```
src/i18n/
├── index.ts          # Main translation system and translate() function
└── locales/
    └── en.ts         # English translation dictionary (currently only language)
```

## How It Works

### 1. Translation System (`src/i18n/index.ts`)

The system provides a `translate()` function that:

- Automatically detects the device locale using `expo-localization`
- Falls back to English if the locale isn't available
- Supports parameter replacement in strings
- Is fully type-safe with TypeScript

#### Key Functions:

**`translate(key: TranslationKey, replacements?: TranslationReplacements): string`**

- Primary export function used throughout the app
- Takes a typed translation key and optional replacement values
- Returns the translated string with replacements applied

**`resolveLocale(): string`**

- Detects the device locale from system settings
- Attempts to match with available translations
- Falls back to English ("en") if no match is found

**`applyReplacements(template: string, replacements?: TranslationReplacements): string`**

- Replaces placeholders in format `{key}` with provided values
- Example: `"Hello {name}"` with `{name: "John"}` → `"Hello John"`

### 2. Translation Dictionary (`src/i18n/locales/en.ts`)

The English translation file exports a constant object with all UI strings:

```typescript
export const en = {
  "auth.signIn": "Sign in",
  "auth.connectToAudiobookshelf": "Connect to Audiobookshelf",
  "auth.serverUrlPlaceholder": "Server URL (e.g. https://abs.example.com)",
  "auth.usernamePlaceholder": "Username",
  "auth.passwordPlaceholder": "Password",
  // ... more strings
} as const;
```

Keys use dot notation for organization (e.g., `auth.signIn`, `tabs.home`).

### 3. TypeScript Type Safety

The system is designed to prevent runtime errors:

```typescript
type TranslationKey = keyof typeof en;  // Only allows valid keys
type TranslationReplacements = Record<string, string | number>;

function translate(
  key: TranslationKey,
  replacements?: TranslationReplacements
): string { ... }
```

This means:

- Invalid translation keys are caught at compile time
- IDE autocomplete works for translation keys
- Refactoring translation keys is supported by TypeScript

## Current Translations

### Supported Locales

- English (en) - ONLY locale currently supported

### Available Keys (33 total)

**Authentication**

- `auth.signIn` - Sign in
- `auth.connectToAudiobookshelf` - Connect to Audiobookshelf
- `auth.serverUrlPlaceholder` - Server URL (e.g. https://abs.example.com)
- `auth.usernamePlaceholder` - Username
- `auth.passwordPlaceholder` - Password
- `auth.loginFailed` - Login failed
- `auth.connectedToServer` - Connected to server
- `auth.searchingForServer` - Searching for server…

**Navigation Tabs**

- `tabs.home` - Home
- `tabs.library` - Library
- `tabs.series` - Series
- `tabs.authors` - Authors
- `tabs.more` - More

**Home Screen**

- `home.sections.continueListening` - Continue Listening
- `home.sections.downloaded` - Downloaded
- `home.sections.listenAgain` - Listen Again
- `home.errors.loadHomeData` - Failed to load home screen data
- `home.loading` - Loading your library...
- `home.requireLogin` - Please log in to view your library
- `home.emptyState` - Welcome to your library!\n\nYour books will appear here as you start listening to them.

**Library**

- `library.title` - Library
- `library.empty` - No libraries found.
- `library.sortOptions.title` - Title
- `library.sortOptions.authorFirstName` - Author (First Name)
- `library.sortOptions.authorLastName` - Author (Last Name)
- `library.sortOptions.publishedYear` - Published Year
- `library.sortOptions.dateAdded` - Date Added

**Common**

- `common.error` - Error
- `common.refresh` - Refresh

**Sorting**

- `sortMenu.title` - Sort by
- `sortMenu.direction.asc` - A-Z
- `sortMenu.direction.desc` - Z-A

## Usage Examples

### Basic Usage

```typescript
import { translate } from "@/i18n";

// In a component or function
const title = translate("auth.signIn"); // "Sign in"
```

### With Tab Navigation

```typescript
import { translate, type TranslationKey } from "@/i18n";

interface Tab {
  titleKey: TranslationKey;
  // ... other properties
}

const tabs: Tab[] = [
  { titleKey: 'tabs.home', ... },
  { titleKey: 'tabs.library', ... },
];

// In navigation rendering
const label = translate(tab.titleKey);
```

### In Navigation Configuration

```typescript
// src/app/login.tsx
<Stack.Screen options={{ headerTitle: translate('auth.signIn') }} />

// src/app/(tabs)/more/_layout.tsx
<Stack.Screen name="index" options={{ title: translate('tabs.more') }} />
```

### Rendering Translated Text

```typescript
// src/app/(tabs)/home/index.tsx
<Text>{translate('home.sections.continueListening')}</Text>
<Text>{translate('home.loading')}</Text>
```

### With Error Handling

```typescript
try {
  // ... some operation
} catch (e) {
  setError(e?.message || translate("auth.loginFailed"));
}
```

### In List Labels

```typescript
// src/app/(tabs)/library/index.tsx
const sortOptions = [
  { field: "title", label: translate("library.sortOptions.title") },
  { field: "authorName", label: translate("library.sortOptions.authorFirstName") },
  { field: "publishedYear", label: translate("library.sortOptions.publishedYear") },
];
```

## Locale Resolution Strategy

The `resolveLocale()` function attempts to match device locales in this order:

1. **Language tag match** - e.g., "en-US" → "en-US"
2. **Language-region match** - e.g., "en" with "US" → "en-US"
3. **Language code match** - e.g., "en-GB" → "en"
4. **Language prefix match** - e.g., "en-\*" → "en"
5. **Fallback** - If no match, uses English ("en")

## Adding a New Translation

To add a new translation string:

1. **Add to `/src/i18n/locales/en.ts`:**

```typescript
export const en = {
  // ... existing strings
  "newCategory.newKey": "New translation text",
} as const;
```

2. **Use in code:**

```typescript
import { translate } from "@/i18n";
const text = translate("newCategory.newKey");
```

TypeScript will automatically:

- Add the key to `TranslationKey` type
- Provide autocomplete
- Catch typos at compile time

## Adding a New Language

To add a new language (e.g., Spanish):

1. **Create a new locale file** `/src/i18n/locales/es.ts`:

```typescript
export const es = {
  "auth.signIn": "Iniciar sesión",
  "auth.connectToAudiobookshelf": "Conectar a Audiobookshelf",
  // ... all other translations
} as const;
```

2. **Update `/src/i18n/index.ts`:**

```typescript
import { en } from "./locales/en";
import { es } from "./locales/es";

const translations = {
  en,
  es, // Add new language
};
```

3. **Update type definitions** (TypeScript will handle this automatically):

```typescript
type LocaleCode = keyof typeof translations; // Now includes "es"
```

The `resolveLocale()` function will automatically detect and use the Spanish translation if the device locale is set to Spanish.

## Placeholder Replacement

Strings can include placeholders using `{key}` syntax:

**Dictionary:**

```typescript
"items.countItems": "You have {count} items",
```

**Usage:**

```typescript
translate("items.countItems", { count: 5 });
// Returns: "You have 5 items"
```

**How it works:**

- Pattern: `/\{(\w+)\}/g` matches any `{word}` in the string
- Replacements are applied via `String()` conversion
- Missing replacements leave the placeholder unchanged

## Current Component Usage

The translation function is actively used in:

- **`src/app/login.tsx`** - Login screen with auth-related strings
- **`src/app/(tabs)/_layout.tsx`** - Tab navigation labels
- **`src/app/(tabs)/home/index.tsx`** - Home screen sections and error messages
- **`src/app/(tabs)/library/index.tsx`** - Library sort options and empty states
- **`src/app/(tabs)/more/_layout.tsx`** - More tab navigation
- **`src/components/ui/SortMenu.tsx`** - Sort menu configuration

## Fallback Behavior

When a translation key is missing:

1. Checks the detected locale's dictionary
2. Falls back to English if not found
3. Falls back to the key itself if English doesn't have it either
   - Example: If `newKey.text` is never translated, it returns `"newKey.text"`

This prevents crashes and makes it obvious when a string is missing from translations.

## Technology Stack

| Tool              | Version | Purpose                             |
| ----------------- | ------- | ----------------------------------- |
| expo-localization | 17.0.7  | Device locale detection             |
| TypeScript        | ~5.9.2  | Type safety and compile-time checks |
| React Native      | 0.81.5  | UI framework                        |
| Expo              | 54.0.21 | Runtime platform                    |

## Notes

- The system currently supports **English only**
- No translation management system (like Crowdin) is integrated yet
- All strings are defined in TypeScript (not separate JSON/CSV files)
- The system is lightweight and has no external dependencies beyond `expo-localization`
- Parameter replacements are synchronous and simple (no complex pluralization or formatting)
