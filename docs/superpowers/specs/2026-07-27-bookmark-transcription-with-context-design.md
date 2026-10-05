# Bookmark Transcription with Context

**Status:** Approved
**Date:** 2026-07-27
**Target:** Post-1.0 SideShelf
**Primary platforms:** iOS and Android

## Summary

SideShelf will turn audiobook bookmarks into private, editable text passages by transcribing bounded audio around each bookmark on the device. The feature will work only with downloaded audiobook audio. It will not upload audiobook excerpts or transcript text to Audiobookshelf, SideShelf infrastructure, or a third-party transcription service.

The initial release will support automatic transcription after bookmark creation and explicit batch transcription for existing bookmarks. Automatic transcription is globally opt-in and disabled by default. Work is queued persistently but runs only while the app is foregrounded, playback is idle, and device conditions are safe.

SideShelf will normally transcribe reusable windows around bookmarks. A feasibility phase will also benchmark progressive whole-item transcription with word-level timestamps. When calibration predicts that the current device, model, language, and audiobook can complete whole-item indexing within ten minutes, SideShelf may finish the rest of the item after prioritizing the current bookmark. Subsequent bookmarks within completed coverage are then instantaneous. Slower combinations remain window-based.

The user experience will preserve the existing bookmark list. Each bookmark may show a one-line transcript preview or processing status. A dedicated Bookmark Passages screen will handle reading, editing, regeneration, batch actions, and Markdown export. A later wave will add manual export boundaries behind a **Fine-tune clip** control.

## Problem

An audiobook bookmark records an exact playback position, but a timestamp and short title rarely preserve why that moment mattered. Returning later requires seeking, listening, and reconstructing the surrounding thought.

SideShelf already has the information needed to improve this:

- the bookmark's absolute item position;
- ordered audio-file metadata and durations;
- local paths for downloaded audio;
- persistent local bookmark storage;
- a cross-platform Expo development-build workflow.

Continuous transcription is unnecessary. SideShelf can decode only the required audio ranges, transcribe them locally, preserve word timestamps, and project readable passages back onto bookmarks. When whole-item transcription proves fast enough, the same segment store can become a complete reusable transcript index.

## Goals

1. Generate readable context around audiobook bookmarks without sending audio or text off-device.
2. Support downloaded audiobook files on both iOS and Android.
3. Provide a fast first passage while reusing prior work for later bookmarks.
4. Support English-optimized and multilingual Whisper models.
5. Preserve progress across interruption, app termination, and retry.
6. Protect user corrections from automatic overwrite.
7. Export selected passages as deterministic Markdown.
8. Remain compatible with SideShelf's planned server/account ownership model.
9. Measure whole-item transcription rather than assuming it is too slow or always preferable.

## Non-goals

The initial program does not include:

- cloud transcription or a SideShelf transcription backend;
- transcription of streamed or temporarily downloaded audio;
- transcript synchronization to Audiobookshelf or another device;
- raw audiobook audio export;
- a full-book transcript reader, full-text search, or semantic search;
- summarization, quotation analysis, or other generative-AI features;
- user-imported model or tokenizer files;
- reliable background transcription;
- speaker identification;
- podcast episode bookmarks until stable episode bookmark identity and server API support are separately designed.

## Prerequisites

This feature follows SideShelf's post-1.0 dependency-upgrade critical path. Implementation may assume versions supported by the selected React Native ExecuTorch release, including:

- React Native New Architecture;
- a compatible Expo and React Native combination;
- the minimum iOS and Android versions required by that release;
- physical-device release-build validation.

At the time of this design, React Native ExecuTorch 0.9 documents support for Expo SDK 54, React Native 0.81, the New Architecture, iOS 17, and Android 13. These requirements must be revalidated when implementation starts. The transcription feature must not independently perform or conceal the broader dependency and minimum-OS upgrade.

Server, account, and item ownership must use SideShelf's canonical multi-server identity once available. If that work has not landed, the implementation must introduce a compatible owner-key boundary rather than another unrelated identity scheme.

## Product Decisions

### Privacy boundary

