# Bookmark Transcription Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce physical-device evidence that React Native ExecuTorch and bounded native decoding can deliver private, timestamped bookmark passages on iOS and Android, and decide whether adaptive whole-item transcription is viable.

**Architecture:** Add a diagnostics-only benchmark harness, not the production bookmark feature. A local Expo module decodes requested audiobook ranges to 16 kHz mono PCM; a TypeScript runner loads one curated Whisper model at a time, transcribes 30-second chunks with word timestamps, and exports content-free metrics. No permanent transcription database, background queue, bookmark UI, or user setting is introduced in this phase.

**Tech Stack:** Expo SDK 54, React Native 0.81/New Architecture, React Native ExecuTorch 0.9.x, Expo resource fetcher, Expo Modules API, AVFoundation/AVAssetReader, Android MediaExtractor/MediaCodec, Jest, React Native Testing Library.

## Global Constraints

- Work only with downloaded audiobook audio.
- Audio and transcript text never leave the device.
- Normal logs, trace dumps, analytics, and exported benchmark JSON contain no audio samples or transcript text.
- Run only while the app is foregrounded and playback is idle; stop after the current bounded chunk if either condition changes.
- Process one model and one chunk at a time.
- Use 30-second inference chunks with a one-second overlap.
- Request verbose word timestamps and normalize them to absolute item time.
- Test Whisper Tiny English, Tiny multilingual, Base English, and Base multilingual.
- A multilingual run always supplies the explicit audiobook language code; interface locale is irrelevant.
- First-passage acceptance target: at most 30 seconds on baseline supported hardware.
- Whole-item fill is eligible only when calibration projects at most ten minutes.
- The human quality gate is at least 90% of validation passages usable without a correction that changes meaning.
- No out-of-memory termination, serious thermal state, audible playback glitch, transcript leakage, or timestamp reversal is acceptable.
- Phase 0 adds no transcription schema or migration and does not expose the feature outside diagnostics mode.
- Revalidate React Native ExecuTorch compatibility before installation; do not silently change Expo, React Native, or minimum OS versions as part of the spike.
- Preserve unrelated dirty-worktree changes.

---

### Task 1: Install and isolate the ExecuTorch benchmark runtime

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/transcriptionBenchmark/initExecutorch.ts`
- Modify: `src/__tests__/setup.ts`
- Test: `src/features/transcriptionBenchmark/__tests__/initExecutorch.test.ts`

**Interfaces:**

- Consumes: `initExecutorch()` and `ExpoResourceFetcher` from the selected 0.9.x packages.
- Produces: `ensureBenchmarkExecutorchInitialized(): void`, an idempotent initialization boundary used only by the diagnostics harness.

- [ ] **Step 1: Verify compatibility before changing dependencies**

Run:

```bash
npx expo config --type public --json
npm view react-native-executorch@0.9 version peerDependencies engines
npm view react-native-executorch-expo-resource-fetcher@0.9 version peerDependencies
```

Expected: Expo reports SDK 54/New Architecture; the selected package release supports Expo 54 and React Native 0.81. Stop this plan and record the incompatibility if that contract has changed—do not upgrade the app in this task.

- [ ] **Step 2: Install the native runtime and Expo resource adapter**

Run:

```bash
npm install react-native-executorch@^0.9.0 react-native-executorch-expo-resource-fetcher@^0.9.0 expo-asset
```

Expected: `package.json` and `package-lock.json` change; existing `expo-file-system` remains on the Expo-compatible version.

- [ ] **Step 3: Write the failing idempotence test**

Create `src/features/transcriptionBenchmark/__tests__/initExecutorch.test.ts`:

```typescript
const initExecutorch = jest.fn();

jest.mock("react-native-executorch", () => ({ initExecutorch }));
jest.mock("react-native-executorch-expo-resource-fetcher", () => ({
  ExpoResourceFetcher: class ExpoResourceFetcher {},
}));

describe("ensureBenchmarkExecutorchInitialized", () => {
  beforeEach(() => {
    jest.resetModules();
    initExecutorch.mockClear();
  });

  it("initializes the resource fetcher exactly once", () => {
    const { ensureBenchmarkExecutorchInitialized } = require("../initExecutorch");

    ensureBenchmarkExecutorchInitialized();
    ensureBenchmarkExecutorchInitialized();

    expect(initExecutorch).toHaveBeenCalledTimes(1);
    expect(initExecutorch).toHaveBeenCalledWith({
      resourceFetcher: expect.any(Function),
    });
  });
});
```

- [ ] **Step 4: Run the test and verify the red state**

Run:

```bash
npx jest src/features/transcriptionBenchmark/__tests__/initExecutorch.test.ts --runInBand
```

Expected: FAIL because `initExecutorch.ts` does not exist.

- [ ] **Step 5: Implement the isolated initializer**

Create `src/features/transcriptionBenchmark/initExecutorch.ts`:

```typescript
import { initExecutorch } from "react-native-executorch";
import { ExpoResourceFetcher } from "react-native-executorch-expo-resource-fetcher";

