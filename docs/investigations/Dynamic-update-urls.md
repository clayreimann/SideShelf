Short version:
Yes, **you _can_ change the URL that `expo-updates` talks to at runtime now**, and you don’t strictly need Cloudflare to get “one TestFlight build, many PRs” anymore. Expo added explicit APIs for this.

---

## 1. Can I change the update URL on the fly?

### a) Change just the channel (recommended, EAS-hosted)

Expo added:

```ts
import * as Updates from "expo-updates";

Updates.setUpdateRequestHeadersOverride({
  "expo-channel-name": "my-preview-channel",
});

await Updates.fetchUpdateAsync();
await Updates.reloadAsync();
```

- `Updates.setUpdateRequestHeadersOverride(...)` lets you override request headers (like `expo-channel-name`) at runtime. ([Expo Documentation][1])
- This is available in **SDK 54** with `expo-updates >= 0.29.0`. ([Expo Documentation][1])

You can ship **one TestFlight build** pointing at the EAS Update URL, then inside the app:

- Provide a hidden “debug / QA” screen.
- Let the tester pick which PR/channel to use (e.g. `pr-123`, `pr-456`).
- Call `setUpdateRequestHeadersOverride({ 'expo-channel-name': 'pr-123' })`.
- `fetchUpdateAsync()` + `reloadAsync()` or ask them to relaunch.

That gives you **“switch between multiple PR builds from the same TestFlight binary”** with no GH Pages, no Cloudflare.

### b) Change the _whole_ update URL (for custom servers like GH Pages)

Expo also added:

```ts
Updates.setUpdateURLAndRequestHeadersOverride({
  url: "https://your-custom-server.example.com/path/to/manifest.json",
  requestHeaders: {},
});
```

- `Updates.setUpdateURLAndRequestHeadersOverride({ url, requestHeaders })` lets you override both the **base update URL** and headers at runtime. ([Expo Documentation][1])
- Available from **SDK 52** (`expo-updates >= 0.27.0`). ([Expo Documentation][1])
- Requires `"expo.updates.disableAntiBrickingMeasures": true` in your app config for that build. ([Expo Documentation][1])

Important caveat:

- When you use this + `disableAntiBrickingMeasures: true`, **expo-updates cannot safely auto-rollback**. If you load a bad update that crashes on startup, users may need to reinstall the app. So Expo explicitly says “preview builds only, not production.” ([Expo Documentation][1])

For your TestFlight “QA client”, that’s probably fine.

---

## 2. How to test multiple PRs from a single TestFlight build

### Option A (most “Expo-native”): EAS Update + channels + PR previews

You can do this entirely with EAS, no GH Pages:

1. **One TestFlight build**:
   - `updates.url` points to EAS (default `https://u.expo.dev/...`).
   - Channel baked in (e.g. `"default"` or `"preview"`).

2. **GitHub Action publishes a preview update per PR**
   Expo’s “GitHub Action for PR previews” shows a workflow where every PR runs `eas update --auto`, and the action comments on the PR with info + QR code. ([Expo Documentation][2])

   You can tweak that to publish each PR to a unique channel, e.g. `pr-123`, `pr-456`, etc.

3. **In-app “PR picker” using header override**:
   - Hidden screen that lists “PR 123”, “PR 456”, etc.

   - When user selects one:

     ```ts
     Updates.setUpdateRequestHeadersOverride({ "expo-channel-name": "pr-123" });
     await Updates.fetchUpdateAsync();
     await Updates.reloadAsync();
     ```

   - Now that **same TestFlight build** is effectively pinned to the PR’s channel.

This is exactly the use case Expo calls out: allowing non-technical stakeholders to flip between preview channels from the same build. ([Expo Documentation][1])

Pros for you:

- No custom server to maintain.
- No anti-bricking footguns.
- You get EAS dashboard, history, rollbacks, etc.

---

### Option B: Self-host on GitHub Pages and switch per-PR URL

If you really want GH Pages as a backing store:

1. **You need a server that speaks the expo-updates protocol**

`expo-updates` doesn’t care _who_ hosts the manifest/assets, but it does expect a specific manifest/asset shape. The default EAS Update service implements this protocol. ([Expo Documentation][3])

To use GH Pages:

- For each PR, generate a manifest + assets bundle that matches expo-updates’ expectations.
- Host them statically at something like:
  - `https://<username>.github.io/<repo>/updates/pr-123/manifest.json`
  - `https://<username>.github.io/<repo>/updates/pr-123/assets/...`