- Audio decoding and speech recognition occur entirely on the device.
- Transcript text stays in SideShelf's local database.
- Transcription logs contain timing, ranges, model identifiers, and error codes, but never audio samples or transcript text.
- The only network operation introduced by this feature is an explicit model download.
- First-use copy clearly states that audiobook audio does not leave the device.

### Audio eligibility

- Initial transcription requires the relevant audiobook files to be downloaded.
- SideShelf does not silently download missing files or ranges.
- Existing transcript text remains readable and exportable after audio is removed.
- Preview, fine tuning, and retranscription remain unavailable until compatible audio is downloaded again.

### Triggering work

The same queue accepts requests from:

1. automatic transcription after a new bookmark;
2. explicit transcription of one bookmark;
3. batch transcription of missing passages for an item;
4. retry or regeneration;
5. later-wave custom export ranges;
6. adaptive whole-item coverage.

Automatic transcription is a global preference, disabled by default. Explicit actions remain available regardless of that preference.

### Context windows

The initial release offers:

- ±30 seconds;
- ±60 seconds, the default;
- ±90 seconds.

These values describe the requested context around the canonical bookmark position. SideShelf may decode a bounded guard band beyond the requested range so the final passage begins and ends at complete sentence boundaries. A missing or unreliable punctuation boundary must not expand work without limit; the assembler falls back to the bounded requested text and records that the boundary was approximate.

### Language and models

International audiobook support uses standard multilingual Whisper variants. It does not require user-supplied models.

Language resolution order is:

1. a user's per-book override;
2. Audiobookshelf item or audio-file language metadata;
3. a one-time per-book prompt when the language is missing, conflicting, or unsupported.

The app interface language is never assumed to be the audiobook language.

The first feasibility phase compares the smallest relevant candidates:

- Whisper Tiny English and Tiny multilingual;
- Whisper Base English and Base multilingual.

SideShelf ships the smallest candidate for each language profile that satisfies passage-quality, timestamp, resource, and latency gates. If no candidate satisfies the gates, the user-facing release does not proceed with a knowingly poor default. Larger models can be evaluated later without changing the storage or engine boundary.

Models are downloaded explicitly rather than bundled. Users can replace or remove an installed model without deleting completed transcript text.

## User Experience

### Settings

Settings adds a **Bookmark Transcription** section containing:

- **Automatic transcription**, off by default;
- **Default context**, with ±30, ±60, and ±90-second choices;
- **Model**, showing language capability, installed version, and storage use;
- model download, replacement, and removal actions;
- default language behavior;
- **Delete all transcript data**.

First use explains local processing and storage cost before offering the English-optimized or multilingual model. Download progress, checksum verification, cancellation, failure, and insufficient-storage states are visible.

### Existing bookmark list

The item-detail bookmark list remains the primary summary. A bookmark row may show:

- a one-line passage preview when complete;
- **Queued until playback pauses**;
- processing progress;
- a specific blocked reason, such as missing model or downloaded audio;
- a retry action after failure.

Existing tap-to-seek and rename/delete behavior remains intact. Transcript actions must not overload the existing bookmark options menu with unrelated queue administration.

The section includes one **Open Bookmark Passages** entry with the number of ready or pending passages.

### Bookmark Passages screen

The dedicated screen supports:

- transcribing missing passages;
- selecting one, several, or all bookmarks;
- reading a full generated passage;
- editing passage text;
- resetting an edit to generated text;
- retrying or regenerating;
- exporting selected passages as Markdown;
- viewing clear queued, processing, blocked, failed, and complete states.

User-edited passages are visibly marked. Regeneration warns before replacing an edit and only does so after explicit confirmation.

### Export

Markdown export uses corrected text when present and generated text otherwise. Selected passages appear in item-time order.

Each document contains:

- book title;
- author when available;
- bookmark title;
- absolute item position;
- passage context range;
- passage text.

Model and engine diagnostics do not appear in the human-facing document. Markdown control characters from metadata or transcript text are escaped so the output is deterministic and valid.

Example shape:

```markdown
# Example Audiobook

## A useful warning — 04:00:02

Context: 03:59:18–04:01:24

> The speaker explains why the earlier assumption was incomplete and identifies the missing constraint.
```

Exporting raw audiobook audio is out of scope.

### Later wave: Fine-tune clip

