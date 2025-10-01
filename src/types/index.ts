/**
 * Type organization for the application
 *
 * Instead of barrel exports which can cause naming conflicts,
 * import types directly from their specific modules:
 *
 * @example
 * ```ts
 * // API types
 * import type { User, Library, LibraryItem } from '@/types/api';
 *
 * // Database types
 * import type { LibraryRow, UserRow } from '@/types/database';
 *
 * // Store types
 * import type { SortConfig, LoadingStates } from '@/types/store';
 *
 * // Component types
 * import type { LibraryItemProps, ViewMode } from '@/types/components';
 *
 * // Service types
 * import type { DownloadProgress, DownloadConfig } from '@/types/services';
 *
 * // Player types
 * import type { PlayerTrack, CurrentChapter } from '@/types/player';
 *
 * // Utility types
 * import type { AuthState, ThemedStyles } from '@/types/utils';
 * ```
 */

// This file serves as documentation for the type organization
// but does not re-export types to avoid naming conflicts.