2. **In TestFlight build (preview client)**:
   - Configure `"updates.disableAntiBrickingMeasures": true` for this QA build. ([Expo Documentation][1])

3. **In your debug screen**:

   ```ts
   function switchToPR(prNumber: string) {
     const url = `https://<username>.github.io/<repo>/updates/pr-${prNumber}/manifest.json`;

     Updates.setUpdateURLAndRequestHeadersOverride({
       url,
       requestHeaders: {}, // or any extra headers if you need them
     });

     alert("Close and reopen the app to load the new PR build.");
   }
   ```

   From the docs: the new URL is only used after the app is killed and relaunched. ([Expo Documentation][1])

4. **Automation**
   - GitHub Action per PR: build the bundle/manifest, push to `gh-pages` at the appropriate path.
   - Your app’s debug UI needs to know the mapping from PR → URL (could be a static mapping, or fetched from some small JSON index you also host on GH Pages).

**Downsides:**

- You lose all of the EAS Update niceties (dashboard, channel management, etc.).
- You must implement your own “update server” semantics (even if static).
- No built-in rollbacks or safety rails (and anti-bricking is disabled).

---

## 3. Where would Cloudflare fit in?

You _could_ use a small Cloudflare Worker as a smart front door:

### Scenario 1: Proxy to EAS Update (officially supported)

Expo has first-class “request proxying” support: you set `updateManifestHostOverride` and `updateAssetHostOverride` in `eas.json` so that all update traffic goes through your proxy, which then forwards to `u.expo.dev` and `assets.eascdn.net`. ([Expo Documentation][4])

A Cloudflare Worker is a perfect implementation of that:

- Worker receives the request from the app.
- Optionally logs, injects headers, filters, etc.
- Forwards to the real EAS origin.
- Responds back to the app.

This is more about **observability/security** than changing URLs per PR; you’d still use channels + `setUpdateRequestHeadersOverride` for that.

### Scenario 2: Proxy to GitHub Pages & map PRs → paths

If you insist on GH Pages but want a single `updates.url` baked into the app:

- Build points to `https://updates.yourdomain.com/manifest` (Cloudflare Worker).
- The Worker:
  - Looks at a header like `x-pr-id` or `expo-channel-name`.
  - Maps that to the corresponding GH Pages URL for the manifest, e.g. `/updates/pr-123/manifest.json`.
  - Fetches that from GH Pages and returns it.

In your app:

```ts
Updates.setUpdateRequestHeadersOverride({
  "x-pr-id": "123", // or use expo-channel-name the same way
});
await Updates.fetchUpdateAsync();
await Updates.reloadAsync();
```

This keeps the “override only headers” approach on the client side and pushes the URL routing logic into the Worker. Conceptually similar to the EAS proxying doc, just with GH Pages as origin instead of EAS. ([Cloudflare Docs][5])

But again: this is more moving parts than just using EAS Update directly.

---

## 4. What I’d recommend for your goal

Given your goal is:

> Test multiple PRs from the same TestFlight build and avoid rebuilding for every PR.

I’d strongly recommend:

1. **Upgrade to at least SDK 54 / expo-updates 0.29.0** if you aren’t already, to use header overrides. ([Expo Documentation][1])
2. **Use EAS Update with PR previews** (GitHub Action) for each PR. ([Expo Documentation][2])
3. Ship **one “preview” TestFlight client** that:
   - Has EAS Update configured.
   - Includes a hidden “channel/PR picker” screen that calls `setUpdateRequestHeadersOverride` + `fetchUpdateAsync` + `reloadAsync`.

That hits your “one TestFlight, many PRs” requirement with minimal custom infrastructure. GH Pages + Cloudflare is totally doable, but at that point you’re basically re-implementing EAS Update when Expo is already solving exactly this problem for you.

If you want, I can sketch a concrete `DebugUpdatesScreen.tsx` for Expo that:

- Lists channels like `pr-123`, `pr-456`
- Shows the currently active channel
- Lets you tap to switch and reload.

[1]: https://docs.expo.dev/eas-update/override/ "Override update configuration at runtime - Expo Documentation"
[2]: https://docs.expo.dev/eas-update/github-actions "Github Action for PR previews - Expo Documentation"
[3]: https://docs.expo.dev/versions/latest/sdk/updates/?utm_source=chatgpt.com "Updates - Expo Documentation"
[4]: https://docs.expo.dev/eas-update/request-proxying/ "Request proxying - Expo Documentation"
[5]: https://developers.cloudflare.com/workers/examples/cors-header-proxy/?utm_source=chatgpt.com "CORS header proxy · Cloudflare Workers docs"