An individual passage's export flow adds **Fine-tune clip**.

The default view shows:

- the selected range;
- a fixed marker for the canonical bookmark position;
- total duration;
- audio preview;
- **Fine-tune clip**.

Expanding fine tuning reveals:

- exact start and end timestamps;
- accessible decrement/increment controls;
- editable timestamp values;
- a way to collapse the controls again.

Dragging remains available for speed, but every drag interaction has a keyboard and screen-reader-accessible alternative. Changing passage boundaries never changes the bookmark's canonical position.

The final action is **Export passage**, not audio export. Extending beyond existing transcript coverage queues only the missing range, then assembles the passage.

## Architecture

### Selected approach

The production architecture uses:

- React Native ExecuTorch for on-device Whisper inference;
- an Expo native module for bounded audio decoding;
- AVFoundation/`AVAssetReader` on iOS;
- `MediaExtractor` and `MediaCodec` on Android;
- Expo-compatible model resource fetching;
- SQLite/Drizzle for queue, coverage, passage, and installation metadata.

`whisper.rn` remains an implementation fallback if the feasibility phase proves that ExecuTorch cannot satisfy build, accuracy, performance, or memory gates. Cloud recognition and platform-specific speech APIs are not equivalent fallbacks because they violate either the local-only or cross-platform contract.

### Main components

#### `TranscriptQueueService`

Owns persistent job scheduling and state transitions. It:

- accepts automatic, batch, retry, export, and coverage-fill requests;
- enforces one active transcription job globally;
- prioritizes a newly requested bookmark passage over whole-item fill;
- pauses for playback, app backgrounding, low-power mode, thermal pressure, or low storage;
- checkpoints after each completed segment;
- resumes abandoned work after startup.

It is a service-layer singleton and uses entity-specific database helpers. It does not write Drizzle queries inline or import the database helper barrel.

#### `AudioRangePlanner`

A pure planning component that:

- maps absolute item time to ordered downloaded audio files;
- handles windows crossing audio-file boundaries;
- subtracts existing compatible transcript coverage;
- merges overlapping or nearly adjacent work;
- adds bounded sentence guard bands;
- emits ordered local file spans and absolute item offsets.

#### `BookmarkAudioClip` native module

The native module:

- seeks and decodes only requested spans;
- converts output to 16 kHz mono PCM;
- emits bounded chunks suitable for Whisper;
- reports source timestamps and file boundaries;
- supports cancellation between chunks;
- never decodes a whole audiobook into memory.

Whole-item transcription walks the item sequentially through the same bounded interface.

#### `TranscriptionEngine`

A small application-owned interface wraps `SpeechToTextModule`. It:

- loads and unloads the selected model;
- validates model and tokenizer checksums;
- accepts bounded 16 kHz PCM;
- requests verbose word timestamps;
- records engine/model versions;
- hides library-specific APIs from queue and UI code.

The first release uses curated built-in ExecuTorch Whisper exports. The interface and model manifest preserve the ability to use SideShelf-curated compatible Whisper `.pte` exports later, but arbitrary user model import is not exposed.

#### `TranscriptAssembler`

A pure component that:

- converts chunk-relative word times to absolute item time;
- deduplicates words in chunk overlap;
- maintains monotonic timestamps across file boundaries;
- persists generated segments;
- projects the requested bookmark passage;
- selects complete sentence boundaries;
- uses protected edited text when exporting.

## Processing Flow

1. Resolve server, account, item, bookmark position, language, and selected model.
2. Verify that the model is installed and the required audio is downloaded.
3. Query compatible transcript coverage for the current audio fingerprint.
4. Return immediately if the requested passage can be projected from existing coverage.
5. Plan only missing ranges.
6. Merge overlapping or near-adjacent requests.
7. Decode bounded PCM chunks sequentially.
8. Transcribe with verbose word timestamps.
9. Normalize and deduplicate absolute word times.
10. Persist each segment immediately.
11. Project and store the bookmark passage.
12. Continue optional whole-item fill only when eligibility and resource gates still pass.

Playback has priority. When playback starts, SideShelf allows the current bounded segment to finish, checkpoints it, pauses the job, and unloads the model. Playback is never delayed waiting for transcription cleanup.

