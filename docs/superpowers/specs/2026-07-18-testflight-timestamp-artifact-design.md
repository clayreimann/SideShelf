# TestFlight Timestamp Artifact Design

## Goal

Make `npm run build-testflight` capture one local timestamp when the command starts and use it consistently for the iOS build number and generated IPA filename. Keep the public app version fixed at `1.0.0`.

## Design

The `build-testflight` package script will capture `BUILD_TIMESTAMP` before running `npm install`, using the existing `YYYYMMDDHHMMSS` format. Capturing it first ensures dependency installation and the local EAS build cannot shift the identifying timestamp away from the time the user started the command.

After dependencies are installed, the script will:

- expose the captured value to Expo configuration as `BUILD_NUMBER`;
- run the existing local, non-interactive iOS production build; and
- pass `--output "build-$BUILD_TIMESTAMP.ipa"` so the artifact uses the same identifier.

For a command started at 2:35:22 PM on July 18, 2026, the resulting values are:

- marketing version: `1.0.0`;
- iOS build number: `20260718143522`; and
- artifact filename: `build-20260718143522.ipa`.

No change is required in `app.config.js`: it already reads `BUILD_NUMBER` and assigns it to `ios.buildNumber`. The timestamp continues to use the machine's local timezone, matching the existing shell `date` behavior.

## Error behavior

The shell chain remains fail-fast. If `npm install` fails, EAS does not run. If the EAS build fails, no successful artifact is reported. Quoting the output path prevents shell expansion or word splitting.

## Verification

- Confirm `package.json` remains valid JSON.
- Confirm the package script captures the timestamp before `npm install`.
- Confirm the same shell variable supplies both `BUILD_NUMBER` and `--output`.
- Confirm the format is exactly 14 numeric digits.
- Inspect the resolved Expo configuration with a fixed `BUILD_NUMBER` to confirm `ios.buildNumber` receives it.
- Do not run a full local TestFlight build solely for this configuration-only change.
