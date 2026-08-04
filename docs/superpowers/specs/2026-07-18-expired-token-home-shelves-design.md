# Expired-Token Home Shelves Design

## Goal

Keep downloaded media discoverable from the Home screen while the local user is in `reauthRequired`, without presenting personalized progress shelves as current until the user signs in again.

## Behavior by authentication state

### Authenticated

The Home screen remains unchanged. Continue Listening, Downloaded, and Listen Again render from the Home store, and pull-to-refresh can synchronize progress and refresh the shelves when the server is reachable.

### Reauthentication required

The Home screen renders the normal shelf structure in this order:

1. Continue Listening
2. Downloaded
3. Listen Again

Continue Listening and Listen Again display a non-interactive, translated status message: “Sign in again to refresh this section.” The existing shared status area above the tabs remains the single sign-in action, avoiding duplicate login buttons within the shelves.

Downloaded renders locally queried downloaded items exactly as it does while authenticated. If no downloaded items are available, the shelf displays a translated local empty-state message instead of replacing the whole screen with a login prompt.

Pull-to-refresh is unavailable in this state because it requires authenticated server access. The screen waits for the Home store’s local initialization before replacing its loading skeleton with the three shelf states.

### Signed out

Explicitly signed-out users continue seeing the existing blocking Home login message. This preserves the distinction between logout, which clears local user data, and terminal token expiry, which retains offline access.

## Architecture

This is a Home-screen presentation change. `HomeScreen` will consume `authStatus` from `useAuth()` and build shelf content appropriate to the current session state. The Home slice and SQLite helpers remain unchanged because they already populate downloaded items locally and retain the local user identity during `reauthRequired`.

Home shelf rendering will support either cover data or a status message. The stale-session status shelves use messages, while Downloaded continues using `CoverItem`. Authenticated construction retains the existing behavior of omitting empty shelves.

## Localization

Add English and Spanish translations for:

- the stale personalized-shelf message; and
- the empty Downloaded shelf message used during `reauthRequired`.

## Verification

- A `reauthRequired` Home screen renders Continue Listening and Listen Again with the stale-session message.
- The same screen renders downloaded cover items from local state.
- A `reauthRequired` screen with no downloads renders the Downloaded empty-state message.
- Pull-to-refresh is not attached while reauthentication is required.
- Authenticated shelf behavior remains unchanged.
- `signedOut` retains the blocking login message.
- Focus refresh continues to require authenticated, reachable server access.
