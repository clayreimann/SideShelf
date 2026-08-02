# App Review Notes — SideShelf 1.0.0

Paste the "Notes for Review" block below into App Store Connect. The sections
after it are internal background for answering follow-up questions.

---

## Notes for Review (paste this)

```
WHAT THIS APP IS
SideShelf is a client for Audiobookshelf, an open-source, self-hosted audiobook
server that users run on their own hardware. The app ships with no content and
no accounts of its own. Without a server to connect to it shows only a login
screen, so a demo server is required to review it. Credentials are below.

DEMO SERVER
  Server URL: <FILL IN before submitting>
  Username:   <FILL IN>
  Password:   <FILL IN>

Enter the server URL on the first screen, then the username and password. All
content on the demo server is public-domain audio from LibriVox.

ARBITRARY LOADS / APP TRANSPORT SECURITY
NSAllowsArbitraryLoads is set to true. SideShelf connects only to a server
address the user types in themselves; it contacts no first-party backend at all.
A large share of self-hosted Audiobookshelf servers are reachable only over
plain HTTP — LAN addresses with no certificate, or dynamic-DNS hostnames that
were never put behind TLS. Restricting cleartext to NSAllowsLocalNetworking
would silently break the dynamic-DNS case, which is common in this user base.

Rather than block those users, the app warns them: before credentials are
submitted, if the URL is http:// and the host is not a private/LAN address,
SideShelf shows a confirmation alert explaining the risk and requires the user
to explicitly continue. See isInsecureLoginUrl() in
src/lib/helpers/networkAddress.ts and the alert in src/app/login.tsx.

No SideShelf-operated endpoint is contacted over cleartext, because there are
no SideShelf-operated endpoints.

BACKGROUND AUDIO
UIBackgroundModes includes "audio" so audiobook playback continues when the
screen is locked or the app is backgrounded — the normal use case for an
audiobook player.

LOCAL NETWORK ACCESS
NSLocalNetworkUsageDescription is present because most users' servers are on
their local network.

DATA COLLECTION
None. The app has no analytics, no crash reporting, and no first-party servers.
All data stays between the device and the user's own server.
```

---

## Internal background (not for ASC)

### Before submitting, fill in

- [ ] Demo server URL, username, and password. The demo user must be a
      **throwaway** non-root account with a password used nowhere else — this
      block is transmitted to Apple and stored in App Store Connect.
- [ ] Confirm the demo server is publicly reachable from outside your network.
      `demo-server/` binds to `127.0.0.1` by default; exposing it is a separate
      deliberate hosting step.
- [ ] Confirm the seeded library is populated (Continue Listening, downloads,
      series, authors) so a reviewer sees a working app, not an empty shelf.

### Where the ATS reasoning comes from

The full decision, with the Android parity discussion, is recorded in the
transport-security comment block in `app.config.js` (above the `ios:` key). The
paste block above is a condensed version. If a reviewer pushes back, that
comment has the complete reasoning — including why certificate pinning is
deliberately not used (self-hosted servers use arbitrary and self-signed
certificates).

### Likely follow-up questions

**"Why can't you use HTTPS only?"** — Users choose the server address; the app
has no control over whether their server has a certificate. Blocking HTTP would
make the app non-functional for a large fraction of the Audiobookshelf user
base, particularly LAN-only and dynamic-DNS setups.

**"Is this app affiliated with Audiobookshelf?"** — No. SideShelf is an
independent open-source client. Audiobookshelf is named descriptively, to
identify the server the client works with, and does not appear in the app name.

**"Where does the content come from?"** — Entirely from the user's own server.
The demo server's content is public-domain LibriVox recordings.

### Guideline exposure to be ready for

- **2.1 (App Completeness)** — the demo server must stay up for the whole
  review window. If it goes down, the app looks broken.
- **5.2.1 (Intellectual Property)** — the demo library is deliberately
  public-domain LibriVox audio, so no third-party cover art or recordings
  appear in review or in the App Store screenshots.
- **4.2 (Minimum Functionality)** — the "requires a server" framing in the
  subtitle and description exists partly to preempt this; the notes above make
  the same point.
