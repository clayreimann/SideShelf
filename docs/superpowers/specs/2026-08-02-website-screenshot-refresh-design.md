# Website Screenshot Refresh Design

**Date:** 2026-08-02

## Goal

Publish the six newly captured SideShelf states on the marketing website and
make the screenshot pipeline export every state as a dark/light WebP pair.

## Scope

The app repository owns capture and conversion. The website repository owns
presentation. This change does not alter Maestro capture states or app
behavior; it connects the already-updated captures to the website.

## Asset Contract

The app pipeline exports these twelve files to
`../SideShelf-web/src/assets/images/`:

| Order | Screen       | Website slug   | Required state                                                  |
| ----- | ------------ | -------------- | --------------------------------------------------------------- |
| 1     | Home         | `home`         | Three full shelves, including Listen Again                      |
| 2     | Player       | `player`       | Real chapter and Show Chapters (12)                             |
| 3     | Library grid | `library-grid` | All 18 tiles use real cover art                                 |
| 4     | Downloaded   | `downloads`    | Detail page with green Downloaded status and real chapter names |
| 5     | Sleep timer  | `sleep-timer`  | Active timer at 14:58                                           |
| 6     | Series       | `series`       | Six covered rows with server-matching counts                    |

Each slug produces `screenshot-<slug>-dark.webp` and
`screenshot-<slug>-light.webp`. A missing source capture fails the export
instead of leaving a stale website asset in place.

## Website Presentation

The hero phone uses the Home dark/light pair. The screenshot gallery uses a
website-local data collection containing the six slugs, labels, alt text, and
featured state, then renders the shared frame markup in the order above.
Player remains the featured frame.

On desktop the gallery forms a three-column, two-row grid. On narrow screens it
keeps the existing horizontally scrollable, snap-aligned presentation. The
website build remains independent of the app checkout: it consumes committed
WebP assets but does not read the app's caption manifest at build time.

## Documentation

`SideShelf-web/SCREENSHOTS_NEEDED.md` will describe the automated workflow,
all twelve expected WebPs, their current states, and the Home hero plus
six-screen gallery usage. Obsolete instructions that imply only three website
screens are required will be corrected.

## Verification

Completion requires all of the following:

1. The app WebP export includes all six surfaces and fails on any missing raw
   dark/light capture.
2. All twelve destination assets exist, are WebP images, and share the expected
   screenshot dimensions.
3. The website production build succeeds.
4. Built HTML references Home in the hero and all six dark/light pairs in the
   gallery, with meaningful labels and alt text.
5. Desktop and mobile layouts are visually checked for clipping, overflow, and
   theme swapping.
6. Unrelated existing changes in both repositories remain intact.

## Out of Scope

- Changing capture navigation, fixture data, captions, or App Store composites
- Publishing or deploying the website
- Reworking the broader marketing-site visual design