## Adaptive Whole-item Transcription

Whole-item and bookmark-window transcription share the same pipeline and segment store.

Before choosing a strategy, SideShelf records throughput for the current device, model, language profile, and decoder using a short representative calibration sample. It combines that throughput with uncovered item duration.

Whole-item indexing is eligible only when:

- projected completion is ten minutes or less;
- the current bookmark's requested window is processed first;
- sufficient storage is available;
- the device is not in low-power mode;
- thermal state is safe;
- the app remains foregrounded and playback remains idle.

If any condition fails, SideShelf uses bookmark-window coverage. A later calibration may reconsider future work, but it does not discard completed segments.

Whole-item work:

- proceeds sequentially;
- checkpoints after every segment;
- skips existing compatible coverage;
- can be cancelled or paused;
- resumes without reprocessing completed segments;
- makes later bookmarks instantaneous when their passage range is covered.

The strategy is initially an internal optimization rather than another user preference.

## Persistence Model

Database access follows the repository rule that all reads and writes live in `src/db/helpers/`.

### `transcription_jobs`

Stores:

- job ID;
- server/account/item ownership;
- scope: bookmark window, batch window, custom export range, or whole item;
- priority;
- requested start and end;
- language and model identity;
- status;
- next checkpoint;
- attempt count;
- structured blocked or failure reason;
- creation and update timestamps.

Statuses are:

- `pending`;
- `blocked`;
- `processing`;
- `paused`;
- `complete`;
- `failed`;
- `cancelled`.

### `transcript_segments`

Each row represents one bounded generated segment and stores:

- server/account/item ownership;
- audio fingerprint;
- absolute start and end;
- language;
- model and engine versions;
- decoder version;
- generated text;
- word timestamps serialized as bounded JSON;
- creation timestamp.

The table is indexed for overlap queries by owner, item, compatibility identity, start, and end. Segment-sized JSON avoids a row per word while allowing SideShelf to load only overlapping coverage. A ten-hour audiobook should produce bounded segment rows, not one enormous transcript blob.

### `bookmark_passages`

Stores:

- server/account/item ownership;
- stable bookmark time;
- requested context preset or custom boundaries;
- compatible segment/model identity;
- generated passage text;
- optional user-edited text;
- boundary quality;
- state and timestamps.

Bookmark linkage uses item identity plus bookmark time rather than the current synthetic bookmark ID, which may change when a title changes.

### `model_installations`

Stores:

- model ID and version;
- English or multilingual capability;
- model and tokenizer checksums;
- engine compatibility version;
- expected and actual size;
- local paths;
- installation state and timestamps.

Model binaries live outside SQLite in an application-owned directory, are excluded from device backup, and are activated only after checksum verification.

## Audio Fingerprint and Invalidation

Transcript coverage is derived from a specific ordered audio source. The fingerprint hashes stable source facts, including:

- ordered audio-file identities;
- inode/source identifiers;
- sizes;
- modification times;
- durations.

Ephemeral iOS container paths and current download locations are excluded.

When the fingerprint changes:

- generated segment coverage becomes incompatible;
- queued jobs are replanned;
- generated passages can be regenerated;
- user-edited passage text is preserved until explicit reset;
- old generated coverage is eligible for cleanup.

## Lifecycle and Retention

- Deleting a bookmark deletes its passage and protected edit.
- Reusable transcript segments remain cached after bookmark deletion.
- Removing local audio preserves completed transcript text and export.
- Removing a model preserves completed transcripts.
- Removing an item, account, or server removes its jobs, segments, passages, and edits.
- **Delete all transcript data** removes transcript jobs, segments, passages, and edits, but does not delete bookmarks or downloaded audio.
- Model storage is managed separately so users can reclaim model space without losing text.
- Cache cleanup never removes protected passage edits without explicit user action.

## Error and Recovery Behavior

The queue distinguishes transient, blocked, and terminal failures.

Transient failures, such as temporary model-load or native decoder errors, retry with capped backoff.

Blocked work waits for user or device state:

- model missing;
- audio missing;
- insufficient storage;
- low-power mode;
- unsafe thermal state;
- playback active;
- app backgrounded.

