# Services

This directory contains service classes that manage core business logic and external integrations.

## DownloadService

The `DownloadService` is a singleton that manages all download operations for the Audiobookshelf app.

### Key Features

1. **Singleton Pattern** - Ensures only one instance manages downloads across the app
2. **Progress Subscription System** - Multiple components can subscribe to download progress updates
3. **View Rewiring Support** - Allows components to reconnect to ongoing downloads when rebuilt
4. **Background Download Support** - Automatically restores downloads when app comes back to foreground
5. **Smooth Progress Updates** - Uses exponential moving average and debouncing for stable UI updates

### Usage

```typescript
import { downloadService } from '@/services/DownloadService';

// Initialize once at app startup
await downloadService.initialize();

// Start a download
await downloadService.startDownload(libraryItemId, serverUrl, token);

// Subscribe to progress updates
const unsubscribe = downloadService.subscribeToProgress(libraryItemId, (progress) => {
  console.log('Download progress:', progress);
});

// Control downloads
downloadService.pauseDownload(libraryItemId);
downloadService.resumeDownload(libraryItemId);
downloadService.cancelDownload(libraryItemId);

// Check status
const isActive = downloadService.isDownloadActive(libraryItemId);
const currentProgress = downloadService.getCurrentProgress(libraryItemId);

// Cleanup
unsubscribe();
```

### Progress Subscription System

The service uses a subscription-based system for progress updates instead of single callbacks:

- **Multiple Subscribers**: Multiple components can subscribe to the same download
- **Automatic Cleanup**: Unsubscribe functions handle cleanup automatically
- **View Rewiring**: `rewireProgressCallbacks()` allows rebuilding views to reconnect
- **Current State**: `getCurrentProgress()` provides immediate access to current state

### Methods for View Rewiring

When a component is rebuilt (e.g., navigation, state changes), it can reconnect to ongoing downloads:

```typescript
// In component useEffect
useEffect(() => {
  if (!libraryItemId) return;

  // Rewire to ongoing download (clears old callbacks, adds new one)
  const unsubscribe = downloadService.rewireProgressCallbacks(libraryItemId, (progress) => {
    setDownloadProgress(progress);
  });

  // Check current state
  const currentProgress = downloadService.getCurrentProgress(libraryItemId);
  if (currentProgress) {
    setDownloadProgress(currentProgress);
  }

  return unsubscribe;
}, [libraryItemId]);
```