let initialized = false;

export function ensureBenchmarkExecutorchInitialized(): void {
  if (initialized) {
    return;
  }

  initExecutorch({ resourceFetcher: ExpoResourceFetcher });
  initialized = true;
}
```

Add global Jest mocks for both native packages in `src/__tests__/setup.ts` so unrelated test files can import the diagnostics route without loading native code:

```typescript
jest.mock("react-native-executorch", () => ({
  initExecutorch: jest.fn(),
  models: { speech_to_text: {} },
  SpeechToTextModule: { fromModelName: jest.fn() },
}));

jest.mock("react-native-executorch-expo-resource-fetcher", () => ({
  ExpoResourceFetcher: class ExpoResourceFetcher {},
}));
```

- [ ] **Step 6: Verify the initializer and dependency health**

Run:

```bash
npx jest src/features/transcriptionBenchmark/__tests__/initExecutorch.test.ts --runInBand
npx expo install --check
npx expo-doctor@latest
```

Expected: the focused test passes; Expo dependency checks report no incompatibility introduced by this task.

- [ ] **Step 7: Commit the runtime boundary**

```bash
git add package.json package-lock.json src/features/transcriptionBenchmark/initExecutorch.ts src/features/transcriptionBenchmark/__tests__/initExecutorch.test.ts src/__tests__/setup.ts
git commit -m "spike: add isolated ExecuTorch benchmark runtime"
```

---

### Task 2: Add the bounded benchmark decoder and resource sampler

**Files:**

- Create: `modules/bookmark-transcription-benchmark/expo-module.config.json`
- Create: `modules/bookmark-transcription-benchmark/index.ts`
- Create: `modules/bookmark-transcription-benchmark/src/BookmarkTranscriptionBenchmarkModule.ts`
- Create: `modules/bookmark-transcription-benchmark/src/BookmarkTranscriptionBenchmark.types.ts`
- Create: `modules/bookmark-transcription-benchmark/ios/BookmarkTranscriptionBenchmarkModule.swift`
- Create: `modules/bookmark-transcription-benchmark/ios/Tests/BookmarkTranscriptionBenchmarkModuleTests.swift`
- Create: `modules/bookmark-transcription-benchmark/android/src/main/java/expo/modules/bookmarktranscriptionbenchmark/BookmarkTranscriptionBenchmarkModule.kt`
- Create: `modules/bookmark-transcription-benchmark/android/src/main/AndroidManifest.xml`
- Create: `modules/bookmark-transcription-benchmark/android/src/test/java/expo/modules/bookmarktranscriptionbenchmark/BookmarkTranscriptionBenchmarkModuleTest.kt`
- Create: `modules/bookmark-transcription-benchmark/test-fixtures/tone-48k-stereo.wav`

**Interfaces:**

- Consumes: a local `file://` URI plus an in-file start and duration.
- Produces:

```typescript
export type AudioProbe = {
  durationMs: number;
  sampleRate: number;
  channels: number;
  codec: string;
};

export type DecodedRange = {
  pcmBytes: Uint8Array;
  sampleRate: 16000;
  channels: 1;
  requestedStartMs: number;
  actualStartMs: number;
  durationMs: number;
};

export type ResourceSnapshot = {
  capturedAtMs: number;
  residentBytes: number;
  thermalState: "nominal" | "fair" | "serious" | "critical" | "unknown";
  lowPowerMode: boolean;
  batteryLevel: number | null;
};

export function probeAudio(uri: string): Promise<AudioProbe>;
export function decodeRange(
  uri: string,
  startMs: number,
  durationMs: number
): Promise<DecodedRange>;
export function getResourceSnapshot(): Promise<ResourceSnapshot>;
export function cancelDecode(): Promise<void>;
```

- [ ] **Step 1: Scaffold the local module without touching generated native projects**

Run:

```bash
npx create-expo-module@latest modules/bookmark-transcription-benchmark --local --name BookmarkTranscriptionBenchmark --package expo.modules.bookmarktranscriptionbenchmark --platform apple android --features AsyncFunction
```

Expected: the local module is auto-linkable from `modules/`; do not commit generated root `ios/` or `android/` directories.

