# SideShelf demo Audiobookshelf server

A reproducible, Docker-based Audiobookshelf (ABS) instance seeded with
public-domain LibriVox audiobooks. It exists for three reasons:

1. **Screenshots.** A safe library to shoot App Store / marketing
   screenshots against, so no copyrighted cover art ever ends up in
   marketing material.
2. **Manual compatibility testing** against pinned ABS versions (see
   "Version pinning" below).
3. **App Review.** The demo server App Review logs into to evaluate the
   app without needing a real personal library.

## Quick start

```bash
cp demo-server/.env.example demo-server/.env
# edit demo-server/.env: at minimum change the passwords

npm run demo:up      # docker compose up -d (binds to 127.0.0.1 only)
npm run demo:seed    # download LibriVox media, seed the library + users
```

Then open `http://127.0.0.1:13378` (or whatever `ABS_PORT` you set) and log
in with `DEMO_USERNAME` / `DEMO_PASSWORD` from your `.env`.

```bash
npm run demo:down    # stop the container, keep media/data on disk
npm run demo:reset   # stop AND remove this compose project's volumes
```

`demo:reset` is scoped to `-f demo-server/compose.yml` only — it never runs
a bare `docker volume prune` or an unscoped `docker rm`/`docker volume rm`,
so it cannot touch containers or volumes from any other project on your
machine.

## Safety notes

- **Local by default.** `compose.yml` publishes the container port as
  `127.0.0.1:${ABS_PORT}:80` — bound to loopback only. A local demo server
  must not be reachable from your LAN or the internet unless you
  deliberately choose to expose it. Standing this server up for App Review
  to reach it is a **separate, deliberate hosting step** (e.g. a small VPS,
  a tunnel, or a cloud container) that you must set up and secure
  yourself — this repo only gives you the local Docker Compose file and
  seed script, not a public deployment.
- **Throwaway credentials only.** The demo user's password ships in your
  App Store Connect "App Review" notes in plain text, which several people
  inside Apple and (if leaked) outside it may end up reading. Never reuse
  a real password for `DEMO_USERNAME`/`DEMO_PASSWORD` (or
  `ABS_ROOT_USERNAME`/`ABS_ROOT_PASSWORD`) — treat them as burnable the
  moment you submit a build. Rotate them if you ever suspect exposure.
- **Never mount a real personal library here.** `compose.yml` only mounts
  `./demo-server/media/audiobooks`, which is populated exclusively by
  `seed.mjs` from public-domain LibriVox recordings. Do not repoint the
  `/audiobooks` volume at any real library path — this instance is
  disposable and its whole point is that its contents are safe to put in
  front of Apple's reviewers and in screenshots.
- `demo-server/media/`, `demo-server/data/`, and `demo-server/.env` are
  gitignored. `library.json` (the curated manifest) and everything under
  `demo-server/src/` **are** committed — they contain no credentials or
  binary media, just archive.org identifiers and orchestration code.

## Version pinning

