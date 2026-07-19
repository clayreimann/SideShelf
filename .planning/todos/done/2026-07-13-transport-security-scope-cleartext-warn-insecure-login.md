---
created: 2026-07-13T00:00:00.000Z
title: Transport security — scope cleartext HTTP, warn on insecure login
area: security
brief: F
priority: P2
depends_on: []
files:
  - app.config.js
  - app.json
  - src/app/login.tsx
  - src/i18n/locales/en.ts
  - src/i18n/locales/es.ts
---

## Problem

`NSAllowsArbitraryLoads: true` (`app.config.js:36-38`, mirrored in
`app.json:20-21`) permits plaintext HTTP to **any** host on iOS. Self-hosted
Audiobookshelf users legitimately need HTTP for LAN servers, but the current
config means username/password (`src/lib/api/endpoints.ts:513-534`, POST
/login) and bearer tokens ride plaintext to _public_ hosts too, with no
warning to the user.

## Solution

**1. Investigate the right ATS scope (do this first):**

- Option A: replace `NSAllowsArbitraryLoads` with
  `NSAllowsLocalNetworking: true` — allows cleartext to RFC1918 / .local
  addresses while requiring TLS for public hosts.
- Caveat: users reaching home servers via public DNS names over plain HTTP
  (DDNS setups without TLS) would break under Option A. Tailscale/VPN
  setups resolve to private IPs and are fine.
- Decision rule: if breaking plain-HTTP-over-public-DNS is unacceptable for
  this user base, keep `NSAllowsArbitraryLoads` and rely on the login
  warning (change 2) instead. Either way, **document the decision** in a
  comment next to the ATS config in app.config.js.

**2. Insecure-login warning** (`src/app/login.tsx`):

- When the entered server URL scheme is `http://` AND the host is not a
  private/LAN address (RFC1918 ranges, `.local`, `localhost`), show a
  non-blocking warning before submitting: credentials will be sent
  unencrypted. Let the user proceed.
- Strings go through the existing i18n setup (`src/i18n/locales/en.ts`,
  `es.ts`) — follow the existing key naming patterns.

**3. Android parity:**

- Check the Android cleartext policy (`usesCleartextTraffic` / network
  security config in the Expo config) and apply the same decision made in
  change 1.

## Verification

- iOS build compiles with the new ATS dict (`npm run ios` or an EAS build
  dry run).
- Manual: login against `http://192.168.x.x` → works, no warning (private
  address). Login against `http://<public-hostname>` → warning appears,
  proceeding still works (or fails with a clear ATS error if Option A was
  chosen — in which case the warning copy should say TLS is required).
- `npm test` green (login screen tests, if any, updated).

## Out of scope

- Certificate pinning — deliberately not wanted for self-hosted servers
  with user-provided certs.
- Any change to the API client or token handling.
