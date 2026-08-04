# Website Screenshot Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export all six screenshot states as dark/light WebP pairs and present them on the SideShelf marketing website with Home in the hero.

**Architecture:** The app repository remains the source of raw captures and writes twelve standalone WebPs into the sibling website repository. The website owns a small Eleventy data file for presentation metadata and renders a shared Nunjucks gallery loop without depending on the app checkout at build time.

**Tech Stack:** Bash, `cwebp`, Eleventy 2, Nunjucks, JSON, CSS, Node.js

## Global Constraints

- Preserve all unrelated existing changes in both repositories.
- Keep dark/light filenames in the form `screenshot-<slug>-<theme>.webp`.
- Render frames in this order: Home, Player, Library grid, Downloaded, Sleep timer, Series.
- Use Home in the hero and keep Player as the featured gallery frame.
- Keep the website build independent of the app repository.
- Do not change capture navigation, fixture data, captions, or App Store composites.
- Do not deploy or publish the website.

---

### Task 1: Add a durable website screenshot contract check

**Files:**

- Create: `/Users/clay/Code/github/SideShelf-web/scripts/check-screenshots.mjs`
- Modify: `/Users/clay/Code/github/SideShelf-web/package.json`

**Interfaces:**

- Consumes: `dist/index.html` and WebPs under `src/assets/images/`
- Produces: `npm run check:screenshots`, which exits nonzero unless the hero and gallery reference every required dark/light asset

- [ ] **Step 1: Write the failing contract check**

Create `scripts/check-screenshots.mjs` using only Node built-ins. Define the six slugs in order, assert each dark/light source file exists and begins with the `RIFF....WEBP` signature, assert the hero block references the Home pair, and assert built HTML references both themes for every slug.

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const imageDir = join(repoRoot, "src", "assets", "images");
const slugs = ["home", "player", "library-grid", "downloads", "sleep-timer", "series"];
const themes = ["dark", "light"];

for (const slug of slugs) {
  for (const theme of themes) {
    const filename = `screenshot-${slug}-${theme}.webp`;
    const image = await readFile(join(imageDir, filename));
    assert.equal(image.subarray(0, 4).toString(), "RIFF", `${filename} is not RIFF`);
    assert.equal(image.subarray(8, 12).toString(), "WEBP", `${filename} is not WebP`);
  }
}

const html = await readFile(join(repoRoot, "dist", "index.html"), "utf8");
const hero = html.match(/<div class="hero__visual"[\s\S]*?<\/section>/)?.[0] ?? "";
const gallery = html.match(/<section class="screenshots band">[\s\S]*?<\/section>/)?.[0] ?? "";

for (const theme of themes) {
  assert(hero.includes(`screenshot-home-${theme}.webp`), `hero is missing Home ${theme}`);
}
assert.equal(
  (gallery.match(/class="screenshot-frame(?: screenshot-frame--featured)?"/g) ?? []).length,
  6
);
for (const slug of slugs) {
  for (const theme of themes) {
    assert(
      gallery.includes(`screenshot-${slug}-${theme}.webp`),
      `gallery is missing ${slug} ${theme}`
    );
  }
}

