# Console Logging Audit

## Files with Console Statements (Ordered by Count)

| Count | File | Status |
|-------|------|--------|
| 54 | `src/services/ProgressService.ts` | ✅ Converted |
| 52 | `src/services/DownloadService.ts` | ✅ Converted |
| 47 | `src/stores/slices/librarySlice.ts` | ✅ Converted |
| 38 | `src/services/PlayerService.ts` | ✅ Converted |
| 18 | `src/db/helpers/migrationHelpers.ts` | ⏸️ Pending |
| 16 | `src/stores/slices/seriesSlice.ts` | ⏸️ Pending |
| 16 | `src/stores/slices/authorsSlice.ts` | ⏸️ Pending |
| 15 | `src/components/library/LibraryItemDetail.tsx` | ⏸️ Pending |
| 10 | `src/lib/api/endpoints.ts` | ⏸️ Pending |
| 9 | `src/services/libraryItemBatchService.ts` | ⏸️ Pending |
| 8 | `src/index.ts` | ⏸️ Pending |
| 8 | `src/app/FullScreenPlayer/index.tsx` | ⏸️ Pending |
| 7 | `src/db/helpers/mediaMetadata.ts` | ⏸️ Pending |
| 7 | `src/app/_layout.tsx` | ⏸️ Pending |
| 6 | `src/providers/AuthProvider.tsx` | ⏸️ Pending |
| 6 | `src/lib/covers.ts` | ⏸️ Pending |
| 6 | `src/db/helpers/localListeningSessions.ts` | ⏸️ Pending |
| 5 | `src/lib/fileSystem.ts` | ⏸️ Pending |
| 5 | `src/app/login.tsx` | ⏸️ Pending |
| 4 | `src/db/helpers/fullLibraryItems.ts` | ⏸️ Pending |
| 4 | `src/app/(tabs)/more/advanced.tsx` | ⏸️ Pending |
| 4 | `src/app/(tabs)/home/index.tsx` | ⏸️ Pending |
| 3 | `src/lib/logger/db.ts` | ⏸️ Pending |
| 3 | `src/lib/api/api.ts` | ✅ Already Converted |
| 3 | `src/db/helpers/localData.ts` | ⏸️ Pending |
| 3 | `src/app/(tabs)/more/logs.tsx` | ⏸️ Pending |
| 3 | `src/__tests__/utils/testDb.ts` | ⏸️ Pending |
| 2 | `src/providers/DbProvider.tsx` | ⏸️ Pending |
| 2 | `src/lib/secureStore.ts` | ✅ Already Converted |
| 2 | `src/db/helpers/homeScreen.ts` | ⏸️ Pending |
| 2 | `src/app/index.tsx` | ⏸️ Pending |
| 1 | `src/stores/slices/playerSlice.ts` | ⏸️ Pending |
| 1 | `src/lib/logger/index.ts` | ✅ System Logging |
| 1 | `src/db/helpers/filterData.ts` | ⏸️ Pending |
| 1 | `src/db/client.ts` | ⏸️ Pending |
| 1 | `src/components/ui/FloatingPlayer.tsx` | ⏸️ Pending |
| 1 | `src/app/(tabs)/_layout.tsx` | ⏸️ Pending |

**Total Console Statements: 443**

## Conversion Priority

### High Priority (Most logging, core services)
1. ✅ **PlayerBackgroundService.ts** - Already converted (20 calls)
2. ✅ **ProgressService.ts** - Converted (54 calls)
3. ✅ **DownloadService.ts** - Converted (52 calls)
4. ✅ **PlayerService.ts** - Converted (38 calls)
5. ✅ **librarySlice.ts** - Converted (47 calls)

### Medium Priority (Moderate logging, important functionality)
- migrationHelpers.ts (18)
- seriesSlice.ts (16)
- authorsSlice.ts (16)
- LibraryItemDetail.tsx (15)
- endpoints.ts (10)
- libraryItemBatchService.ts (9)
- index.ts (8)
- FullScreenPlayer/index.tsx (8)

### Low Priority (Few calls, less critical paths)
- All files with ≤7 calls

## Notes

- **PlayerBackgroundService.ts**: Already converted to use cached subloggers ✅
- **api.ts**: Already uses logger ✅
- **secureStore.ts**: Already uses logger ✅
- **logger/db.ts**: System logging (console.log/error for bootstrap)
- **logger/index.ts**: System logging (console.error for error cases)

## Conversion Strategy

1. Start with high-traffic services (ProgressService, DownloadService, PlayerService)
2. Convert store slices (librarySlice, seriesSlice, authorsSlice)
3. Convert UI components and screens
4. Convert utility libraries
5. Leave system/bootstrap logging in place (logger/db.ts, logger/index.ts)