- [ ] **Step 2: Define the TypeScript boundary before native implementation**

Put the exact types above in `BookmarkTranscriptionBenchmark.types.ts`. In `BookmarkTranscriptionBenchmarkModule.ts`, require the native module and export only the four typed functions:

```typescript
import { requireNativeModule } from "expo-modules-core";
import type {
  AudioProbe,
  DecodedRange,
  ResourceSnapshot,
} from "./BookmarkTranscriptionBenchmark.types";

type NativeModule = {
  probeAudio(uri: string): Promise<AudioProbe>;
  decodeRange(uri: string, startMs: number, durationMs: number): Promise<DecodedRange>;
  getResourceSnapshot(): Promise<ResourceSnapshot>;
  cancelDecode(): Promise<void>;
};

export default requireNativeModule<NativeModule>("BookmarkTranscriptionBenchmark");
```

Re-export the functions and types from `index.ts`.

- [ ] **Step 3: Implement bounded iOS decoding**

In Swift:

- validate `startMs >= 0`, `0 < durationMs <= 30_000`, and a local file URL;
- load the first audio track from `AVURLAsset`;
- set `AVAssetReader.timeRange` to the requested interval;
- configure `AVAssetReaderTrackOutput` for 32-bit little-endian float PCM, 16 kHz, mono;
- append each `CMSampleBuffer` block to `Data`;
- check a module-owned atomic cancellation flag between blocks;
- return `Data` as `pcmBytes`, plus the actual range metadata;
- reject missing/corrupt/unsupported audio with stable codes:
  `E_INVALID_RANGE`, `E_AUDIO_NOT_FOUND`, `E_AUDIO_UNSUPPORTED`, `E_DECODE_CANCELLED`, or `E_DECODE_FAILED`.

The module definition must expose:

```swift
Name("BookmarkTranscriptionBenchmark")
AsyncFunction("probeAudio") { (uri: URL) async throws -> [String: Any] in /* probe */ }
AsyncFunction("decodeRange") {
  (uri: URL, startMs: Double, durationMs: Double) async throws -> [String: Any] in /* decode */
}
AsyncFunction("getResourceSnapshot") { () -> [String: Any] in /* memory/thermal/power */ }
AsyncFunction("cancelDecode") { /* set cancellation flag */ }
```

Use `ProcessInfo.processInfo.thermalState` and `isLowPowerModeEnabled`. Read resident memory with `task_info(mach_task_self_, MACH_TASK_BASIC_INFO, ...)`. Enable `UIDevice.current.isBatteryMonitoringEnabled` and report battery level in `[0, 1]`, or `null` when unavailable.

- [ ] **Step 4: Implement bounded Android decoding**

In Kotlin:

- validate the same range contract and `file://` input;
- use `MediaExtractor` to select the first audio track and seek to the nearest sync point at or before `startMs`;
- decode with `MediaCodec`;
- discard frames before the requested start and stop at the requested end;
- downmix all source channels by arithmetic mean;
- linearly resample source PCM to 16 kHz;
- serialize IEEE-754 float samples into a little-endian `ByteArray`;
- check an `AtomicBoolean` cancellation flag between output buffers;
- use the same stable error codes as iOS.

Expose the same four AsyncFunctions. Use `Debug.getPss() * 1024L` for resident bytes, `PowerManager.currentThermalStatus` on API 29+, `PowerManager.isPowerSaveMode`, and `BatteryManager.BATTERY_PROPERTY_CAPACITY / 100.0`.

The resampler must carry fractional source position across codec buffers so timestamps do not reset at buffer boundaries.

- [ ] **Step 5: Add native fixture assertions**

For both platforms, use a committed ten-second, 48 kHz stereo WAV fixture containing a 440 Hz tone followed by silence. Assert:

- `probeAudio` reports a duration within 20 ms of ten seconds;
- decoding `startMs=2_000`, `durationMs=3_000` returns sample rate 16,000, one channel, and 48,000 float samples;
- returned bytes are finite floats in `[-1, 1]`;
- a duration above 30 seconds rejects with `E_INVALID_RANGE`;
- cancellation rejects with `E_DECODE_CANCELLED`;
- repeated adjacent range decodes do not increase resident memory monotonically.

The tone fixture contains no copyrighted speech and must be below 2 MB.

- [ ] **Step 6: Build and run the native module on both platforms**

Run:

```bash
npx expo prebuild --clean
npx expo run:ios --device
npx expo run:android --device
```

Expected: development builds install on a physical iOS 17+ device and Android 13+ device; probe/decode/resource calls return the same public shape.