Terminal failures include unsupported or corrupt audio, incompatible model artifacts, and repeated deterministic decoder failure.

Recovery rules:

- every segment is committed before advancing the checkpoint;
- startup returns abandoned `processing` jobs to `pending`;
- cancellation keeps completed reusable segments but removes unstarted work;
- model downloads are atomic and checksum-verified;
- partial model files are never treated as installed;
- starting playback pauses transcription promptly;
- user edits are never overwritten by retry, model upgrade, or automatic regeneration.

## Performance and Quality Gates

### Feasibility corpus

The spike must include:

- single-file M4B/AAC;
- single-file MP3;
- multi-file MP3;
- VBR audio;
- mono and stereo sources;
- a range crossing an audio-file boundary;
- representative clean narration;
- English and at least one validated non-English audiobook language.

### Measurements

Capture:

- model download and installed size;
- model load and unload time;
- bounded decode throughput;
- transcription real-time factor;
- time to first bookmark passage;
- projected and actual whole-item completion time;
- peak resident memory;
- thermal-state changes;
- battery impact;
- transcript storage per hour;
- cancellation latency;
- checkpoint/resume correctness;
- timestamp drift;
- human-reviewed passage accuracy.

### Release gates

- First bookmark passage completes within 30 seconds on baseline supported hardware.
- Whole-item strategy is chosen only when projected completion is ten minutes or less.
- No out-of-memory termination or serious thermal state occurs in accepted flows.
- Playback starts without an audible glitch and preempts transcription.
- Absolute word timestamps remain monotonic across chunks and audio-file boundaries.
- Human reviewers judge at least 90% of validation passages usable without correction that changes meaning.
- Sentence boundaries are coherent or explicitly fall back to bounded approximate context.
- No transcription network request occurs after model installation.
- No transcript or audio content appears in normal logs or diagnostic exports.

If Tiny satisfies quality gates, it is preferred for storage and performance. Base is selected only when its material quality improvement still satisfies latency and resource gates. If neither candidate passes, the feature remains behind the development gate.

## Testing Strategy

### Pure unit tests

- absolute item time to audio-file span mapping;
- ranges before zero and beyond item duration;
- cross-file windows;
- overlap and near-adjacent merging;
- coverage subtraction;
- chunk timestamp normalization;
- overlap-word deduplication;
- sentence-boundary projection and fallback;
- whole-item completion projection;
- audio fingerprint stability and invalidation;
- job transition legality;
- user-edit overwrite protection;
- deterministic Markdown ordering and escaping.

### Database and migration tests

- all new schema is applied through bundled Drizzle migrations;
- overlap indexes support expected queries;
- jobs resume after simulated termination;
- server/account/item ownership cannot leak;
- item/account/server removal cleans records in dependency order;
- removing a model does not delete transcript text;
- deleting a bookmark preserves reusable segments;
- audio fingerprint changes isolate incompatible coverage.

### Native tests

Native fixtures verify:

- supported container and codec combinations;
- exact bounded seek behavior;
- 16 kHz mono output;
- chunk duration and item offsets;
- cancellation;
- file-boundary transitions;
- corrupt and unsupported source errors;
- no whole-file memory growth.

### Integration tests

- automatic bookmark request to completed preview;
- explicit batch request with overlapping windows;
- partial coverage promoted to whole-item coverage;
- model missing, audio missing, and storage blocked states;
- playback interruption and later resume;
- app restart during model download, decode, and transcription;
- edited passage export and guarded regeneration;
- audio deletion, redownload, and fingerprint match/mismatch;
- model replacement with separate compatible coverage.

### Physical-device acceptance

Run release builds on:

- the oldest supported iOS baseline available;
- a representative current iPhone;
- an Android 13 baseline device;
- a representative current Android device.

Simulator success is not sufficient for model inference, native decode, memory, thermal, battery, or playback-preemption claims.

## Phased Delivery

### Phase 0: feasibility and benchmark spike

- integrate React Native ExecuTorch in an isolated development path;
- use short pre-extracted fixtures first;
- validate English and multilingual word timestamps;
- benchmark Tiny and Base;
- progressively transcribe representative whole items;
- record the required performance and quality evidence;
- confirm final engine/model choices.