---

Short answer:

- **Scenario 2 only needs `disableAntiBrickingMeasures: true` if you actually use `setUpdateURLAndRequestHeadersOverride`.**
- If you keep the update URL fixed (pointing at your Cloudflare Worker) and only vary **headers**, you **do not** need to disable anti-bricking.
- Rollback to the shipped bundle is only “first-class” if you **don’t** disable anti-bricking and you either:
  - use EAS Update’s rollback features, or
  - implement the `rollBackToEmbedded` directive yourself on your custom server.

Let’s break that down in your terms.

---

## 1. Does Scenario 2 require `disableAntiBrickingMeasures: true`?

There are two different knobs:

1. **Override _headers_ only**
   `Updates.setUpdateRequestHeadersOverride({...})` (SDK 54 / expo-updates 0.29+) lets you change things like `expo-channel-name` or a custom `x-pr-id` header at runtime. It does **not** require any special flags and is safe for production. ([Expo Documentation][1])

2. **Override _URL + headers_**
   `Updates.setUpdateURLAndRequestHeadersOverride({ url, requestHeaders })` changes the update URL itself at runtime and **does** require `"expo.updates.disableAntiBrickingMeasures": true`. ([Expo Documentation][1])

The docs are very explicit:

> When you override the update URL/headers with `setUpdateURLAndRequestHeadersOverride` and set `disableAntiBrickingMeasures: true`, **embedded updates are effectively disabled**, so there is nothing to automatically roll back to if the new update crashes. ([Expo Documentation][1])

So for your **Scenario 2: Cloudflare Worker → GitHub Pages**:

### Option 2A – No anti-bricking flag needed (recommended for this scenario)

- Build-time `updates.url` → `https://updates.yourdomain.com` (the Worker).

- At runtime you call:

  ```ts
  Updates.setUpdateRequestHeadersOverride({ "x-pr-id": "123" });
  ```

- The Worker reads `x-pr-id` and proxies to the corresponding GH Pages manifest path:
  - e.g. `/updates/pr-123/manifest.json`

From Expo’s point of view, the URL is still constant, only headers change. That fits the “override request headers” section and **does not** need `disableAntiBrickingMeasures`. ([Expo Documentation][1])

### Option 2B – Per-PR URL override (requires `disableAntiBrickingMeasures: true`)

If instead you do something like:

```ts
Updates.setUpdateURLAndRequestHeadersOverride({
  url: `https://username.github.io/repo/updates/pr-123/manifest.json`,
  requestHeaders: {},
});
```

…then yes, you **must** set:

```jsonc
{
  "expo": {
    "updates": {
      "disableAntiBrickingMeasures": true,
    },
  },
}
```

And that **does** turn off embedded-update rollback safety nets. ([Expo Documentation][1])

So: **Scenario 2 _as we described it (proxy + header routing)_ does _not_ have to use `disableAntiBrickingMeasures`.** You only hit that flag if you choose per-PR URL override on the client.

---

## 2. What does rollback look like in Scenario 2?

There are two “layers” of rollback:

1. **Client-side anti-bricking / embedded fallback** (built into expo-updates)
2. **Server-driven rollbacks** (EAS CLI or your own server directives)

### 2.1 Client-side anti-bricking (when `disableAntiBrickingMeasures` is _false_)

With normal settings (no `disableAntiBrickingMeasures`):

- `expo-updates` keeps a local DB of updates.
- It always tries to launch the most recent “good” update.
- If a new update fails to launch, it can fall back to a previous update or even the embedded bundle (an “emergency launch”). ([Expo Documentation][2])

This logic lives entirely on device and doesn’t care whether the server is EAS, Cloudflare, or GH Pages, as long as the protocol is respected.

So in **Scenario 2A (header-only, constant URL)**:

- Anti-bricking still works.
- If a GH Pages bundle is bad and crashes on first launch, expo-updates can revert to the last known working update or embedded without you doing anything special.

In **Scenario 2B (URL override + `disableAntiBrickingMeasures: true`)**:

- That auto-rollback behavior is explicitly disabled.
- A broken update that crashes before JS runs can brick that install; users would need to reinstall. ([Expo Documentation][1])

---

## 3. Can you expose a “Rollback to shipped bundle” toggle?

### Short version

- There is **no official JS API** like `Updates.rollbackToEmbeddedAsync()` you can call from inside the app.
- Rollback to embedded is normally done by:
  - EAS sending a `rollBackToEmbedded` directive, driven by `eas update:rollback`, or ([Expo Documentation][3])
  - The client auto-falling back in an emergency (crash) situation. ([Expo Documentation][2])

So any in-app “Reset to shipped bundle” button you expose would have to work **via your server**, not directly via an Expo JS API.

### 3.1 If you stay on EAS Update

For completeness:

- With EAS as your backend, rollbacks are done using:

  ```bash
  eas update:rollback
  ```

  Which can target:
  - A previously published update, or
  - The embedded update. ([Expo Documentation][3])

- That sends a `rollBackToEmbedded` directive to clients, and expo-updates switches to the embedded bundle on next launch. ([Expo Documentation][4])

You _could_ wire some admin UI so that clicking “Reset to shipped bundle” hits a backend endpoint that runs `eas update:rollback`, but that’s outside the app itself.

### 3.2 In your custom Cloudflare + GH Pages setup

If you build your own protocol-compatible server (Worker):

- The Expo Updates spec defines a `rollBackToEmbedded` directive type that tells the client to use the embedded bundle instead of any downloaded updates. ([Expo Documentation][4])
- EAS uses this directive under the hood; your Worker is free to emit it too.

So a possible flow for your preview TestFlight client:

1. **Keep `disableAntiBrickingMeasures: false` and constant `updates.url = https://updates.yourdomain.com`.**
2. Implement a **“Reset to shipped bundle”** button that:
   - Sets some header or query param, like `x-updates-mode: rollback-to-embedded`.

