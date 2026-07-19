---
created: 2026-07-13T00:00:00.000Z
title: Move streaming auth from URL query param to Authorization header
area: player
brief: E
priority: P2
depends_on: []
files:
  - src/services/player/TrackLoadingCollaborator.ts
---

## Problem

`src/services/player/TrackLoadingCollaborator.ts:361` builds streaming URLs
as `${baseUrl}${contentUrl}${separator}token=${accessToken}`. Access tokens
in URLs leak into server access logs, reverse-proxy logs, and potentially
native player state. Downloads already authenticate correctly with an
`Authorization: Bearer` header (`src/services/DownloadService.ts:557-569`);
streaming should match.

Mitigating factors (why this is P2, not P0): ABS access tokens are
short-lived on modern servers, and the code already redacts the token when
logging the URL (line 389) — but the server-side log exposure remains.

## Solution

**Investigate first, then implement:**

1. `react-native-track-player` supports per-track `headers` on the track
   object. Add `headers: { Authorization: \`Bearer ${token}\` }`to streamed
(non-local) tracks and drop the`?token=` query param.

2. **Risk point A — range requests:** verify on BOTH platforms that seeking
   far ahead (forcing new HTTP range requests) still carries the header.
   AVPlayer (iOS) and ExoPlayer (Android) both support per-request headers
   via RNTP, but this must be verified against a real ABS stream, not
   assumed.

3. **Risk point B — token rotation mid-playback:** token refresh rotates the
   access token while a queued track's headers hold the old one. Determine
   whether the ABS server rejects stale tokens on subsequent range requests
   mid-stream. If stale-token failures are possible:
   - handle 401-class RNTP playback errors by rebuilding the queue with
     fresh headers — the coordinator's `RELOAD_QUEUE` path and
     `executeRebuildQueue` already exist for queue rebuilds; reuse them, do
     not invent a parallel mechanism.

4. **Permission to bail:** if header auth proves unreliable for streaming
   (broken seeks, mid-stream failures that can't be recovered cleanly),
   KEEP the query param, document the finding and rationale in a comment at
   the URL construction site, and close this todo with that outcome. A
   working stream with a logged token beats a broken stream.

5. Keep the token-redaction log helper (line 389) consistent with whatever
   URL/header shape remains.

## Verification

- Manual streaming test on iOS (and Android if a device is available):
  - start a stream, confirm playback
  - seek far ahead (forces new range requests), confirm playback continues
  - pause 20+ minutes (forces token refresh), resume, confirm playback
- Update existing TrackLoadingCollaborator tests for the new track shape.
- `npm test` fully green.

## Out of scope

- Download auth (already header-based, correct).
- Cover image URLs — check whether they embed tokens while in the area; if
  they do, note it in a new todo rather than expanding this one.
