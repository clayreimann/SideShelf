# Expired-Token Home Shelves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render locally downloaded media on Home during `reauthRequired` while replacing Continue Listening and Listen Again with shelf-level sign-in messages.

**Architecture:** Keep the Home slice and SQLite queries unchanged. Make `HomeScreen` build a discriminated union of cover shelves and message shelves from `authStatus`, render local downloads through the existing `CoverItem`, and omit pull-to-refresh until authentication returns.

**Tech Stack:** React Native 0.81, Expo Router 6, Zustand, React Native Testing Library, Jest, SideShelf i18n dictionaries.

## Global Constraints

- The top `AppStatusIndicators` row remains the only reauthentication action.
- Continue Listening and Listen Again show exactly `Sign in again to refresh this section.` during `reauthRequired`.
- Downloaded continues using locally queried Home-store data during `reauthRequired`.
- Empty downloaded state is shelf-local and translated.
- Pull-to-refresh is unavailable during `reauthRequired`.
- `authenticated` and `signedOut` behaviors remain distinct and unchanged outside these shelf rules.
- Do not modify the Home slice or database helpers.
- Preserve unrelated dirty-worktree changes and commit only this task's files.

---

### Task 1: Add stale-session Home shelf presentation

**Files:**

- Modify: `src/app/(tabs)/home/index.tsx`
- Modify: `src/app/(tabs)/home/__tests__/home.test.tsx`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/es.ts`
- Create: `docs/superpowers/plans/2026-07-18-expired-token-home-shelves.md`

**Interfaces:**

- Consumes: `useAuth().authStatus`, `useAuth().isAuthenticated`, and existing `useHome()` arrays.
- Produces: Home sections with `kind: "covers" | "message"`; translated keys `home.reauthRequired` and `home.noDownloads`.

- [ ] **Step 1: Extend the Home-screen test mocks and write failing stale-session tests**

Replace the fixed auth mock with mutable state:

```tsx
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { AuthStatus } from "@/types/auth";

let mockAuthState: {
  username: string | null;
  isAuthenticated: boolean;
  authStatus: AuthStatus;
} = {
  username: "alice",
  isAuthenticated: true,
  authStatus: "authenticated",
};

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockAuthState,
}));
```

Replace the null CoverItem mock with a visible test component:

```tsx
jest.mock("@/components/home/CoverItem", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return ({ item }: { item: { id: string } }) => (
    <Text testID={`home-cover-${item.id}`}>{item.id}</Text>
  );
});
```

Add a `beforeEach` that restores authenticated defaults and clears the performance spy:

```tsx
beforeEach(() => {
  mockAuthState = {
    username: "alice",
    isAuthenticated: true,
    authStatus: "authenticated",
  };
  mockHomeState = {
    continueListening: [],
    downloaded: [],
    listenAgain: [],
    isLoadingHome: false,
    initialized: true,
    refreshHome: jest.fn(),
  };
  jest.mocked(performance.mark).mockClear();
});
```

Then add these tests:

```tsx
it("shows local downloads and stale messages while reauthentication is required", () => {
  mockAuthState = {
    username: "alice",
    isAuthenticated: false,
    authStatus: "reauthRequired",
  };
  mockHomeState = {
    continueListening: [{ id: "continue-1" }],
    downloaded: [{ id: "downloaded-1" }],
    listenAgain: [{ id: "again-1" }],
    isLoadingHome: false,
    initialized: true,
    refreshHome: jest.fn(),
  };

  const { getAllByText, getByTestId, queryByTestId } = render(<HomeScreen />);

  expect(getAllByText("home.reauthRequired")).toHaveLength(2);
  expect(getByTestId("home-cover-downloaded-1")).toBeTruthy();
  expect(queryByTestId("home-cover-continue-1")).toBeNull();
  expect(queryByTestId("home-cover-again-1")).toBeNull();
  expect(queryByTestId("home-refresh-control")).toBeNull();
});

it("shows a shelf-local empty state when reauthentication is required without downloads", () => {
  mockAuthState = {
    username: "alice",
    isAuthenticated: false,
    authStatus: "reauthRequired",
  };
  mockHomeState = {
    continueListening: [],
    downloaded: [],
    listenAgain: [],
    isLoadingHome: false,
    initialized: true,
    refreshHome: jest.fn(),
  };

  const { getByText } = render(<HomeScreen />);

  expect(getByText("home.noDownloads")).toBeTruthy();
});

it("retains the blocking login message after explicit sign-out", () => {
  mockAuthState = {
    username: null,
    isAuthenticated: false,
    authStatus: "signedOut",
  };
  mockHomeState = {
    continueListening: [],
    downloaded: [{ id: "old-download" }],
    listenAgain: [],
    isLoadingHome: false,
    initialized: true,
    refreshHome: jest.fn(),
  };

  const { getByText, queryByTestId } = render(<HomeScreen />);

  expect(getByText("home.requireLogin")).toBeTruthy();
  expect(queryByTestId("home-cover-old-download")).toBeNull();
});