`ABS_VERSION` in `.env` should be one of the two versions this project's
compatibility gate tests against, taken from
`docs/superpowers/plans/2026-07-27-audiobookshelf-api-compatibility.md`
(Task 1's manifest JSON block):

- `2.28.0` — `minimumServerVersion`, the oldest server SideShelf still
  supports.
- `2.35.1` — the current `releaseTestVersions` entry.

Both must work against this same `compose.yml` + `seed.mjs`. If that
manifest's version numbers change, update this file's references rather
than hardcoding new numbers here, so they never drift apart.

## How seeding works

Audiobookshelf's `metadata.json` is a scanner **output** format, not a
reliable seeding input. `seed.mjs` instead:

1. **FETCH** — for each `library.json` entry, fetches archive.org's
   `GET /metadata/<identifier>`, picks the smaller "64Kbps MP3" rendition
   of each chapter LibriVox publishes (falling back to "VBR MP3" if a
   64Kbps rendition isn't listed) — one file for `mode: "first-chapter"`
   entries, every chapter for `mode: "full"` entries — plus the largest
   non-thumbnail JPEG as cover art. Downloads are skipped if a
   correctly-sized file already exists, and every download's byte length
   is checked against the size archive.org's metadata reported; a mismatch
   fails loudly rather than leaving a silently-truncated file behind.
2. **LAYOUT** — writes
   `media/audiobooks/<Author>/[<Series>/]<Vol. N - Title>/` (the series
   level is omitted for standalone titles) containing the audio files,
   `cover.jpg`, `desc.txt` (description), and `reader.txt` (narrator).
   Audiobookshelf's scanner parses title/author/series/sequence/published
   year from this folder structure and reads the two sidecar text files —
   this is the supported way to seed metadata into ABS, not a workaround.
3. **INIT** — polls `GET /status` until the server answers (bounded
   timeout), and calls `POST /init` with the root credentials from `.env`
   if `isInit` is still `false`.
4. **CREATE + SCAN** — logs in as root, creates (or reuses) a library
   pointed at `/audiobooks`, triggers a scan, and waits for the item count
   to settle. Audiobookshelf signals scan completion over socket.io
   (`scan_complete`), which this dependency-free script cannot subscribe
   to; instead it polls `GET /api/libraries/:id/items` until the reported
   item count is stable across several consecutive polls, bounded by a
   timeout. See the doc comment on `waitForScanToSettle` in
   `src/abs-client.mjs` for the exact heuristic and its one known blind
   spot (an unchanged-count rescan).
5. **VERIFY** — reads the scanned items back and asserts each one's
   parsed title/author/series/sequence matches `library.json`, using the
   deterministic folder `relPath` as the correlation key. This is the
   whole point of the design: folder-name parsing is a silent-failure
   path, and a mis-parse here fails loudly with a clear diff instead of
   quietly surfacing later as a wrong screenshot. Any mismatch is patched
   over the API (`PATCH /api/items/:id/media`) and re-asserted.
6. **SEED STATE** — creates the non-root demo user, then sets listening
   progress for `library.json` entries carrying a `progress` fraction or
   `finished: true`, via the same `PATCH /api/me/progress/:libraryItemId`
   call shape SideShelf's own client uses
   (`src/lib/api/endpoints.ts` → `updateMediaProgress`).

The whole pipeline is idempotent — re-running `npm run demo:seed` after a
partial or full previous run skips already-downloaded files, reuses an
existing library/user, and only patches metadata that's actually wrong.

### CLI flags

```bash
node demo-server/seed.mjs --dry-run     # steps 1-2 only: fetch archive.org
                                          # metadata, print the planned
                                          # media/audiobooks/ tree with file
                                          # sizes, download nothing
node demo-server/seed.mjs --skip-fetch  # skip steps 1-2 (media/ already
                                          # populated), go straight to
                                          # init/scan/verify/seed-state
```

## `library.json`

The committed, curated manifest of 24 LibriVox titles across 14 authors and
4 series (Sherlock Holmes, Oz, Anne of Green Gables, Tom Sawyer/Huckleberry
Finn). Every `identifier` is a real archive.org identifier that was
verified (at the time this file was written) to resolve at
`https://archive.org/metadata/<identifier>` with a non-empty list of MP3
files — see "What was verified" below. Four titles use
`mode: "full"` (every chapter downloaded, for chapter-list / chapter-jump /
sleep-timer screenshots): _The Strange Case of Dr. Jekyll and Mr. Hyde_,
_The Time Machine_, _Alice's Adventures in Wonderland_, and _The Call of
the Wild_ — all short novellas, chosen to keep total demo-server disk
usage sane while still exercising real chapter structure. The rest use
`mode: "first-chapter"` (one file each) so covers/series/authors still
populate fully for browse screenshots. Four titles carry a `progress`
fraction (populating "Continue Listening") and one carries
`finished: true` (populating "Listen Again").

`narrator` is set to `"LibriVox Volunteers"` for every entry: LibriVox
audiobooks of this length are almost always read by a different volunteer
per chapter, so there is no single accurate narrator name to extract from
archive.org's metadata without scraping the LibriVox catalog page per
title (out of scope here, and not one of the verified facts this pipeline
relies on). `description` fields are short original summaries, not copied
from archive.org's uploader-written blurbs.

If you add an entry, verify it first:

```bash
curl -s "https://archive.org/metadata/<identifier>" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(len([f for f in d['files'] if f['name'].lower().endswith('.mp3')]))"
```

A non-zero count means it resolves with audio. Never hand-invent an
identifier.

## Editing library.json requires a data wipe

`npm run demo:seed` is idempotent with respect to **re-running**, but not with
respect to **manifest edits**. If you change an entry's `identifier` or `mode`,
re-seeding is not enough:

```bash
docker compose -f demo-server/compose.yml down
rm -rf demo-server/data          # ABS config + metadata; regenerable
docker compose -f demo-server/compose.yml up -d
npm run demo:seed
```

`demo-server/media/` is a **separate** bind mount and is preserved, so nothing
re-downloads except files the new manifest actually adds.

Why the wipe is required: chapters written through `POST /api/items/:id/chapters`
become authoritative in Audiobookshelf. A rescan will **not** regenerate them
from the audio files, so an item seeded under an old identifier keeps its old
chapter list forever — even after the files on disk are replaced. The seeder
detects this rather than silently mis-mapping titles to the wrong audio:

```
"The Adventures of Sherlock Holmes": chapter count (4) does not match
audio file count (12) — refusing to guess a mapping.
```

That error means "wipe `data/` and re-seed", not "the download failed".

## Verification status

**Verified end-to-end against a live server on 2026-07-31** (Rancher Desktop,
Docker 29.6.2, ABS `2.35.1`). A full `demo:up` + `demo:seed` from an empty
`data/` completed successfully:

- `compose.yml` brings the container up; `/status` reports `isInit: false` on
  a fresh volume and `POST /init` creates the root user.
- All of `/login`, `/api/libraries`, scan trigger, item listing, media patch,
  user creation, and `PATCH /api/me/progress/:id` work as implemented.
- All 24 items scanned; 611.4 MB of audio downloaded.
- `waitForScanToSettle`'s defaults were adequate — the scan settled well
  inside the timeout for 24 items.
- Logging in as the demo user returns the library with 24 items, 5 media
  progress entries, and home shelves: Continue Listening (4), Recently Added
  (10), Recent Series (4), Discover (10), Listen Again (1), Newest Authors (10).
- Re-running `demo:seed` is genuinely idempotent: downloads are skipped,
  `/init` is skipped, the library is reused, and the parse verification
  re-passes with zero patches.

### Bugs that first run exposed

Recording these because each was invisible to every static check:

1. **No retry on transient archive.org failures.** A single HTTP 500 aborted
   the run after 416 MB. The file returned 200 moments later. Fixed with
   bounded exponential backoff in `src/fetch-media.mjs`; permanent failures
   (404) still fail fast.
2. **Audiobookshelf creates users inactive by default.** `POST /api/users`
   without `isActive: true` yields an account whose `POST /login` returns a
   bare 401 — indistinguishable from a wrong password. Fixed in
   `createUser`, and `ensureDemoUser` now reactivates a pre-existing
   inactive account.
3. **The scanner mis-parsed 11 of 24 items** from folder names (wrong title
   or authors). The verify-and-patch step caught and corrected every one.
   This is exactly why that step exists — without it roughly half the demo
   library would have reached App Store screenshots with wrong metadata.

### ABS 2.28.0 verified 2026-08-01

The oldest supported server has now been exercised too. `ABS_VERSION=2.28.0`
against a wiped `data/` (media preserved — see "Editing library.json requires
a data wipe") seeded end-to-end with no code changes: `/init`, `/login`,
`POST /api/libraries`, scan, `PATCH /api/items/:id/media` (15 parse
corrections), `POST /api/items/:id/chapters`, `POST /api/users` +
`PATCH /api/users/:id`, and `PATCH /api/me/progress/:id` are all accepted
with identical request shapes to 2.35.1.

Re-checked independently through the API rather than trusting the seeder's
exit code: `/status` reports `2.28.0`, `demo-reviewer` logs in, the library
has 34 items and 8 series with correct book counts (Anne of Green Gables 3,
Barsoom 3, Little Women 3, Oz 3, Sherlock Holmes 3, Tarzan 2, The Jungle
Book 2, Tom Sawyer 2), and `/api/me` returns 5 `mediaProgress` entries.

The demo server now runs 2.28.0, and the 1.0 App Store screenshots are shot
against it — so the store images demonstrate the app working on the oldest
server version the listing claims to support.

### Still unverified

- **Public hosting.** The compose file binds to `127.0.0.1` by design;
  exposing this for App Review is a separate, deliberate step.
