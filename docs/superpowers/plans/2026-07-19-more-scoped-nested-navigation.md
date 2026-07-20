# More-Scoped Nested Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Home, Library, Series, Authors, and their book-detail descendants inside the More stack whenever those configurable tabs are moved under More.

**Architecture:** Add one pure `tabNavigation` module that exhaustively maps movable tabs to More routes and builds top-level or More-scoped item paths from the current pathname. Add missing More wrappers for Home and Library, then replace hard-coded descendant paths in shared screens with the tested builders while leaving deliberate cross-stack destinations unchanged.

**Tech Stack:** TypeScript 5.9, React Native 0.81, Expo Router 6, React 19, Jest 29, React Native Testing Library 13.

## Global Constraints

- Scope is limited to the More stack, its descendants, and shared screens used by configurable tabs.
- Supported movable tabs are exactly `home`, `library`, `series`, and `authors`.
- Top-level tab navigation behavior must remain unchanged.
- More-scoped navigation must preserve stack history through every nested book-detail route.
- Login, reauthentication, and full-screen-player destinations remain unchanged.
- Do not duplicate screen product logic in More route files; wrappers re-export existing screens.
- Follow TDD: add each regression test and observe the expected failure before changing production code.
- Use `@/` imports and Expo Router's existing native `Stack` architecture.
- Do not modify or stage the user's existing `CLAUDE.md` change.

---

## File Structure

### New files

- `src/lib/tabNavigation.ts` — pure movable-tab route contract and scoped item-path builders.
- `src/lib/__tests__/tabNavigation.test.ts` — exhaustive unit coverage for top-level and More-scoped route generation.
- `src/components/home/__tests__/CoverItem.navigation.test.tsx` — verifies a Home cover pushes the route generated for its current scope.
- `src/app/(tabs)/more/__tests__/routeCoverage.test.ts` — verifies every movable tab has the required More index/detail route files and layout registration.
- `src/app/(tabs)/more/home.tsx` — re-exports the shared Home screen.
- `src/app/(tabs)/more/home/item/[itemId].tsx` — re-exports the shared Home item-detail screen.
- `src/app/(tabs)/more/library.tsx` — re-exports the shared Library screen.
- `src/app/(tabs)/more/library/[item]/index.tsx` — re-exports the shared Library item-detail screen.

### Modified files

- `src/app/(tabs)/more/_layout.tsx` — registers Home and Library More descendants.
- `src/app/(tabs)/more/index.tsx` — routes every hidden movable tab through the exhaustive More mapping.
- `src/components/home/CoverItem.tsx` — uses the scoped Home item builder.
- `src/components/home/Item.tsx` — uses the scoped Home item builder for the alternate row presentation.
- `src/components/library/LibraryItem.tsx` — uses the scoped Library item builder in grid and list links.
- `src/components/library/__tests__/LibraryItem.a11y.test.tsx` — adds top-level and More-scoped href assertions without weakening accessibility coverage.
- `src/app/(tabs)/library/index.tsx` — uses the scoped Library item builder for `openItem` navigation.
- `src/app/(tabs)/series/[seriesId]/index.tsx` — uses the scoped Series item builder.
- `src/app/(tabs)/authors/[authorId]/index.tsx` — uses the scoped Author item builder.

---

### Task 1: Define and test the scoped route contract

**Files:**

- Create: `src/lib/tabNavigation.ts`
- Create: `src/lib/__tests__/tabNavigation.test.ts`

**Interfaces:**

- Produces: `MovableTabName`, `getMoreTabIndexRoute(tab)`, `getHomeItemRoute(pathname, itemId)`, `getLibraryItemRoute(pathname, itemId)`, `getSeriesItemRoute(pathname, seriesId, itemId)`, and `getAuthorItemRoute(pathname, authorId, itemId)`.
- Consumes: Expo Router's `Href` type only; the module performs no navigation and reads no React state.

- [ ] **Step 1: Write the failing route-contract tests**

