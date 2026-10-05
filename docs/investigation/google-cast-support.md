# Google Cast Support Investigation

**Status:** Deferred indefinitely — reopen only in response to demonstrated user demand
**Date:** 2026-07-17
**Decision:** Do not assign Google Cast to a public release or carry Cast-specific production code until the feature is requested and can be exercised regularly.

---

## Decision Summary

Google Cast is technically feasible, and the React Native sender integration is compatible with Expo development builds. It is not a simple extension of AirPlay or of the proposed Audio Browser migration, however. A Cast receiver plays media independently of the phone, which introduces separate authentication, networking, queue, session, progress, and lifecycle responsibilities.

SideShelf's maintainer does not expect to use Cast regularly. Shipping it now would add a second playback backend and possibly a hosted receiver that could become stale without routine real-device testing. The expected maintenance cost is not justified by current demand.

Therefore:

- Cast is not planned for public 1.1, public 1.2, or any later named release.
- Public 1.1 may add podcasts while retaining React Native Track Player (RNTP) as the local playback baseline.
- Public 1.2 may migrate local playback to Audio Browser and add CarPlay/Android Auto.
- The Audio Browser migration should preserve reasonable architectural seams, but it should not introduce speculative Cast abstractions or Cast-specific behavior.
- This document records the likely implementation shape and the questions that must be answered if Cast is reconsidered.

---

## What Google Cast Is

Cast is remote playback, not an audio route. The SideShelf mobile app would act as a **sender** that discovers a Cast device and sends commands, content identity, metadata, and playback state. A **receiver** running on the Cast device would independently fetch and play media from Audiobookshelf.

That differs from AirPlay, where the operating system routes the app's audio output. It also differs from CarPlay and Android Auto, which expose and control the phone's local media session. Audio Browser can provide the local session and car browse hierarchy, but it does not provide a Cast receiver or remote playback adapter.

Google documents three Web Receiver choices:

1. **Default Media Web Receiver** — Google-hosted, no registration, minimal customization, and no application-specific authentication logic.
2. **Styled Media Web Receiver** — Google-hosted with limited branding, but still no custom application logic.
3. **Custom Web Receiver** — a separately hosted HTML/JavaScript application that can implement authentication, request interception, custom messages, controls, analytics, and application-specific behavior.

Google specifically identifies authorization or authentication as a reason to use a Custom Web Receiver. SideShelf should consequently assume that production-quality support may require both a mobile sender and a hosted receiver unless Audiobookshelf gains safe, short-lived Cast URLs that work with the default receiver.

Sources:

- [Google Cast architecture overview](https://developers.google.com/cast/docs/overview)
- [Web Receiver overview and receiver types](https://developers.google.com/cast/docs/web_receiver)
- [Custom Web Receiver core features](https://developers.google.com/cast/docs/web_receiver/core_features)

---

## Current SideShelf Gaps

### 1. No Cast Sender Dependency or Native Configuration

SideShelf does not depend on `react-native-google-cast`, has no Cast receiver application ID, and has no Cast config plugin entry. The existing Expo setup is suitable for adding a native sender library through development/EAS builds, but Cast would not work in Expo Go.

The current iOS local-network permission says the app needs local access "to download files." Cast discovery would require updated user-facing wording and the Bonjour service declarations required by the Google Cast iOS SDK. Android would also require the sender SDK configuration produced by the library's config plugin.

Relevant files:

- [`package.json`](../../package.json)
- [`app.config.js`](../../app.config.js)

Candidate sender library:

- [`react-native-google-cast`](https://github.com/react-native-google-cast/react-native-google-cast) — includes an Expo config plugin for custom Expo builds and supports React Native New Architecture compatibility mode in its 4.9 line.

### 2. Playback Execution Is Coupled to RNTP

The coordinator owns player decisions, but many execution and recovery paths still assume RNTP is the only playback target:

- `PlaybackControlCollaborator` calls RNTP directly for play, pause, stop, seek, rate, and volume.
- `TrackLoadingCollaborator` builds and mutates an RNTP queue.
- `ProgressRestoreCollaborator` queries RNTP state and seeks RNTP directly.
- `BackgroundReconnectCollaborator` registers and repairs the RNTP background service.
- `PlayerBackgroundService` receives RNTP events, reads native progress, advances files, and drives listening-session updates.
- `PlayerStateCoordinator` imports RNTP state types and contains RNTP-specific transient-state handling.
- App startup checks RNTP directly before deciding whether to restore playback.
- `playerSlice`, settings actions, and now-playing metadata contain direct RNTP calls.
- The player test suite extensively mocks RNTP as the only native executor.

Relevant files:

- [`src/services/player/PlaybackControlCollaborator.ts`](../../src/services/player/PlaybackControlCollaborator.ts)
- [`src/services/player/TrackLoadingCollaborator.ts`](../../src/services/player/TrackLoadingCollaborator.ts)
- [`src/services/player/ProgressRestoreCollaborator.ts`](../../src/services/player/ProgressRestoreCollaborator.ts)
- [`src/services/player/BackgroundReconnectCollaborator.ts`](../../src/services/player/BackgroundReconnectCollaborator.ts)
- [`src/services/PlayerBackgroundService.ts`](../../src/services/PlayerBackgroundService.ts)
- [`src/services/coordinator/PlayerStateCoordinator.ts`](../../src/services/coordinator/PlayerStateCoordinator.ts)
- [`src/app/_layout.tsx`](../../src/app/_layout.tsx)
- [`src/stores/slices/playerSlice.ts`](../../src/stores/slices/playerSlice.ts)
- [`src/lib/nowPlayingMetadata.ts`](../../src/lib/nowPlayingMetadata.ts)

A future Cast implementation would need a local/remote playback boundary. That boundary should normalize commands, state, events, queue identity, progress, and errors without weakening the coordinator's ownership model.

### 3. Current Streaming Authentication Is Not Suitable as a Final Cast Design

SideShelf starts an Audiobookshelf play session, receives content paths, and constructs stream URLs by appending the user's access token as a query parameter. That URL is currently consumed only by the native player on the phone.

Sending the same long-lived token to a Cast receiver might work technically, but would expand where the credential is transmitted and retained. It should not be accepted as the production design without an explicit security review.

Relevant files:

- [`src/lib/api/endpoints.ts`](../../src/lib/api/endpoints.ts)
- [`src/services/player/TrackLoadingCollaborator.ts`](../../src/services/player/TrackLoadingCollaborator.ts)

Preferred future options, in order:

1. Audiobookshelf issues a short-lived, media-scoped Cast URL or token.
2. A Custom Web Receiver exchanges opaque media identity plus a temporary credential for playback URLs.
3. A Custom Web Receiver attaches temporary authorization headers through request interception.
4. Passing the user's normal access token in the media URL is used only for a controlled feasibility spike, never assumed to be the shippable solution.

### 4. No Remote Playback Target or Handoff Model

The application has no concept of `local` versus `cast` playback. A production design would need to define:

- How local playback pauses and remote playback starts at the same logical position.
- Which target is authoritative while casting.
- How position, playback rate, queue, chapter, and session identity transfer in both directions.
- What happens when the receiver disconnects, becomes unreachable, or is stopped by another sender.
- How SideShelf rejoins an existing Cast session after foregrounding or process restart.
- Whether local playback resumes automatically after an unexpected Cast disconnect.
- How coordinator event serialization covers commands whose acknowledgement comes from a remote device.

The safest conceptual boundary would be a player-neutral contract beneath the coordinator:

```text
PlayerStateCoordinator
    -> PlaybackTarget
        -> LocalPlaybackTarget (Audio Browser, or RNTP during transition)
        -> CastPlaybackTarget (Google Cast RemoteMediaClient)
```

This is a likely direction, not an approved implementation plan. It should not be added speculatively while Cast remains deferred.

### 5. The Player Model Cannot Fully Identify Podcast Episodes or Playback Targets

`PlayerTrack` currently models an audiobook-oriented library item with component audio files and chapters. It does not carry all of the identity needed for remote media:

- Media type (`book` or `podcast`).
- Podcast episode ID.
- Stable logical queue entry ID distinct from a stream URL.
- Playback target.
- Receiver-safe content identity.
- Aggregate-to-file timeline mapping as an explicit value.

Podcast work will need to address some of these gaps independently of Cast. Cast should reuse the resulting media descriptors rather than adding Cast-only identity fields to UI or store objects.

Relevant file:

- [`src/types/player.ts`](../../src/types/player.ts)

### 6. Multi-file Audiobook Position Translation Is Phone-local

SideShelf presents a multi-file audiobook as one continuous timeline while RNTP plays a queue of individual audio files. A Cast receiver would likely receive one queue item per file. SideShelf would need deterministic conversion in both directions:

```text
absolute book position <-> audio file queue index + file-relative position
```

This conversion must work for:

- Initial load and resume.
- Seeking across file boundaries.
- Chapter and bookmark jumps.
- Previous/next file transitions.
- Progress reports from the receiver.
- Handoff between local and remote playback.
- Queue recovery after the sender reconnects.

The existing code contains related calculations, but not a player-independent timeline component with a tested public contract.

### 7. Podcast Up Next Does Not Yet Exist

The planned podcast experience includes an app-owned, persistent, reorderable queue of episodes. That queue is not implemented today. If Cast is reconsidered after podcasts ship, Cast should project the relevant Up Next entries into the receiver queue while keeping SideShelf's queue as the product-level source of truth.

The Cast SDK supports receiver queues, but receiver queue IDs must not become SideShelf's durable queue identity. Reconnection, external queue edits, and partial receiver queues would otherwise corrupt the app-owned ordering.

### 8. Progress and Listening Sessions Depend on the Phone Process

The background service currently turns native-player events and one-second progress updates into local listening sessions and Audiobookshelf synchronization. A Cast receiver can continue playing when SideShelf is backgrounded, suspended, killed, or disconnected.

The product must decide whether:

- The sender reports progress only while connected.
- The sender reconstructs elapsed progress when it rejoins.
- The Custom Web Receiver reports progress directly to Audiobookshelf.
- The receiver periodically sends progress to any connected sender and the sender remains responsible for server synchronization.

Receiver-side reporting is the most resilient but requires authentication, Audiobookshelf API access, retry behavior, and protection against duplicate sender/receiver updates. Sender-only reporting is simpler but can lose or delay progress when the app process is absent.

Relevant files:

- [`src/services/PlayerBackgroundService.ts`](../../src/services/PlayerBackgroundService.ts)
- [`src/services/ProgressService.ts`](../../src/services/ProgressService.ts)

### 9. Device-local Downloads Cannot Be Cast Directly

A receiver cannot read files stored inside SideShelf's mobile sandbox. Casting a downloaded book or episode would still require the receiver to stream that media from Audiobookshelf.

Consequences:

- Cast must be unavailable when the server cannot be reached from the receiver, even if the item is downloaded to the phone.
- The UI must explain why a downloaded item can play locally but cannot be cast offline.
- A phone-hosted HTTP proxy is not recommended: it would couple playback to the phone process, complicate iOS background execution, expose a new local server surface, and defeat the main benefit of receiver-owned playback.

### 10. No Cast UI or Session UX

The app currently has AirPlay route controls but no Cast-specific UI. Production support would require:

- A Google Cast button using Google's required visual behavior.
- Device discovery and connection dialogs.
- A clear local/casting state in the floating and full-screen players.
- Expanded remote controls and receiver volume behavior.
- Stop casting versus stop playback semantics.
- Handoff error and reconnect messaging.
- Disabled or explained controls when the receiver cannot support a local feature.
- Queue UI that reflects remote state without letting receiver IDs become durable app state.

---

## Investigations Required Before Implementation

These questions must be answered with prototypes or real-device tests. Documentation review alone is insufficient.

### Priority 0: Feasibility and Security

| Investigation                | Questions to answer                                                                                                                               | Exit evidence                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Audiobookshelf authorization | Can ABS issue a short-lived, media-scoped URL or credential? Can a receiver send authorization headers? Does this require an upstream ABS change? | Documented request flow with no long-lived account token in receiver media URLs               |
| Server reachability          | Can common local, remote, reverse-proxied, and VPN ABS configurations be resolved and reached by Cast hardware?                                   | Results matrix using physical devices and representative server setups                        |
| TLS behavior                 | What happens with plain HTTP, valid HTTPS, self-signed certificates, local hostnames, and IP-address certificates?                                | Supported/unsupported matrix plus user-facing error strategy                                  |
| HTTP media behavior          | Do ABS streams expose correct MIME type, byte-range behavior, redirects, and CORS headers for receiver playback and request interception?         | Captured successful requests for representative MP3, M4A/AAC, FLAC, OGG, and multi-file items |
| Credential lifecycle         | How are credentials scoped, expired, refreshed, revoked, and prevented from leaking into logs or analytics?                                       | Threat model and redaction tests                                                              |

Google's supported-media documentation notes that codec support varies and that adaptive or protected cross-origin media requires correct CORS behavior. Protected content cannot rely on a wildcard origin.

Sources:

- [Google Cast supported media](https://developers.google.com/cast/docs/media)
- [Web Receiver streaming protocols](https://developers.google.com/cast/docs/media/streaming_protocols)

### Priority 1: Playback Correctness

| Investigation        | Questions to answer                                                                                                                      | Exit evidence                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Receiver choice      | Can the Default Receiver support a secure MVP, or is a Custom Receiver mandatory? Where would a custom receiver be hosted and versioned? | Receiver decision record and operational owner                  |
| Multi-file timeline  | Can Cast queue transitions preserve SideShelf's aggregate book position without gaps, duplicates, or file-boundary drift?                | Automated mapping tests plus real-device seek/transition tests  |
| Process death        | Does playback continue correctly after the sender backgrounds or terminates? How is progress reconciled on rejoin?                       | Real-device lifecycle test matrix                               |
| Local/remote handoff | Can a book or episode move both directions without double playback or material position loss?                                            | Repeatable handoff tests with tolerance defined                 |
| Podcast queue        | How much of the app-owned Up Next queue should be mirrored to Cast, and how are remote changes reconciled?                               | Queue ownership contract and reconnect tests                    |
| Controls             | Which receivers reliably support playback rate, skip intervals, chapter seeks, sleep timer, queue edits, and custom actions?             | Capability matrix by supported device class                     |
| Session accounting   | How are Audiobookshelf play sessions started, updated, closed, retried, and deduplicated across sender and receiver?                     | Integration tests against ABS with interruption and retry cases |

### Priority 2: Product and Operations

| Investigation       | Questions to answer                                                                                                            | Exit evidence                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Supported topology  | Must phone, receiver, and server share a LAN? Are remote HTTPS servers supported? Are VPN-only servers explicitly unsupported? | Published support policy                       |
| Device scope        | Which Chromecast, Google TV, Nest display, and Cast audio devices are supported?                                               | Maintained physical-device test list           |
| Receiver operations | Who hosts, deploys, monitors, rolls back, and updates a Custom Web Receiver?                                                   | Deployment and rollback runbook                |
| UX compliance       | Does the sender follow Google's Cast button, connection, mini-controller, notification, and stop-casting expectations?         | UX checklist and platform review               |
| Diagnostics         | Can users export receiver/session/network diagnostics without exposing credentials?                                            | Redacted diagnostic schema and failure reports |

---

## Likely Implementation Work If Reopened

This sequence is informational, not scheduled.

1. **Feasibility spike**
   - Add `react-native-google-cast` on an isolated branch.
   - Configure a development receiver and physical test devices.
   - Cast one public test file, then one authenticated ABS file.
   - Record codec, CORS, TLS, LAN, and lifecycle findings.

2. **Authorization decision**
   - Select short-lived URL, receiver token exchange, or request-header interception.
   - Coordinate any required Audiobookshelf server/API contribution.
   - Complete a security and logging review before broader playback work.

3. **Player-neutral media and timeline model**
   - Define stable media identity for books and episodes.
   - Extract and test aggregate-position/file-position conversion.
   - Keep stream URLs and credentials out of persistent product state.

4. **Remote playback adapter**
   - Normalize Cast status/events into coordinator-owned events.
   - Implement load, play, pause, seek, rate where supported, stop, queue, and errors.
   - Preserve a single authoritative playback target.

5. **Session and progress lifecycle**
   - Implement handoff, backgrounding, process death, rejoin, disconnect, and session closure.
   - Prove progress correctness and deduplication before exposing the feature.

6. **Product UI**
   - Add the Cast button and session controls.
   - Explain server reachability and downloaded-file limitations.
   - Integrate podcast Up Next without transferring durable ownership to Cast.

7. **Hardening and release qualification**
   - Exercise the supported network and device matrix.
   - Validate credential redaction and failure diagnostics.
   - Establish recurring real-device tests so support does not silently decay.

---

## Reopen Criteria

Reconsider Cast only when at least one of the following is true:

- Multiple users request Cast and can describe a recurring use case.
- A high-priority user or distribution opportunity requires it.
- Audiobookshelf adds a secure, documented receiver-friendly authorization mechanism that materially reduces implementation risk.
- A contributor offers to implement and regularly exercise Cast support with representative physical hardware.

Before approving implementation, also require:

- A maintainer willing to run Cast smoke tests during player, Expo, React Native, iOS, Android, and Cast SDK upgrades.
- Access to representative Cast hardware and at least two Audiobookshelf network configurations.
- A decision on receiver hosting and operational ownership.
- A scoped milestone whose value justifies maintaining a second playback backend.

One isolated user request may justify refreshing this investigation or running a small spike; it does not automatically justify shipping and maintaining the feature.

---

## Explicit Non-actions While Deferred

- Do not add `react-native-google-cast`.
- Do not register or host a production receiver.
- Do not add a speculative `CastPlaybackTarget`.
- Do not pass normal Audiobookshelf access tokens to Cast devices.
- Do not add Cast fields to stores, database schemas, or media types solely for possible future use.
- Do not promise that device-downloaded media can be cast while Audiobookshelf is unreachable.
- Do not allow the Audio Browser migration or CarPlay/Android Auto work to grow Cast scope implicitly.

The appropriate near-term action is to keep local playback and car integration well bounded and documented. If Cast demand emerges later, the future implementation can introduce the remote target deliberately using the findings and investigation gates above.
