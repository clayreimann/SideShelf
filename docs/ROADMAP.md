# SideShelf Roadmap

This document is the maintained summary of product direction. Detailed designs remain in the linked specifications; this file records ordering, boundaries, and explicit deferrals.

## Versioning

The historical v1.0-v1.3 labels described internal engineering milestones completed before the initial store release. They are not public release promises. Public version numbering begins with the store release and follows the product roadmap below.

## Current State

The beta app has a coordinator-owned playback state machine, offline downloads, bookmarks, progress synchronization, route-scoped navigation, diagnostics, and automated test infrastructure. Recent engineering work also established:

- a versioned transactional outbox for durable progress synchronization;
- mainline `@kesha-antonov/react-native-background-downloader` rather than a project fork;
- normalized download paths and orphan-file reassociation;
- configurable progress display, bookmark title mode, sleep-timer fade, AirPlay controls, and accessibility primitives;
- span traces and shareable trace dumps for playback diagnosis;
- tree shaking behind the committed `EXPO_TREE_SHAKING` build flag.

Near-term work should favor release validation, remaining localization gaps, and verified regressions over adding broad new capability.

## Public 1.1 — Podcasts

Public 1.1 adds full-featured listening for existing Audiobookshelf podcast libraries. The accepted scope includes episode-aware playback and progress, manual and automatic downloads, retention, played state, and a podcast-only Up Next experience.

React Native Track Player remains the production playback baseline for this release. The complete contract and acceptance boundaries are in the [Public 1.1 podcast specification](superpowers/specs/2026-07-17-public-v1.1-podcasts-design.md).

## Public 1.2 — Audio Browser and Cars

Public 1.2 migrates local playback from React Native Track Player to Audio Browser and adds browsable CarPlay and Android Auto support without regressing audiobooks or the public 1.1 podcast contract.

The migration is an adapter change around the existing coordinator and progress services, not a rewrite of the playback state machine. The complete scope and sequencing are in the [Public 1.2 Audio Browser and cars specification](superpowers/specs/2026-07-17-public-v1.2-audio-browser-carplay-android-auto-design.md).

## Deferred

- **Google Cast:** Deferred indefinitely until there is demonstrated demand and a sustainable real-device test practice. Cast is remote playback with separate authentication, queue, receiver, progress, and lifecycle responsibilities; it is not an extension of AirPlay or car browsing. See the [Cast investigation](investigation/google-cast-support.md).
- **Expo SDK 55:** Deferred until React Native Track Player's Android bridgeless compatibility is verified. Re-run Expo compatibility checks before treating the historical blocker as current.
- **Siri and native intents:** URL-based shortcuts exist, but dedicated native intent integrations remain future work.
- **Cloud-hosted feedback:** A Cloudflare feedback worker remains outside the current product path.
- **Crash-reporting integration:** Local coordinator diagnostics and trace dumps exist; forwarding diagnostics or performance metrics to a crash-reporting service remains deferred.
- **ProgressService decomposition:** Further facade/collaborator decomposition is worthwhile only when it improves isolation and testability; file size alone is not a reason to split it.
- **Native progress-event lock bypass:** Bypassing serialized coordinator processing for high-frequency progress events requires an explicit safety analysis before implementation.

## Future Architecture Programs

- **Multi-server sync and aliases:** Approved direction, not yet scheduled. SideShelf will use stable local server identity, one server-scoped shared database, trusted ordered aliases, independent bounded synchronization, and a unified library that retains source provenance. Identity inventory and migration safety must precede request routing or UI work. See the [multi-server and alias design](plans/multi-server-sync-and-aliases.md).

## Supporting Specifications

- [Durable progress synchronization](plans/stale-token-progress-sync.md)
- [Multi-server sync and server aliases](plans/multi-server-sync-and-aliases.md)
- [Dependency upgrade program](superpowers/specs/2026-07-20-dependency-upgrade-program-design.md)
- [Expired-token Home shelves](superpowers/specs/2026-07-18-expired-token-home-shelves-design.md)
- [More-scoped nested navigation](superpowers/specs/2026-07-19-more-scoped-nested-navigation-design.md)
- [Project decision register](decisions/README.md)
- [Open backlog](BACKLOG.md)