Create `src/lib/__tests__/tabNavigation.test.ts`:

```ts
import {
  getAuthorItemRoute,
  getHomeItemRoute,
  getLibraryItemRoute,
  getMoreTabIndexRoute,
  getSeriesItemRoute,
} from "@/lib/tabNavigation";

describe("tabNavigation", () => {
  it.each([
    ["home", "/more/home"],
    ["library", "/more/library"],
    ["series", "/more/series"],
    ["authors", "/more/authors"],
  ] as const)("maps %s to its More index", (tab, expected) => {
    expect(getMoreTabIndexRoute(tab)).toBe(expected);
  });

  it.each([
    [getHomeItemRoute, "/home", "/home/item/book-1", "/more/home/item/book-1"],
    [getLibraryItemRoute, "/library", "/library/book-1", "/more/library/book-1"],
  ] as const)(
    "builds top-level and More-scoped item routes",
    (builder, topPath, topExpected, moreExpected) => {
      expect(builder(topPath, "book-1")).toBe(topExpected);
      expect(builder(`/more${topPath}`, "book-1")).toBe(moreExpected);
    }
  );

  it("builds top-level and More-scoped Series item routes", () => {
    expect(getSeriesItemRoute("/series/series-1", "series-1", "book-1")).toBe(
      "/series/series-1/item/book-1"
    );
    expect(getSeriesItemRoute("/more/series/series-1", "series-1", "book-1")).toBe(
      "/more/series/series-1/item/book-1"
    );
  });

  it("builds top-level and More-scoped Author item routes", () => {
    expect(getAuthorItemRoute("/authors/author-1", "author-1", "book-1")).toBe(
      "/authors/author-1/item/book-1"
    );
    expect(getAuthorItemRoute("/more/authors/author-1", "author-1", "book-1")).toBe(
      "/more/authors/author-1/item/book-1"
    );
  });

  it("does not treat another More subtree as the current tab's More scope", () => {
    expect(getSeriesItemRoute("/more/authors/author-1", "series-1", "book-1")).toBe(
      "/series/series-1/item/book-1"
    );
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx jest src/lib/__tests__/tabNavigation.test.ts --runInBand
```

Expected: FAIL because `@/lib/tabNavigation` does not exist.

- [ ] **Step 3: Implement the minimal pure route module**

Create `src/lib/tabNavigation.ts`:

```ts
import type { Href } from "expo-router";

export type MovableTabName = "home" | "library" | "series" | "authors";

const MORE_TAB_INDEX_ROUTES = {
  home: "/more/home",
  library: "/more/library",
  series: "/more/series",
  authors: "/more/authors",
} as const satisfies Record<MovableTabName, Href>;

function isMoreScoped(pathname: string, tab: MovableTabName): boolean {
  const base = `/more/${tab}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function getMoreTabIndexRoute(tab: MovableTabName): Href {
  return MORE_TAB_INDEX_ROUTES[tab];
}

export function getHomeItemRoute(pathname: string, itemId: string): Href {
  return isMoreScoped(pathname, "home") ? `/more/home/item/${itemId}` : `/home/item/${itemId}`;
}

export function getLibraryItemRoute(pathname: string, itemId: string): Href {
  return isMoreScoped(pathname, "library") ? `/more/library/${itemId}` : `/library/${itemId}`;
}

export function getSeriesItemRoute(pathname: string, seriesId: string, itemId: string): Href {
  return isMoreScoped(pathname, "series")
    ? `/more/series/${seriesId}/item/${itemId}`
    : `/series/${seriesId}/item/${itemId}`;
}

