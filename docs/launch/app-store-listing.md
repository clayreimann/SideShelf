# App Store Listing Copy — SideShelf 1.0.0

Source of truth for App Store Connect metadata. Paste from here at submission;
edit here first if anything changes, so ASC and the repo don't drift.

## Field limits (verify against these before editing)

| Field            | Limit        | Notes                                        |
| ---------------- | ------------ | -------------------------------------------- |
| App name         | 30 chars     | Indexed for search                           |
| Subtitle         | **30 chars** | Indexed for search, separately from the name |
| Promotional text | 170 chars    | Editable without a new build                 |
| Keywords         | 100 chars    | Comma-separated, **no spaces after commas**  |
| Description      | 4000 chars   | Not indexed for search on the App Store      |
| What's New       | 4000 chars   |                                              |

> `TODO.md` previously recorded the subtitle limit as 80 characters. It is 30.
> Copy written to 80 cannot be entered into App Store Connect.

Apple matches plurals and word combinations automatically, and indexes the name
and subtitle separately from the keyword field — so never spend keyword
characters on a word that already appears in the name or subtitle.

---

## App name (9 / 30)

```
SideShelf
```

Deliberately not "SideShelf: Audiobookshelf". Putting another project's name in
your own app name is a common trigger for App Review questions about
affiliation. The subtitle carries the keyword instead, and is indexed just as
well.

## Subtitle (30 / 30)

```
For your Audiobookshelf server
```

Leads with the qualifier that matters: this is a client, not a service. Anyone
who doesn't run Audiobookshelf is not a customer, and saying so in the subtitle
prevents the 1-star "it doesn't come with any books" reviews that hit every
self-hosted client app.

## Promotional text (147 / 170)

```
A native iOS player for the Audiobookshelf server you already run. Downloads
that survive the tunnel, and progress that syncs the moment you pause.
```

## Keywords (98 / 100)

```
audiobook,offline,player,self-hosted,homelab,sync,sleep,timer,chapters,library,books,abs,listening
```

Omits "audiobooks" (Apple matches the plural from "audiobook"), and omits
"SideShelf", "Audiobookshelf", and "server" because the name and subtitle
already cover them.

## URLs

| ASC field                     | Value                                             |
| ----------------------------- | ------------------------------------------------- |
| Support URL (required)        | `https://github.com/clayreimann/SideShelf/issues` |
| Marketing URL (optional)      | `https://sideshelf.app`                           |
| Privacy Policy URL (required) | `https://sideshelf.app/privacy/`                  |

The in-app More screen links to the same three. Support points at GitHub issues
rather than `sideshelf.app/support` because **no support page exists on the
site** — the site's own footer uses the GitHub issues link as its support
channel. If a hosted support page is added later, change both places together.
Trailing slashes match the site's canonical URLs (Eleventy emits
`/privacy/index.html`).

## Description

```
SideShelf is a native iOS client for Audiobookshelf, the self-hosted audiobook
server. It connects to the server you already run — there is no SideShelf
account, no catalog, and no subscription.

A PLAYER THAT STAYS OUT OF THE WAY
Chapter navigation, variable playback speed, and smart rewind that backs up a
little further the longer you've been away. The sleep timer fades to silence
over the last thirty seconds instead of stopping dead mid-sentence — and if you
cancel it mid-fade, the volume comes right back. Lock screen, AirPlay, and
headphone controls behave exactly as you'd expect.

DOWNLOADS FOR THE TUNNEL AND THE FLIGHT
Download a book before you leave and listen with the server unreachable.
SideShelf tracks what's on device and keeps playing from local files, so a
sleeping server or a dead connection never interrupts a chapter.

YOUR PLACE, KEPT HONESTLY
Progress syncs back to your server the moment you pause, and queues safely when
you're offline. Start on your phone, finish in the web player, pick up on
another device mid-sentence.

A SHELF WORTH BROWSING
Grid or list. Sort by title, author, date added, or how close you are to the
end. Browse by series or author, filter and search your whole collection, and
bookmark the passages worth coming back to.

BUILT FOR PEOPLE WHO RUN THEIR OWN SERVER
Connect over HTTPS or plain HTTP on your LAN. SideShelf warns you before
sending credentials to a non-private address over an unencrypted connection.
Your library, your server, your data — nothing is sent anywhere else.

REQUIREMENTS
An Audiobookshelf server (version 2.28 or newer) that this device can reach.
SideShelf is a client only and does nothing on its own.

SideShelf is open source. Issues and contributions are welcome at
github.com/clayreimann/SideShelf
```

## What's New — 1.0.0

```
First release.

- Stream or download from your Audiobookshelf server
- Offline playback with automatic progress sync when you reconnect
- Chapter navigation, variable speed, smart rewind, and a fading sleep timer
- Bookmarks, series and author browsing, search, filtering, and sorting
- Light and dark themes, with a customizable tab bar
- Full VoiceOver support
```

---

## Open decisions before submission

- ~~**Decide the podcast claim**~~ — **RESOLVED 2026-07-31: podcasts ship in
  v1.1.** v1.0 is audiobooks only and this copy correctly omits podcasts.
  `README.md` has been corrected to match. The data layer parses podcast media
  types because the Audiobookshelf API returns them, but no podcast UI exists.
  App Review tests description claims — do not reintroduce a podcast claim in
  this file until the v1.1 UI actually ships.
- **Minimum server version (2.28)** is quoted from `minimumServerVersion` in the
  compatibility manifest inside
  `docs/superpowers/plans/2026-07-27-audiobookshelf-api-compatibility.md`. That
  number has not yet been verified by an actual test run against 2.28 — do the
  manual check with `ABS_VERSION=2.28.0 npm run demo:up` before submitting, or
  soften the claim.
- **AirPlay** is claimed on the strength of the `@douglowder/expo-av-route-picker-view`
  dependency. Confirm the route picker actually works on a physical device
  before submission; simulator AirPlay is not a valid check.
- **CarPlay is deliberately not claimed** anywhere in this copy — it's an open
  TODO (issue #39). Don't let a later edit quietly add it; App Review checks.