- [ ] **Step 7: Commit the native spike module**

```bash
git add modules/bookmark-transcription-benchmark
git commit -m "spike: decode bounded audiobook ranges"
```

---

### Task 3: Plan downloaded-item ranges and compute benchmark metrics

**Files:**

- Create: `src/db/helpers/transcriptionBenchmark.ts`
- Create: `src/features/transcriptionBenchmark/types.ts`
- Create: `src/features/transcriptionBenchmark/rangePlanner.ts`
- Create: `src/features/transcriptionBenchmark/metrics.ts`
- Test: `src/features/transcriptionBenchmark/__tests__/rangePlanner.test.ts`
- Test: `src/features/transcriptionBenchmark/__tests__/metrics.test.ts`

**Interfaces:**

- Produces:

```typescript
export type BenchmarkSourceFile = {
  audioFileId: string;
  libraryItemId: string;
  title: string;
  index: number;
  uri: string;
  durationMs: number;
  format: string | null;
  codec: string | null;
  channels: number | null;
};

export type BenchmarkSpan = {
  audioFileId: string;
  uri: string;
  itemStartMs: number;
  startInFileMs: number;
  durationMs: number;
};

export type BenchmarkChunkMetric = {
  rangeStartMs: number;
  rangeEndMs: number;
  audioDurationMs: number;
  decodeMs: number;
  inferenceMs: number;
  realTimeFactor: number;
  wordCount: number;
  timestampsMonotonic: boolean;
  firstWordStartMs: number | null;
  lastWordEndMs: number | null;
  maximumTimestampRegressionMs: number;
};

export type BenchmarkReport = {
  schemaVersion: 1;
  platform: string;
  osVersion: string;
  deviceModel: string;
  appCommit: string;
  engineVersion: string;
  modelId: string;
  language: string;
  sourceProfile: {
    format: string | null;
    codec: string | null;
    channels: number | null;
    itemDurationMs: number;
  };
  modelArtifactBytes: number;
  modelDownloadMs: number;
  modelLoadMs: number;
  modelDeleteMs: number;
  firstPassageMs: number;
  chunks: BenchmarkChunkMetric[];
  projectedWholeItemMs: number | null;
  actualWholeItemMs: number | null;
  cancellationLatencyMs: number | null;
  resourceSamples: ResourceSnapshot[];
  humanReview: {
    usableWithoutMeaningChangingCorrection: boolean;
    issueCategories: string[];
  };
};

export function listDownloadedBenchmarkSources(): Promise<BenchmarkSourceFile[]>;
export function planItemRange(
  files: BenchmarkSourceFile[],
  startMs: number,
  durationMs: number
): BenchmarkSpan[];
export function projectWholeItemMs(
  processedAudioMs: number,
  elapsedInferenceMs: number,
  uncoveredAudioMs: number
): number;
```

- [ ] **Step 1: Write failing range-planner tests**

Cover:

```typescript
it("maps an item range into one file");
it("splits a range across adjacent files");
it("clamps a negative bookmark window to item start");
it("clamps a range at item end");
it("rejects missing durations and index gaps");
it("orders files by audio index rather than filename");
```

For a two-file item with 60-second files, assert that `startMs=55_000` and `durationMs=10_000` produces:

```typescript
[
  {
    audioFileId: "a",
    uri: "file:///a.mp3",
    itemStartMs: 55_000,
    startInFileMs: 55_000,
    durationMs: 5_000,
  },
  {
    audioFileId: "b",
    uri: "file:///b.mp3",
    itemStartMs: 60_000,
    startInFileMs: 0,
    durationMs: 5_000,
  },
];
```

- [ ] **Step 2: Run the range tests and verify they fail**

Run:

```bash
npx jest src/features/transcriptionBenchmark/__tests__/rangePlanner.test.ts --runInBand
```

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Implement the database read helper**

`listDownloadedBenchmarkSources()` must query through this entity-specific helper, joining:

- `audioFiles`;
- `mediaMetadata`;
- `localAudioFileDownloads`.

Select only rows with `isDownloaded = true` and non-null download path, resolve paths with `resolveAppPath()`, convert `duration` seconds to integer milliseconds, and order by `libraryItemId` then `audioFiles.index`. Do not import from `@/db/helpers` and do not write from this helper.

- [ ] **Step 4: Implement range planning**

`planItemRange()` must:

- verify every file belongs to one item;
- sort by numeric audio index;
- reject non-finite or non-positive durations;
- clamp the requested interval to `[0, itemDuration]`;
- map the clamped interval to one or more file-local spans;
- return no span longer than the requested interval;
- use integer milliseconds throughout.