export function getAuthorItemRoute(pathname: string, authorId: string, itemId: string): Href {
  return isMoreScoped(pathname, "authors")
    ? `/more/authors/${authorId}/item/${itemId}`
    : `/authors/${authorId}/item/${itemId}`;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx jest src/lib/__tests__/tabNavigation.test.ts --runInBand
```

Expected: PASS with all route variants covered.

- [ ] **Step 5: Commit the route contract**

```bash
git add src/lib/tabNavigation.ts src/lib/__tests__/tabNavigation.test.ts
git commit -m "feat: add scoped tab route builders"
```

---

### Task 2: Complete More route coverage and hidden-tab dispatch

**Files:**

- Create: `src/app/(tabs)/more/__tests__/routeCoverage.test.ts`
- Create: `src/app/(tabs)/more/home.tsx`
- Create: `src/app/(tabs)/more/home/item/[itemId].tsx`
- Create: `src/app/(tabs)/more/library.tsx`
- Create: `src/app/(tabs)/more/library/[item]/index.tsx`
- Modify: `src/app/(tabs)/more/_layout.tsx`
- Modify: `src/app/(tabs)/more/index.tsx`

**Interfaces:**

- Consumes: `MovableTabName` and `getMoreTabIndexRoute(tab)` from Task 1.
- Produces: registered More routes for every movable tab and its item-detail descendants.

- [ ] **Step 1: Write the failing route-file coverage test**

Create `src/app/(tabs)/more/__tests__/routeCoverage.test.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";

const repoPath = (...segments: string[]) => path.join(process.cwd(), ...segments);

describe("More movable-tab route coverage", () => {
  it.each([
    "src/app/(tabs)/more/home.tsx",
    "src/app/(tabs)/more/home/item/[itemId].tsx",
    "src/app/(tabs)/more/library.tsx",
    "src/app/(tabs)/more/library/[item]/index.tsx",
    "src/app/(tabs)/more/series.tsx",
    "src/app/(tabs)/more/series/[seriesId]/item/[itemId].tsx",
    "src/app/(tabs)/more/authors.tsx",
    "src/app/(tabs)/more/authors/[authorId]/item/[itemId].tsx",
  ])("provides %s", (routeFile) => {
    expect(fs.existsSync(repoPath(routeFile))).toBe(true);
  });

  it.each([
    'name="home"',
    'name="home/item/[itemId]"',
    'name="library"',
    'name="library/[item]/index"',
  ])("registers %s in the More stack", (screenName) => {
    const layout = fs.readFileSync(repoPath("src/app/(tabs)/more/_layout.tsx"), "utf8");
    expect(layout).toContain(screenName);
  });
});
```

- [ ] **Step 2: Run the route-file test and verify RED**

Run:

```bash
npx jest 'src/app/(tabs)/more/__tests__/routeCoverage.test.ts' --runInBand
```

Expected: FAIL for the missing More Home/Library route files and layout entries.

- [ ] **Step 3: Add the missing More wrapper routes**

Create the four route modules exactly as follows:

```ts
// src/app/(tabs)/more/home.tsx
export { default } from "@/app/(tabs)/home/index";

// src/app/(tabs)/more/home/item/[itemId].tsx
export { default } from "@/app/(tabs)/home/item/[itemId]";

// src/app/(tabs)/more/library.tsx
export { default } from "@/app/(tabs)/library/index";

// src/app/(tabs)/more/library/[item]/index.tsx
export { default } from "@/app/(tabs)/library/[item]/index";
```

Add these screens to the existing `<Stack>` in `src/app/(tabs)/more/_layout.tsx`:

```tsx
<Stack.Screen name="home" options={{ title: translate("tabs.home") }} />
<Stack.Screen
  name="home/item/[itemId]"
  options={{ headerTitle: "", headerBackButtonDisplayMode: "minimal" }}
/>
<Stack.Screen name="library" options={{ title: translate("tabs.library") }} />
<Stack.Screen
  name="library/[item]/index"
  options={{ headerTitle: "", headerBackButtonDisplayMode: "minimal" }}
/>
```

- [ ] **Step 4: Replace the More menu fallback with exhaustive dispatch**

In `src/app/(tabs)/more/index.tsx`, import `getMoreTabIndexRoute` and `MovableTabName`, then declare the menu config with an exact movable-tab name type:

```ts
type MoreTabMenuConfig = {
  name: MovableTabName;
  titleKey: TranslationKey;
  icon?: { sf: SFSymbol; ionicon: IoniconsName };
};

const ALL_TABS: MoreTabMenuConfig[] = [
  { name: "home", titleKey: "tabs.home" },
  { name: "library", titleKey: "tabs.library" },
  {
    name: "series",
    titleKey: "tabs.series",
    icon: { sf: "square.stack", ionicon: "layers-outline" },
  },
  {
    name: "authors",
    titleKey: "tabs.authors",
    icon: { sf: "person.circle", ionicon: "people-circle-outline" },
  },
];
```

Replace the current ternary with:

```ts
onPress: () => router.push(getMoreTabIndexRoute(tab.name)),
```

The tab configuration type must make `tab.name` a `MovableTabName`; do not use a type cast at the call site or retain a default branch.

- [ ] **Step 5: Run the route and route-contract tests and verify GREEN**

Run:

```bash
npx jest src/lib/__tests__/tabNavigation.test.ts 'src/app/(tabs)/more/__tests__/routeCoverage.test.ts' --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit complete More route coverage**

```bash
git add 'src/app/(tabs)/more' src/lib/tabNavigation.ts
git commit -m "fix: route every movable tab through More"
```

---

### Task 3: Scope Home and Library book navigation

**Files:**

- Create: `src/components/home/__tests__/CoverItem.navigation.test.tsx`
- Modify: `src/components/home/CoverItem.tsx`
- Modify: `src/components/home/Item.tsx`
- Modify: `src/components/library/LibraryItem.tsx`
- Modify: `src/components/library/__tests__/LibraryItem.a11y.test.tsx`
- Modify: `src/app/(tabs)/library/index.tsx`

**Interfaces:**

- Consumes: `getHomeItemRoute(pathname, itemId)` and `getLibraryItemRoute(pathname, itemId)` from Task 1, plus Expo Router's `usePathname()`.
- Produces: correct Home and Library book destinations in both top-level and More scopes.

- [ ] **Step 1: Write failing Home navigation tests**

Create `src/components/home/__tests__/CoverItem.navigation.test.tsx`:

```tsx
import CoverItem from "@/components/home/CoverItem";
import type { HomeScreenItem } from "@/db/helpers/homeScreen";
import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockPathname = "/home";

jest.mock("expo-router", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/theme", () => ({
  useThemedStyles: () => ({
    styles: { text: {} },
    colors: { coverBackground: "#eee" },
  }),
}));

jest.mock("@/components/ui/CoverImage", () => () => null);

const homeItem: HomeScreenItem = {
  id: "book-1",
  title: "The Hobbit",
  authorName: "J.R.R. Tolkien",
  progress: 0,
};

describe("CoverItem navigation", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockPathname = "/home";
  });

  it.each([
    ["/home", "/home/item/book-1"],
    ["/more/home", "/more/home/item/book-1"],
  ])("pushes the book route for %s", (pathname, expected) => {
    mockPathname = pathname;
    const { getByRole } = render(<CoverItem item={homeItem} />);

    fireEvent.press(getByRole("button"));

    expect(mockPush).toHaveBeenCalledWith(expected);
  });
});
```

- [ ] **Step 2: Add failing Library link-scope assertions**

Replace the existing `expo-router` mock in `src/components/library/__tests__/LibraryItem.a11y.test.tsx` with:

```tsx
let mockHref: string | undefined;
let mockPathname = "/library";

jest.mock("expo-router", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => {
    mockHref = href;
    return children;
  },
  usePathname: () => mockPathname,
}));
```

Add `mockHref = undefined` and `mockPathname = "/library"` to the existing `beforeEach`, then add:

```tsx
it.each([
  ["/library", "/library/item-1"],
  ["/more/library", "/more/library/item-1"],
])("GridItem links to the item route for %s", (pathname, expected) => {
  mockPathname = pathname;
  render(<GridItem item={baseItem} />);
  expect(mockHref).toBe(expected);
});
```

- [ ] **Step 3: Run both focused tests and verify RED**

Run:

```bash
npx jest src/components/home/__tests__/CoverItem.navigation.test.tsx src/components/library/__tests__/LibraryItem.a11y.test.tsx --runInBand
```

Expected: the More-scoped cases FAIL because both components still generate top-level paths.

- [ ] **Step 4: Wire Home components to the tested builder**

In both `src/components/home/CoverItem.tsx` and `src/components/home/Item.tsx`, import `usePathname`, read it once in the component, import `getHomeItemRoute`, and replace the hard-coded press handler with:

```tsx
onPress={() => router.push(getHomeItemRoute(pathname, item.id))}
```

- [ ] **Step 5: Wire Library links and parameter navigation to the tested builder**

In both `GridItem` and `ListItem` in `src/components/library/LibraryItem.tsx`, read `pathname` with `usePathname()` and set the link to:

```tsx
<Link href={getLibraryItemRoute(pathname, item.id)} asChild>
```

In `src/app/(tabs)/library/index.tsx`, read `pathname` once and replace the `openItem` push with:

```ts
router.push(getLibraryItemRoute(pathname, itemId));
```

Add `pathname` to the effect dependency array.

- [ ] **Step 6: Run both focused tests and verify GREEN**

Run:

```bash
npx jest src/components/home/__tests__/CoverItem.navigation.test.tsx src/components/library/__tests__/LibraryItem.a11y.test.tsx --runInBand
```

Expected: PASS for top-level and More-scoped cases, with the existing accessibility assertions still green.

- [ ] **Step 7: Commit Home and Library scoping**

```bash
git add src/components/home/CoverItem.tsx src/components/home/Item.tsx src/components/home/__tests__/CoverItem.navigation.test.tsx src/components/library/LibraryItem.tsx src/components/library/__tests__/LibraryItem.a11y.test.tsx 'src/app/(tabs)/library/index.tsx'
git commit -m "fix: keep Home and Library books in route scope"
```

---

### Task 4: Scope Series and Author book navigation and verify the feature

**Files:**

- Modify: `src/app/(tabs)/series/[seriesId]/index.tsx`
- Modify: `src/app/(tabs)/authors/[authorId]/index.tsx`
- Verify: all files changed by Tasks 1-4

**Interfaces:**

- Consumes: `getSeriesItemRoute(pathname, seriesId, itemId)` and `getAuthorItemRoute(pathname, authorId, itemId)` from Task 1, plus Expo Router's `usePathname()`.
- Produces: correct Series and Author book destinations in both top-level and More scopes.

- [ ] **Step 1: Re-run the Series/Author route tests as the RED guard**

Add expectations to `src/lib/__tests__/tabNavigation.test.ts` that verify the two data-heavy screens are wired to the tested builders without mocking their stores, database helpers, and focus lifecycle:

```ts
import * as fs from "node:fs";
import * as path from "node:path";

it.each([
  ["src/app/(tabs)/series/[seriesId]/index.tsx", "getSeriesItemRoute"],
  ["src/app/(tabs)/authors/[authorId]/index.tsx", "getAuthorItemRoute"],
])("wires %s through %s", (file, builderName) => {
  const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  expect(source).toContain(builderName);
});
```

This wiring test is retained because the behavioral route generation is already covered by pure unit tests, while rendering either data-heavy screen would require mocking most of its business dependencies.

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
npx jest src/lib/__tests__/tabNavigation.test.ts --runInBand
```

Expected: FAIL because neither shared screen imports its scoped builder yet.

- [ ] **Step 3: Wire Series book presses to scoped routing**

In `src/app/(tabs)/series/[seriesId]/index.tsx`, import `usePathname`, read `pathname` beside `useRouter()`, import `getSeriesItemRoute`, and replace the press handler with:

```tsx
onPress={() =>
  seriesId && router.push(getSeriesItemRoute(pathname, seriesId, item.libraryItemId))
}
```

Add `pathname` to the `renderBook` callback dependency list.

- [ ] **Step 4: Wire Author book presses to scoped routing**

In `src/app/(tabs)/authors/[authorId]/index.tsx`, import `usePathname`, read `pathname` beside `useRouter()`, import `getAuthorItemRoute`, and replace the press handler with:

```tsx
onPress={() => authorId && router.push(getAuthorItemRoute(pathname, authorId, item.id))}
```

Add `pathname` to the `renderBook` callback dependency list.

- [ ] **Step 5: Run focused navigation tests and verify GREEN**

Run:

```bash
npx jest src/lib/__tests__/tabNavigation.test.ts 'src/app/(tabs)/more/__tests__/routeCoverage.test.ts' src/components/home/__tests__/CoverItem.navigation.test.tsx src/components/library/__tests__/LibraryItem.a11y.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 6: Audit the scoped navigation boundary**

Run:

```bash
rg -n 'router\.push\(`/((home|library|series|authors))|pathname: "/\(tabs\)/(home|library|series|authors)' 'src/app/(tabs)/more' 'src/app/(tabs)/home' 'src/app/(tabs)/library' 'src/app/(tabs)/series' 'src/app/(tabs)/authors' src/components/home src/components/library
```

Expected: no hard-coded configurable-tab descendant pushes remain in shared consumers. Explicit top-level list-to-group paths such as Series -> series and Authors -> author may remain because the More list screens already have dedicated More-scoped implementations.

- [ ] **Step 7: Run lint, formatting, and TypeScript diagnostics**

Run scoped ESLint:

```bash
npx eslint src/lib/tabNavigation.ts src/lib/__tests__/tabNavigation.test.ts 'src/app/(tabs)/more/**/*.{ts,tsx}' src/components/home/CoverItem.tsx src/components/home/Item.tsx src/components/home/__tests__/CoverItem.navigation.test.tsx src/components/library/LibraryItem.tsx src/components/library/__tests__/LibraryItem.a11y.test.tsx 'src/app/(tabs)/library/index.tsx' 'src/app/(tabs)/series/[seriesId]/index.tsx' 'src/app/(tabs)/authors/[authorId]/index.tsx'
```

Expected: exit 0.

Run the repository type checker and filter diagnostics to changed feature paths because this checkout has unrelated baseline TypeScript errors:

```bash
npx tsc --noEmit --pretty false 2>&1 | rg 'src/(lib/tabNavigation|app/\(tabs\)/(more|library|series|authors)|components/(home|library))'
```

Expected: no output for changed feature files.

Run formatting validation:

```bash
npx prettier --check src/lib/tabNavigation.ts src/lib/__tests__/tabNavigation.test.ts 'src/app/(tabs)/more/**/*.ts' 'src/app/(tabs)/more/**/*.tsx' src/components/home/CoverItem.tsx src/components/home/Item.tsx src/components/home/__tests__/CoverItem.navigation.test.tsx src/components/library/LibraryItem.tsx src/components/library/__tests__/LibraryItem.a11y.test.tsx 'src/app/(tabs)/library/index.tsx' 'src/app/(tabs)/series/[seriesId]/index.tsx' 'src/app/(tabs)/authors/[authorId]/index.tsx'
```

Expected: exit 0.

- [ ] **Step 8: Run the full test suite and diff checks**

Run:

```bash
npm test -- --runInBand
git diff --check
git status --short
```

Expected: all Jest suites pass; `git diff --check` reports no errors; status contains only the intended navigation changes plus the user's pre-existing `CLAUDE.md` modification.

- [ ] **Step 9: Commit the final scoped-navigation wiring**

```bash
git add 'src/app/(tabs)/series/[seriesId]/index.tsx' 'src/app/(tabs)/authors/[authorId]/index.tsx' src/lib/__tests__/tabNavigation.test.ts
git commit -m "fix: preserve nested Series and Author navigation"
```

Do not push or open a pull request unless the user explicitly requests publication.
