---
created: 2026-03-08T02:58:52.648Z
title: Add reassociation option to orphan download screen
area: ui
files:
  - src/services/download/DownloadRepairCollaborator.ts
  - src/services/download/DownloadStatusCollaborator.ts
---

## Problem

When downloaded files become orphaned (e.g. the library item was deleted from the server, or the item ID changed), the app surfaces them on an orphan download screen but only offers "delete". There's no way to reassociate orphaned files with a known library item — the user must delete and re-download even if the audio data is identical.

This is particularly painful for large audiobooks (multi-GB) on slow connections, and can happen when a server admin reorganizes the library.

## Solution

TBD — but likely:

- Add a "Reassociate" action on each orphaned file entry in the orphan download screen
- Show a library item picker (search/browse) to select the target item
- Move/rename the file directory from the orphaned ID path to the target item ID path
- Update DB records (audio file download path, storage location) to point to the new path
- Re-run `setExcludeFromBackup` on the new path
- Verify the reassociated file plays correctly by confirming the audio file metadata matches (duration, size, format)
- Handle edge case where the target item already has a downloaded file at that path