- [ ] **Step 5: Write failing metric tests**

Assert:

```typescript
expect(projectWholeItemMs(30_000, 5_000, 3_600_000)).toBe(600_000);
expect(() => projectWholeItemMs(0, 5_000, 3_600_000)).toThrow();
expect(() => projectWholeItemMs(30_000, -1, 3_600_000)).toThrow();
```

Also test:

- real-time factor = inference milliseconds / processed-audio milliseconds;
- percentile calculation for first-passage latency;
- word timestamps are monotonic;
- first/last absolute word times remain inside the decoded range plus the one-second overlap tolerance;
- maximum timestamp regression is zero, including at audio-file boundaries;
- content-free report serialization rejects keys named `text`, `transcript`, `words`, or `pcmBytes` at any nesting depth.

- [ ] **Step 6: Implement metric helpers and verify both suites**

Run:

```bash
npx jest src/features/transcriptionBenchmark/__tests__/rangePlanner.test.ts src/features/transcriptionBenchmark/__tests__/metrics.test.ts --runInBand
```

Expected: both suites pass.

- [ ] **Step 7: Commit planning and metrics**

```bash
git add src/db/helpers/transcriptionBenchmark.ts src/features/transcriptionBenchmark/types.ts src/features/transcriptionBenchmark/rangePlanner.ts src/features/transcriptionBenchmark/metrics.ts src/features/transcriptionBenchmark/__tests__
git commit -m "spike: plan and measure transcription ranges"
```

---

### Task 4: Implement the timestamped benchmark runner

**Files:**

- Create: `src/features/transcriptionBenchmark/modelRegistry.ts`
- Create: `src/features/transcriptionBenchmark/BenchmarkRunner.ts`
- Test: `src/features/transcriptionBenchmark/__tests__/modelRegistry.test.ts`
- Test: `src/features/transcriptionBenchmark/__tests__/BenchmarkRunner.test.ts`

**Interfaces:**

- Produces:

```typescript
export type BenchmarkModelId = "tiny-en" | "base-en" | "tiny-multilingual" | "base-multilingual";

export type BenchmarkRequest = {
  modelId: BenchmarkModelId;
  language: string;
  files: BenchmarkSourceFile[];
  bookmarkPositionMs: number;
  contextBeforeMs: number;
  contextAfterMs: number;
  attemptWholeItem: boolean;
};

export type BenchmarkProgress = {
  phase: "loading-model" | "bookmark-window" | "calibrating" | "whole-item" | "paused";
  processedAudioMs: number;
  totalAudioMs: number;
};

export type BenchmarkCheckpoint = {
  request: BenchmarkRequest;
  completedRanges: Array<{ startMs: number; endMs: number }>;
  chunkMetrics: BenchmarkChunkMetric[];
};

export type BenchmarkResult = {
  passage: {
    text: string;
    words: Array<{ word: string; startMs: number; endMs: number }>;
  };
  checkpoint: BenchmarkCheckpoint | null;
  exportableReport: BenchmarkReport;
};

export class BenchmarkRunner {
  run(
    request: BenchmarkRequest,
    onProgress: (progress: BenchmarkProgress) => void
  ): Promise<BenchmarkResult>;
  resume(
    checkpoint: BenchmarkCheckpoint,
    onProgress: (progress: BenchmarkProgress) => void
  ): Promise<BenchmarkResult>;
  requestPause(): void;
  cancel(): Promise<void>;
}
```

- [ ] **Step 1: Write the failing model-registry tests**

Assert that:

- `tiny-en` resolves to `models.speech_to_text.whisper_tiny_en()`;
- `base-en` resolves to `whisper_base_en()`;
- multilingual IDs resolve to `whisper_tiny()` and `whisper_base()`;
- English models reject any language other than `en`;
- multilingual models require a non-empty explicit language;
- artifact-size lookup passes only the selected model and tokenizer sources to the Expo resource fetcher.

- [ ] **Step 2: Implement the curated registry**

Use only callable accessors from `models.speech_to_text`. Return:

```typescript
type BenchmarkModelDefinition = {
  id: BenchmarkModelId;
  displayName: string;
  multilingual: boolean;
  config: Parameters<typeof SpeechToTextModule.fromModelName>[0];
};
```

Do not accept URLs, local model paths, or user model files.

- [ ] **Step 3: Write runner tests against injected fakes**

Inject these dependencies through the constructor:

```typescript
type BenchmarkRunnerDependencies = {
  createModel: (
    modelId: BenchmarkModelId,
    onDownloadProgress: (fraction: number) => void
  ) => Promise<{
    transcribe(
      pcm: Float32Array,
      options: { language?: string; verbose: true }
    ): Promise<TranscriptionResult>;
    delete(): void;
  }>;
  getModelArtifactBytes: (modelId: BenchmarkModelId) => Promise<number>;
  decodeRange: typeof decodeRange;
  getResourceSnapshot: typeof getResourceSnapshot;
  now: () => number;
  getAppState: () => "active" | "inactive" | "background";
  isPlaybackIdle: () => Promise<boolean>;
};
```

Tests must prove:

- the bookmark window runs before calibration or whole-item fill;
- no inference call receives more than 30 seconds of 16 kHz mono samples;
- adjacent chunks overlap by exactly one second;
- multilingual calls receive the selected language;
- chunk-relative word times become absolute item times;
- duplicate overlap words are removed without timestamp reversal;
- calibration above ten minutes stops after the bookmark passage;
- calibration at or below ten minutes continues through uncovered item ranges;
- app backgrounding or playback pauses after the current chunk;
- pausing returns a `BenchmarkCheckpoint` containing the request, completed ranges, and content-free metric rows;
- `resume(checkpoint, onProgress)` skips completed ranges and begins with the first uncovered chunk;
- cancellation keeps completed metric rows and starts no new chunk;
- reports contain hashes/lengths and timing only, never transcript text or word content.

- [ ] **Step 4: Run the tests and verify the red state**

Run:

```bash
npx jest src/features/transcriptionBenchmark/__tests__/modelRegistry.test.ts src/features/transcriptionBenchmark/__tests__/BenchmarkRunner.test.ts --runInBand
```

Expected: FAIL because the registry and runner do not exist.

- [ ] **Step 5: Implement model loading and bounded inference**

The production adapter inside `BenchmarkRunner.ts` must:

```typescript
ensureBenchmarkExecutorchInitialized();
const model = await SpeechToTextModule.fromModelName(
  getBenchmarkModel(modelId).config,
  undefined,
  onDownloadProgress
);
const pcm = new Float32Array(
  decoded.pcmBytes.buffer,
  decoded.pcmBytes.byteOffset,
  decoded.pcmBytes.byteLength / Float32Array.BYTES_PER_ELEMENT
);
const result = await model.transcribe(pcm, {
  ...(definition.multilingual ? { language } : {}),
  verbose: true,
});
```

Keep transcript text and word tokens only in the in-memory `BenchmarkResult` used by the current screen. Build the exportable metrics object through the recursive content-free serializer from Task 3.

Resolve model artifact size with `ExpoResourceFetcher.getFilesTotalSize()` against the curated model and tokenizer sources. Measure cold download and load separately from progress callbacks, record a zero download duration for a warm cache, call `model.delete()` in a `finally` block, and sample resident memory immediately before deletion and five seconds afterward. Never leave two model instances loaded.

- [ ] **Step 6: Implement calibration and whole-item control**

Use:

- 30,000 ms chunks;
- 1,000 ms overlap;
- a representative calibration set of three 30-second ranges at 10%, 50%, and 90% of item duration, excluding already processed bookmark coverage;
- projected completion from total inference time divided by calibration audio time;
- the ten-minute threshold from the spec.

If eligible, process the remaining item sequentially. Sample resource state before model load, after the bookmark passage, after calibration, after every tenth chunk, and after completion/cancellation.

The result records both projected and actual completion time. It marks actual whole-item time as unavailable only when the ten-minute eligibility rule correctly stops the run. Compute battery delta from the first and final non-null resource snapshots; preserve the raw samples in the content-free report.

`requestPause()` sets a pause-after-chunk flag. After the current inference result is normalized, return a `BenchmarkCheckpoint`; do not start another decode. `cancel()` requests native decode cancellation when decoding is active and otherwise prevents the next chunk. A resumed run rebuilds in-memory interval coverage from `checkpoint.completedRanges` and never retranscribes those ranges.

- [ ] **Step 7: Verify the runner**

Run:

```bash
npx jest src/features/transcriptionBenchmark/__tests__/modelRegistry.test.ts src/features/transcriptionBenchmark/__tests__/BenchmarkRunner.test.ts --runInBand
```

Expected: all registry and runner tests pass.

- [ ] **Step 8: Check the service import graph and commit**

Run:

```bash
npx dpdm --circular src/features/transcriptionBenchmark/BenchmarkRunner.ts
```

Expected: no circular dependency.

```bash
git add src/features/transcriptionBenchmark
git commit -m "spike: benchmark timestamped Whisper transcription"
```

---

