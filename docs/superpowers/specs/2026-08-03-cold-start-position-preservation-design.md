# Cold-Start Position Preservation Design

## Problem

On cold start, the coordinator begins with `position = 0`. Startup dispatches
`APP_FOREGROUNDED` before `restorePersistedState()`. Although that event is an
`IDLE -> IDLE` lifecycle notification, the normal structural store bridge runs
after it and persists the coordinator's default zero position and a fresh
timestamp. The selected track remains persisted, producing an inconsistent
restored state: the correct book at `0:00`.

## Design

Keep `APP_FOREGROUNDED` as the first coordinator event so startup tracing and
lifecycle ordering remain intact, but do not run the structural store bridge
for that event. It reports lifecycle state; it does not contain hydrated player
state and therefore must not project coordinator defaults into Zustand or
AsyncStorage.

All other allowed structural events continue to use `syncStateToStore()`, and
`NATIVE_PROGRESS_UPDATED` continues to use the position-only bridge.

## Testing

Add a coordinator regression test that dispatches `APP_FOREGROUNDED` from the
initial `IDLE` state and verifies none of the persisted player-state mutators are
called. Retain the existing structural-transition test proving `LOAD_TRACK`
still runs the full store bridge.

## Scope

This change prevents the cold-start overwrite only. The separate native
queue-seek reconciliation race that can create paired jump-history entries is
not changed here.
