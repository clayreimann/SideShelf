# More-Scoped Nested Navigation Design

## Goal

Make every configurable content tab work correctly when the user moves it under More. Home, Library, Series, and Authors must open inside the More stack, and every book selection must continue to the matching More-scoped detail route so Back returns through the path the user followed.

This work is limited to the More stack, its descendants, and the shared screens used by configurable tabs. Deliberate destinations outside that stack, such as login and the full-screen player, remain unchanged.

## Current Problems

SideShelf allows Home, Library, Series, and Authors to be hidden from the tab bar and shown in the More menu. The implementation currently handles only part of that configuration:

- The More menu uses a Series-or-Authors conditional. A hidden Home or Library entry therefore opens Authors.
- More-scoped Series and Authors index and item-detail routes exist, but their shared detail screens hard-code `/series/...` and `/authors/...` book routes. Selecting a book leaves the More stack instead of using the More-scoped item route.
- Home cover rows hard-code `/home/item/...`.
- Library rows and the `openItem` parameter flow hard-code `/library/...`.
- More-scoped Home and Library route wrappers do not exist.

The root cause is that shared tab screens know only their top-level route paths even when Expo Router renders them through a More-scoped wrapper.

## User Experience

When a configurable tab is visible in the tab bar, its existing navigation remains unchanged:

- Home -> book -> Back returns to Home.
- Library -> book -> Back returns to Library.
- Series -> series -> book -> Back returns to the series, then Series.
- Authors -> author -> book -> Back returns to the author, then Authors.

When the same tab is moved under More, navigation stays in the More stack:

- More -> Home -> book -> Back returns to Home, then More.
- More -> Library -> book -> Back returns to Library, then More.
- More -> Series -> series -> book -> Back returns to the series, then Series, then More.
- More -> Authors -> author -> book -> Back returns to the author, then Authors, then More.

Moving tabs between the tab bar and More does not alter their content, loading behavior, filtering, sorting, playback, or book-detail UI.

## Architecture

### Central route builders

Add a small navigation module under `src/lib/` that owns the route contract for configurable tabs. It will:

- define the supported movable tab names: `home`, `library`, `series`, and `authors`;
- provide an exhaustive mapping from each movable tab to its More index route;
- determine whether a shared screen is currently rendered in its top-level scope or under `/more` from the current pathname; and
- build the appropriate item-detail path for Home, Library, Series, and Authors.

Path construction remains pure and independently testable. Screens obtain the current pathname from Expo Router and pass it to the builder rather than embedding route strings in press handlers. A pathname is More-scoped only when it matches that tab's `/more/<tab>` subtree; unrelated paths fall back to that screen's normal top-level scope.

The builder returns Expo Router-compatible typed paths. It does not perform navigation or read application state.

### More route coverage

Extend the More stack with wrapper routes for every movable tab:

- `more/home` and `more/home/item/[itemId]`;
- `more/library` and `more/library/[item]`;
- the existing `more/series`, series detail, and series item routes; and
- the existing `more/authors`, author detail, and author item routes.

The wrappers reuse the existing top-level screen implementations and item-detail screens. They do not duplicate product logic. The More layout registers the new descendants with the same titles and minimal item-detail headers used by their top-level stacks.

### Shared screen updates

Replace hard-coded nested paths only at the affected navigation boundaries:

- Home cover and row components use the scoped Home item builder.
- Library grid/list rows use the scoped Library item builder.
- Library's `openItem` parameter flow uses the same scoped Library builder.
- Series detail book rows use the scoped Series item builder.
- Author detail book rows use the scoped Author item builder.
- The More menu uses the exhaustive movable-tab-to-More-route mapping instead of a two-branch conditional.

No shared screen receives route-prefix props. Route scope is derived once from the pathname and resolved by the central pure builder, avoiding prop plumbing through lists while keeping path policy in one module.

## Error Handling and Boundaries

- Unsupported movable-tab names are rejected by TypeScript rather than silently falling through to Authors or another default.
- Missing dynamic IDs retain the current screen behavior and do not attempt navigation.
- Existing tab and More error boundaries remain in place.
- Routes that intentionally leave the More stack, including login, reauthentication, and the full-screen player, remain explicit and unchanged.

## Testing

Implementation follows test-driven development.

Unit tests for the route builder cover:

- every movable tab's More index route;
- top-level and More-scoped Home book paths;
- top-level and More-scoped Library book paths;
- top-level and More-scoped Series book paths;
- top-level and More-scoped Author book paths; and
- a pathname from another tab not being misclassified as More-scoped.

Focused component or route tests verify that:

- hidden Home, Library, Series, and Authors menu entries open their correct More routes;
- Home and Library book presses stay under More when rendered through More wrappers;
- Series and Author book presses stay under More when rendered through More wrappers; and
- the existing top-level versions still generate their existing routes.

Verification includes the focused Jest tests, related tests for changed files, changed-file ESLint and TypeScript checks, and a route-file audit for remaining hard-coded descendant paths within the More/configurable-tab scope.

## Non-Goals

- Changing which tabs may be moved under More.
- Redesigning tab-bar settings or the More menu.
- Changing Expo Router, stack, or native-tab architecture.
- Refactoring unrelated navigation elsewhere in the app.
- Changing item-detail, player, download, or progress behavior.