### Task 5: Add a diagnostics-only benchmark screen and safe export

**Files:**

- Create: `src/app/(tabs)/more/transcription-benchmark.tsx`
- Create: `src/components/diagnostics/TranscriptionBenchmark.tsx`
- Modify: `src/app/(tabs)/more/index.tsx`
- Modify: `src/app/(tabs)/more/_layout.tsx`
- Test: `src/components/diagnostics/__tests__/TranscriptionBenchmark.test.tsx`

**Interfaces:**

- Consumes: downloaded benchmark sources, `BenchmarkRunner`, and existing `exportJsonAsFile()`.
- Produces: a diagnostics-only physical-device workflow and a content-free JSON evidence artifact.

- [ ] **Step 1: Write failing component tests**

Mock the DB helper, runner, TrackPlayer, and export utility. Test:

- the route is reachable only through the existing diagnostics-enabled More section;
- downloaded files are grouped by item and ordered by audio index;
- model choices are exactly the four curated IDs;
- multilingual models require a language code;
- start is disabled while playback is playing or buffering;
- progress identifies model load, bookmark window, calibration, and whole-item phases;
- cancel invokes `runner.cancel()`;
- transcript text is visible for local human review;
- exported JSON excludes transcript text and word content;
- a failed or blocked run presents its stable code and can be retried.

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
npx jest src/components/diagnostics/__tests__/TranscriptionBenchmark.test.tsx --runInBand
```

Expected: FAIL because the component and route do not exist.

- [ ] **Step 3: Implement the route and navigation entry**

The route renders `TranscriptionBenchmark` and sets the title to `Transcription Benchmark`. Add a More-menu item inside the existing `if (diagnosticsEnabled)` block and a matching Stack screen. Do not add a normal tab, deep link, or user-facing setting.

- [ ] **Step 4: Implement the benchmark controls**

The screen must provide:

- downloaded item selection;
- source-format summary;
- bookmark position;
- ±30, ±60, or ±90-second passage context;
- model selection;
- explicit audiobook language for multilingual models;
- **Run bookmark passage**;
- **Run passage and eligible whole item**;
- cancel;
- resume after a foreground/playback pause;
- download/model-load progress;
- phase and chunk progress;
- in-memory transcript preview;
- resource and timing summary;
- human-review controls: `usable without meaning-changing correction` yes/no and an optional content-free issue category.

Issue categories are fixed to:

- omitted words;
- inserted words;
- wrong words;
- punctuation/boundary;
- timestamp drift;
- wrong language;
- unusable output.

Do not provide a free-text review field that could accidentally enter transcript content into the exported metrics.

- [ ] **Step 5: Enforce foreground and playback gates**

Before starting, call `TrackPlayer.getPlaybackState()` and reject Playing or Buffering. Subscribe to `AppState`; when it leaves active, call `runner.requestPause()` so the current chunk is checkpointed and no new chunk starts. Check playback state between chunks and request the same pause when it becomes Playing or Buffering. The benchmark harness must never call `pause()`, `stop()`, or otherwise alter playback for the user.

- [ ] **Step 6: Implement safe evidence export**

Pass only the content-free report to `exportJsonAsFile()`:

```typescript
await exportJsonAsFile(report, {
  filename: `bookmark-transcription-benchmark-${Date.now()}`,
});
```

Include:

- platform, OS, device model, app commit, engine/model ID;
- language and source format metadata;
- item duration and requested ranges;
- model artifact size and download/load/delete timing;
- per-chunk decode/inference duration, audio duration, real-time factor, and timestamp monotonicity;
- projected/actual whole-item timing;
- sampled resident memory, thermal state, and low-power mode;
- cancellation latency;
- human usability yes/no and issue categories.

Exclude item title, filename, server/account IDs, local paths, transcript text, words, PCM, and model URLs.

- [ ] **Step 7: Verify the component and commit**

Run:

```bash
npx jest src/components/diagnostics/__tests__/TranscriptionBenchmark.test.tsx --runInBand
```

Expected: all component tests pass.

```bash
git add src/app/'(tabs)'/more/transcription-benchmark.tsx src/app/'(tabs)'/more/index.tsx src/app/'(tabs)'/more/_layout.tsx src/components/diagnostics/TranscriptionBenchmark.tsx src/components/diagnostics/__tests__/TranscriptionBenchmark.test.tsx
git commit -m "spike: add transcription benchmark diagnostics"
```

---

### Task 6: Run the corpus, record evidence, and make the gate decision

**Files:**

- Create: `docs/investigation/bookmark-transcription-phase-0-results.md`
- Modify: `docs/superpowers/plans/2026-07-27-bookmark-transcription-phase-0.md` only to check completed steps during execution

**Interfaces:**

- Consumes: content-free JSON exports from Task 5 and direct human review on the test device.
- Produces: one evidence-backed `GO`, `GO WITH CONSTRAINTS`, or `NO-GO` decision for Phase 1, including the selected default English and multilingual models.

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm test
npm run lint
npx expo install --check
npx expo-doctor@latest
npx dpdm --circular src/features/transcriptionBenchmark/BenchmarkRunner.ts
git diff --check
```