This phase produces evidence and throwaway experiment code. It does not add user-facing settings or permanent database schema.

### Phase 1: production audio and model foundation

- build the bounded cross-platform decoder module;
- add the application-owned `TranscriptionEngine`;
- implement model manifest, download, checksum, removal, and backup exclusion;
- prove cancellation and playback-safe unload.

### Phase 2: persistence and orchestration

- add schema, helpers, and migrations;
- implement range planning, segment assembly, persistent jobs, recovery, and resource gates;
- implement reusable partial coverage and adaptive whole-item fill;
- verify server/account ownership.

### Phase 3: initial user-facing release

- add settings and first-use model setup;
- add hybrid bookmark previews;
- add Bookmark Passages;
- add protected editing, retry/regeneration, selection, and Markdown export;
- complete accessibility, localization, and physical-device acceptance.

### Phase 4: Fine-tune clip

- add manual range handles;
- add preview;
- add precise timestamp and step controls behind **Fine-tune clip**;
- transcribe only missing extended coverage;
- export the adjusted passage without changing the bookmark.

Each phase requires its own implementation plan and completion evidence. Failure of an earlier gate blocks later phases rather than being hidden behind fallback behavior.

## Accessibility and Localization

- Status is expressed with text, not color alone.
- Drag handles have labeled start/end controls and non-drag alternatives.
- Processing progress and blocked reasons are announced without excessive live-region updates.
- Dynamic type does not clip model sizes, timestamps, buttons, or passages.
- Screen-reader focus remains stable when a job status changes.
- Transcript editing uses the established accessible modal/screen patterns.
- User-facing strings are localized from the initial release.
- Audiobook language selection is independent of interface localization.

## Security, Privacy, and Copyright

- Model URLs and checksums are curated application data, not user-entered executable sources.
- Model activation requires checksum and compatibility validation.
- Audio PCM is held only for bounded active work and is released promptly.
- Temporary PCM or clip files are avoided; if a platform adapter requires one, it is stored in cache, excluded from backup, and deleted on success, failure, cancellation, and startup cleanup.
- Export is transcript text only.
- First-use and settings copy disclose local model storage and local-only processing.
- Privacy testing verifies that no audio or transcript content reaches logs, diagnostics, analytics, or network requests.

## Technical Basis

The design is based on the following current primary sources and must be revalidated at implementation time:

- [React Native ExecuTorch: Getting Started](https://docs.swmansion.com/react-native-executorch/docs/fundamentals/getting-started)
- [React Native ExecuTorch: Compatibility](https://docs.swmansion.com/react-native-executorch/docs/other/compatibility)
- [React Native ExecuTorch: SpeechToTextModule](https://docs.swmansion.com/react-native-executorch/docs/typescript-api/natural-language-processing/SpeechToTextModule)
- [React Native ExecuTorch: useSpeechToText](https://docs.swmansion.com/react-native-executorch/docs/hooks/natural-language-processing/useSpeechToText)
- [React Native ExecuTorch: Loading Models](https://docs.swmansion.com/react-native-executorch/docs/fundamentals/loading-models)
- [React Native ExecuTorch: Model Size](https://docs.swmansion.com/react-native-executorch/docs/benchmarks/model-size)
- [React Native Audio API: Decoding](https://docs.swmansion.com/react-native-audio-api/docs/utils/decoding/)
- [`whisper.rn` repository](https://github.com/mybigday/whisper.rn)

## Approved Decisions

- On-device only.
- Downloaded audio only.
- iOS and Android parity.
- React Native ExecuTorch with a custom bounded native decoder.
- English-optimized plus optional multilingual Whisper.
- Models downloaded on first use.
- Automatic and explicit batch entry points.
- Automatic mode globally opt-in and off by default.
- Processing only while foregrounded and playback is idle.
- ±30/60/90-second presets with complete-sentence projection.
- Hybrid bookmark preview plus dedicated Bookmark Passages screen.
- Protected user corrections.
- Markdown export first.
- Adaptive whole-item indexing with a ten-minute projected completion cap.
- Later manual export boundaries behind **Fine-tune clip**.
- No raw audio export and no user-supplied models.