3. In the Cloudflare Worker:
   - If it sees that header, it returns a multipart response with a `directive` part of type `rollBackToEmbedded` (per spec).

4. On next launch, expo-updates processes that directive and runs the embedded bundle.

This gives you a genuine “rollback to binary” without turning off anti-bricking. But:

- You’re now fully in **“I run my own Expo Updates server”** territory: you need to follow the spec carefully (multipart, directives, etc.). ([Expo Documentation][4])
- That’s a lot of complexity compared to just using EAS.

### 3.3 What if you _do_ use `disableAntiBrickingMeasures: true`?

If you go down the URL-override path:

- Docs say that combining `setUpdateURLAndRequestHeadersOverride` + `disableAntiBrickingMeasures: true` **disables embedded updates**, so there’s literally nothing for expo-updates to roll back to. ([Expo Documentation][1])
- You cannot safely guarantee a “rollback to shipped bundle” toggle in that configuration. The only “rollback” is:
  - Ship a new good update from the same overridden server URL and hope it loads, or
  - Ask testers to uninstall/reinstall from TestFlight/App Store if things went really bad.

You might _try_ to “repoint” back to the original EAS URL with another call to `setUpdateURLAndRequestHeadersOverride`, but:

- That only works if JS gets to run at all.
- If the bad update crashes before JS, you never get to execute that fix.

So if that recovery story makes you nervous (I suspect it will), you probably don’t want to rely on `disableAntiBrickingMeasures` even in preview.

---

## 4. Practical recommendation for what you want

Given your goals (one TestFlight build, multiple PRs, and the ability to un-brick or roll back):

- **Best safety / lowest effort:**
  - Stick with standard EAS Update hosting.
  - Use **channels per PR** + `setUpdateRequestHeadersOverride` to switch PRs at runtime from a debug menu.
  - Use `eas update:rollback` (including rollback to embedded) for “oh no” moments. ([Expo Documentation][1])

- **If you _really_ want** GH Pages + Cloudflare Worker:
  - Design it as **constant URL + header-based routing** (Scenario 2A), not URL override on the client.
  - Keep `disableAntiBrickingMeasures: false` so embedded fallback still exists.
  - Optionally implement the `rollBackToEmbedded` directive in the Worker if you want a true “Reset to shipped bundle” button.
  - Accept that you’re now running your own (simplified) Expo Updates server.

If you tell me which Expo SDK you’re on and whether you’re comfortable implementing the spec in a Worker, I can sketch:

- The exact Worker code shape for header-based PR routing, and
- How a `rollBackToEmbedded` response would look for that “reset” toggle.

[1]: https://docs.expo.dev/eas-update/override/ "Override update configuration at runtime - Expo Documentation"
[2]: https://docs.expo.dev/versions/latest/sdk/updates/?utm_source=chatgpt.com "Updates - Expo Documentation"
[3]: https://docs.expo.dev/eas-update/rollbacks/?utm_source=chatgpt.com "Rollbacks"
[4]: https://docs.expo.dev/technical-specs/latest/ "Expo Updates v1 - Expo Documentation"