Expected: full Jest passes; lint has no new errors; Expo checks are healthy; no circular dependency; diff check is clean. If repository-wide baseline failures remain, record the exact pre-existing failures and run changed-file ESLint plus focused Jest with zero new failures.

- [ ] **Step 2: Build release-mode binaries on physical devices**

Use the oldest available supported iPhone, a current iPhone, an Android 13 baseline device, and a current Android device. Run release builds because simulator and debug-build timing are not acceptance evidence.

Record for each device:

- exact hardware and OS;
- app commit;
- ExecuTorch/resource-fetcher versions;
- selected backend reported by the model config;
- build mode.

- [ ] **Step 3: Exercise the required source corpus**

Across the device matrix, cover:

- single-file M4B/AAC;
- single-file MP3;
- multi-file MP3;
- VBR audio;
- mono and stereo;
- a bookmark range crossing an audio-file boundary;
- clean English narration;
- at least one non-English audiobook using its explicit language code.

Use legitimately obtained downloaded test audio. Do not add audiobook excerpts to git or attach transcript text to the results document.

- [ ] **Step 4: Benchmark all four models**

For every model/device/language combination that applies:

1. cold-load the model;
2. run at least ten bookmark passages distributed across the corpus;
3. run the three-window whole-item calibration;
4. allow actual whole-item completion only when projected at ten minutes or less;
5. cancel and resume at least one long run;
6. start playback during one run and confirm no new chunk begins;
7. inspect battery, memory, thermal, and post-delete memory-recovery samples;
8. mark passage usability directly on device.

Ten passages per model profile provides the denominator needed for the 90% usability gate.

- [ ] **Step 5: Validate privacy and playback**

With model files already installed:

- capture device network traffic during transcription and verify zero transcription requests;
- export SideShelf logs/trace dump and search for distinctive words visible in the transcript preview;
- export benchmark JSON and run:

```bash
rg -ni 'text|transcript|words|pcm|file://|https?://' bookmark-transcription-benchmark-*.json
```

Expected: no content-bearing keys, text, local paths, or URLs. Also confirm playback begins without an audible glitch and benchmark work stops after the active chunk.

- [ ] **Step 6: Write the results report with actual values**

`docs/investigation/bookmark-transcription-phase-0-results.md` must include:

- tested commit and dependency versions;
- device/source corpus matrix;
- per-model artifact size, download/load/delete latency, post-delete memory recovery, first-passage p50/p95, real-time factor, battery delta per processed audio hour, peak resident memory, thermal maximum, and usability rate;
- timestamp monotonicity and cross-file drift results;
- projected versus actual whole-item timing where eligible;
- privacy, cancellation, foreground, and playback-preemption results;
- excluded or failed combinations with stable error codes;
- recommended English and multilingual defaults;
- a single gate decision.

Do not commit the report with blank cells, placeholder language, or transcript excerpts.

- [ ] **Step 7: Apply the decision rule**

Choose:

- **GO** only if at least one English and one multilingual model pass every release gate on all baseline devices;
- **GO WITH CONSTRAINTS** only if passing models require an explicit supported-device or language constraint that can be stated before Phase 1;
- **NO-GO** if privacy, playback, memory/thermal, timestamps, first-passage latency, multilingual quality, or native-build parity fails.

Whole-item indexing is separately marked **enabled candidate** only where projected and actual runs meet ten minutes without failing any resource gate. A window-only result can still be a Phase 1 GO.

- [ ] **Step 8: Commit the completed evidence**

```bash
git add docs/investigation/bookmark-transcription-phase-0-results.md docs/superpowers/plans/2026-07-27-bookmark-transcription-phase-0.md
git commit -m "docs: record bookmark transcription feasibility"
```

Expected: the report contains no audiobook text or identifying local source data.

## Phase 0 Exit

Do not begin the production decoder, schema, queue, bookmark previews, model settings, Markdown export, or **Fine-tune clip** implementation from this plan. After the evidence commit is reviewed, write a separate Phase 1 plan using the chosen engine/model constraints and the measured decoder behavior.