console.log("Screenshot contract passed: 12 WebPs, Home hero, 6 gallery frames.");
```

- [ ] **Step 2: Add the package script**

Add this exact entry to `scripts` in `package.json`:

```json
"check:screenshots": "npm run build && node scripts/check-screenshots.mjs"
```

- [ ] **Step 3: Run the check to verify it fails**

Run: `npm run check:screenshots`

Expected: FAIL because `screenshot-home-dark.webp` and `screenshot-home-light.webp` do not exist and the hero still references Library.

### Task 2: Export all six WebP pairs from the app pipeline

**Files:**

- Modify: `/Users/clay/Code/github/SideShelf/scripts/screenshots/web.sh`
- Generate: `/Users/clay/Code/github/SideShelf-web/src/assets/images/screenshot-home-dark.webp`
- Generate: `/Users/clay/Code/github/SideShelf-web/src/assets/images/screenshot-home-light.webp`
- Refresh: `/Users/clay/Code/github/SideShelf-web/src/assets/images/screenshot-{player,library-grid,downloads,sleep-timer,series}-{dark,light}.webp`

**Interfaces:**

- Consumes: `.screenshots/raw/<theme>/screenshot-<slug>.png`
- Produces: twelve WebPs in `SideShelf-web/src/assets/images/`

- [ ] **Step 1: Extend the export surface list**

Change `SURFACES` to this exact ordered value and remove the obsolete comment that excludes Home:

```bash
SURFACES=(home player library-grid downloads sleep-timer series)
```

- [ ] **Step 2: Run the converter**

Run from the app repository: `scripts/screenshots/web.sh`

Expected: twelve `OK` lines and a final destination message.

- [ ] **Step 3: Check the generated files**

For every slug/theme pair, check the file exists, `file` identifies WebP data, and `sips` reports `1320 × 2868`.

Expected: all twelve pairs pass.

### Task 3: Render Home plus the six-screen website gallery

**Files:**

- Create: `/Users/clay/Code/github/SideShelf-web/src/_data/screenshots.json`
- Modify: `/Users/clay/Code/github/SideShelf-web/src/index.njk`
- Modify: `/Users/clay/Code/github/SideShelf-web/src/assets/css/style.css`

**Interfaces:**

- Consumes: Eleventy global data array `screenshots`
- Produces: hero Home images plus six `.screenshot-frame` elements in the approved order

- [ ] **Step 1: Define website-local screenshot metadata**

Create `src/_data/screenshots.json` with six objects. Each object has `slug`, `label`, `alt`, and `featured`; only Player has `featured: true`. Use these labels: `Home`, `The player`, `Your shelf`, `Downloaded`, `Sleep timer`, and `Series`.

```json
[
  {
    "slug": "home",
    "label": "Home",
    "alt": "Home view with three audiobook shelves",
    "featured": false
  },
  {
    "slug": "player",
    "label": "The player",
    "alt": "Player showing an audiobook chapter and controls",
    "featured": true
  },
  {
    "slug": "library-grid",
    "label": "Your shelf",
    "alt": "Library grid with 18 audiobook covers",
    "featured": false
  },
  {
    "slug": "downloads",
    "label": "Downloaded",
    "alt": "Downloaded audiobook detail with chapter list",
    "featured": false
  },
  {
    "slug": "sleep-timer",
    "label": "Sleep timer",
    "alt": "Sleep timer counting down during playback",
    "featured": false
  },
  {
    "slug": "series",
    "label": "Series",
    "alt": "Series list with cover art and book counts",
    "featured": false
  }
]
```

- [ ] **Step 2: Switch the hero to Home**

Change the hero dark/light paths in `src/index.njk` from `screenshot-library-grid-*` to `screenshot-home-*`.

- [ ] **Step 3: Replace repeated gallery markup with a loop**

Render one frame per `screenshots` entry. Add `screenshot-frame--featured` only when `screenshot.featured` is true. Generate both theme paths from `screenshot.slug`, use `screenshot.alt` for meaningful image alt text, and render `screenshot.label` below the device.

```njk
{% for screenshot in screenshots %}
<div class="screenshot-frame{% if screenshot.featured %} screenshot-frame--featured{% endif %}">
  <div class="screenshot-frame__device">
    <img class="img-theme-dark" src="/assets/images/screenshot-{{ screenshot.slug }}-dark.webp" alt="{{ screenshot.alt }}" width="1320" height="2868" loading="lazy" decoding="async" />
    <img class="img-theme-light" src="/assets/images/screenshot-{{ screenshot.slug }}-light.webp" alt="{{ screenshot.alt }}" width="1320" height="2868" loading="lazy" decoding="async" />
  </div>
  <p class="screenshot-frame__label">{{ screenshot.label }}</p>
</div>
{% endfor %}
```

- [ ] **Step 4: Make the desktop layout two balanced rows**

Change the desktop grid to three equal columns and keep the existing narrow-screen horizontal scrolling behavior. Do not change the frame aspect ratio or theme swapping rules.

```css
.screenshots__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 28px;
  align-items: start;
}
```

- [ ] **Step 5: Run the screenshot contract check**

Run: `npm run check:screenshots`

Expected: PASS with confirmation for twelve WebPs, the Home hero, and six gallery entries.

### Task 4: Bring the website screenshot documentation up to date

**Files:**

- Modify: `/Users/clay/Code/github/SideShelf-web/SCREENSHOTS_NEEDED.md`

**Interfaces:**

- Consumes: the final pipeline and website asset contract
- Produces: current operator documentation with no obsolete three-screen requirement

- [ ] **Step 1: Rewrite the required screenshot table**

List the six slugs, both theme filenames, the required visible state for each screen, Home's hero usage, and all-six gallery usage. Keep the automated `npm run screenshots` workflow prominent.

- [ ] **Step 2: Remove obsolete manual requirements**

Remove instructions and examples that claim only Library, Player, and Downloads are consumed. Retain manual conversion guidance only if clearly labeled as fallback and complete for all six surfaces.

- [ ] **Step 3: Check documentation and formatting**

Run `git diff --check` in both repositories.

Expected: no whitespace errors.

### Task 5: Verify the complete result

**Files:**

- Verify: all files changed in Tasks 1–4

**Interfaces:**

- Consumes: final source, generated assets, and built website
- Produces: evidence that the approved design is complete without deployment

- [ ] **Step 1: Run the production contract check fresh**

Run from the website repository: `npm run check:screenshots`

Expected: Eleventy build succeeds and the screenshot checker passes.

- [ ] **Step 2: Inspect built HTML**

Confirm `dist/index.html` uses Home in the hero and contains exactly six gallery frames with twelve themed image references.

- [ ] **Step 3: Visually inspect desktop and mobile**

Start the local Eleventy server, inspect the screenshot section at desktop and mobile widths in both themes, and confirm no clipping, overlap, or broken images.

- [ ] **Step 4: Run whole-change hygiene checks**

Run `git diff --check` and `git status --short` in both repositories. Confirm pre-existing website asset/document changes remain included and no unrelated app files changed.

- [ ] **Step 5: Commit intentionally per repository**

Commit the app pipeline change in SideShelf and the website source/assets/docs in SideShelf-web as separate commits, without pushing or deploying.