it("preserves all shelves and pull-to-refresh while authenticated", () => {
  mockHomeState = {
    continueListening: [{ id: "continue-1" }],
    downloaded: [{ id: "downloaded-1" }],
    listenAgain: [{ id: "again-1" }],
    isLoadingHome: false,
    initialized: true,
    refreshHome: jest.fn(),
  };

  const { getByTestId } = render(<HomeScreen />);

  expect(getByTestId("home-cover-continue-1")).toBeTruthy();
  expect(getByTestId("home-cover-downloaded-1")).toBeTruthy();
  expect(getByTestId("home-cover-again-1")).toBeTruthy();
  expect(getByTestId("home-refresh-control")).toBeTruthy();
});
```

- [ ] **Step 2: Run the Home test and verify RED**

Run:

```bash
npm test -- --runInBand --silent 'src/app/(tabs)/home/__tests__/home.test.tsx'
```

Expected: the new stale-session tests fail because `authStatus` is not yet used, downloaded content is still hidden by the blanket login return, and the new translation keys/rendering do not exist.

- [ ] **Step 3: Add translated Home shelf copy**

Add to `src/i18n/locales/en.ts` in the Home section:

```ts
"home.reauthRequired": "Sign in again to refresh this section.",
"home.noDownloads": "No downloaded media is available on this device.",
```

Add to `src/i18n/locales/es.ts` in the Home section:

```ts
"home.reauthRequired": "Inicia sesión de nuevo para actualizar esta sección.",
"home.noDownloads": "No hay contenido descargado disponible en este dispositivo.",
```

- [ ] **Step 4: Implement cover and message shelf construction in HomeScreen**

Replace the Home section interface with a discriminated union:

```tsx
type HomeSectionKey = "continueListening" | "downloaded" | "listenAgain";

type HomeSection =
  | {
      key: HomeSectionKey;
      kind: "covers";
      title: string;
      data: HomeScreenItem[];
      showProgress?: boolean;
    }
  | {
      key: HomeSectionKey;
      kind: "message";
      title: string;
      message: string;
    };
```

Read `authStatus` from `useAuth()` and replace the `sections` memo with:

```tsx
const sections = useMemo<HomeSection[]>(() => {
  if (authStatus === "reauthRequired") {
    if (!initialized) return [];

    const staleMessage = translate("home.reauthRequired");
    return [
      {
        key: "continueListening",
        kind: "message",
        title: translate("home.sections.continueListening"),
        message: staleMessage,
      },
      downloaded.length > 0
        ? {
            key: "downloaded",
            kind: "covers",
            title: translate("home.sections.downloaded"),
            data: downloaded.slice(0, MAX_COVER_ITEMS),
            showProgress: false,
          }
        : {
            key: "downloaded",
            kind: "message",
            title: translate("home.sections.downloaded"),
            message: translate("home.noDownloads"),
          },
      {
        key: "listenAgain",
        kind: "message",
        title: translate("home.sections.listenAgain"),
        message: staleMessage,
      },
    ];
  }

  const nextSections: HomeSection[] = [];

  if (continueListening.length > 0) {
    nextSections.push({
      key: "continueListening",
      kind: "covers",
      title: translate("home.sections.continueListening"),
      data: continueListening.slice(0, MAX_COVER_ITEMS),
      showProgress: true,
    });
  }

  if (downloaded.length > 0) {
    nextSections.push({
      key: "downloaded",
      kind: "covers",
      title: translate("home.sections.downloaded"),
      data: downloaded.slice(0, MAX_COVER_ITEMS),
      showProgress: false,
    });
  }

  if (listenAgain.length > 0) {
    nextSections.push({
      key: "listenAgain",
      kind: "covers",
      title: translate("home.sections.listenAgain"),
      data: listenAgain.slice(0, MAX_COVER_ITEMS),
      showProgress: false,
    });
  }

  return nextSections;
}, [authStatus, continueListening, downloaded, initialized, listenAgain]);
```

- [ ] **Step 5: Render message shelves and remove refresh control during reauthentication**

At the start of `renderCoverSection`, render message shelves without a button:

```tsx
if (section.kind === "message") {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
      <Text style={[styles.text, { color: colors.textSecondary, fontSize: 15 }]}>
        {section.message}
      </Text>
    </View>
  );
}
```

Use `section.key` instead of the translated title as the mapped section key. Attach refresh control only while authenticated, and give it a test ID:

```tsx
refreshControl={
  isAuthenticated ? (
    <RefreshControl
      testID="home-refresh-control"
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      tintColor={colors.link}
    />
  ) : undefined
}
```

Keep the existing `if (!isAuthenticated)` blocking return only for `authStatus === "signedOut"`; allow `reauthRequired` to reach shelf rendering.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
npm test -- --runInBand --silent 'src/app/(tabs)/home/__tests__/home.test.tsx'
```

Expected: all Home tests pass, including stale-session downloads, empty downloads, authenticated TTI behavior, and explicit sign-out.

- [ ] **Step 7: Run scoped static and regression checks**

Run:

```bash
npx eslint 'src/app/(tabs)/home/index.tsx' 'src/app/(tabs)/home/__tests__/home.test.tsx' src/i18n/locales/en.ts src/i18n/locales/es.ts
npx prettier --check 'src/app/(tabs)/home/index.tsx' 'src/app/(tabs)/home/__tests__/home.test.tsx' src/i18n/locales/en.ts src/i18n/locales/es.ts docs/superpowers/plans/2026-07-18-expired-token-home-shelves.md
npm test -- --runInBand --silent
git diff --check -- 'src/app/(tabs)/home/index.tsx' 'src/app/(tabs)/home/__tests__/home.test.tsx' src/i18n/locales/en.ts src/i18n/locales/es.ts docs/superpowers/plans/2026-07-18-expired-token-home-shelves.md
```

Expected: ESLint has zero errors in changed files; Prettier passes; all Jest suites pass; diff check has no whitespace errors.

- [ ] **Step 8: Commit the scoped implementation**

```bash
git add 'src/app/(tabs)/home/index.tsx' 'src/app/(tabs)/home/__tests__/home.test.tsx' src/i18n/locales/en.ts src/i18n/locales/es.ts docs/superpowers/plans/2026-07-18-expired-token-home-shelves.md
git commit -m "fix: preserve downloaded Home shelf after token expiry"
```

Expected: one commit containing only the Home UI, Home tests, translations, and this plan. Existing unrelated worktree changes remain unstaged.
