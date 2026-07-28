# OTA Updates

## Current status

OTA updates are intentionally disabled in SideShelf.

The previous GitHub Pages workflow was removed because a static `expo export`
directory is not an Expo Updates protocol server. Current builds retain the
`expo-updates` native module and runtime-version configuration, but they do not
contain an update URL, automatically check for updates, expose a Bundle Loader,
or permit runtime URL overrides.

App Store and TestFlight releases therefore receive JavaScript changes only
through a new binary until the self-hosted update service passes its production
gates.

## Approved future design

The approved design uses a fixed Cloudflare Worker manifest endpoint and
content-addressed R2 storage with exact channel/platform/runtime matching,
signed manifests, atomic promotion, rollback, and physical-device acceptance.

See:

- `docs/superpowers/specs/2026-07-28-self-hosted-ota-worker-r2-design.md`

Do not restore GitHub Pages publication or a user-entered update URL. Implement
the approved delivery phases in order.
