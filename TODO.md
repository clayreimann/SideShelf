# Audiobookshelf React Native - TODO

## 🚀 High Priority Features

### Build issues

- [x] Separate branch of downloader library on my fork to enable consistent building
- [x] Embed fonts in app build
- [x] Provide prompt to reauthorize when refresh token is expired
- [x] Manage creds in expo CLI
- [x] Downloaded files should only store paths relative to app bundle and we should resolve absolute file paths at runtime
- [x] Conditionally use native tabs for ios 26+
- [x] Sessions for downloaded media are not being correctly created, streaming progress works fine, but progress from local items appears to create the session but subsequent syncs fail
- [ ] Fetch currently playing/most recent item status from TrackPlayer
- [ ] PlayerService should be the single entrypoint to play/pause tracks.
  - [ ] PlayerService updates store state for accurate tracking
  - [ ] PlayerService stores/remembers the last played item so that the floating player can be
        populated on start (for downloaded media)
  - [ ] ProgressService should not close the current session if the new session is for the same 
        item (unless timeout expired)
  - [ ] ProgressService should check on startup for dangling sessions (crash or memory pressure quit) and close them
- [ ] PlayerService.PlayerTrack should take the resume position
- [ ] PlayerService should update the track metadata with new chapter information

### Misc/Bugs

- [ ] When the mini-player is shown add padding to the bottom of views so that you can scroll all the way to the bottom
- [ ] New login initialization still doesn't work well,
  - [ ] home screen isn't refreshed after log in
  - [ ] no library is selected by default
  - [ ] authors don't populate
  - [ ] series don't populate
- [ ] Authors refresh UX is broken
- [ ] Series refresh UX is broken
- [ ] Long author/narrator strings just go off screen
- [ ] Animate the description expand/collapse
  - [ ] Remove section header and just expand/collapse when tapping on text, show a snippet and fade the bottom out
- [ ] In extracted buttons, use SFSymbols on ios and fallback to icons on android
  - [ ] Only wait for icon fonts loading on android
- [ ] Mark cover as not available if file is missing
- [ ] Add chapter jump feature
- [ ] Add listening stats page
- [ ] Add library search

### Playback Tracking & Sync

- [ ] **Playback Tracking Store Implementation**

  - [x] Create centralized progress tracking store
  - [x] Implement local progress persistence with resume functionality
  - [x] Add periodic server sync during playback
  - [ ] Handle offline/online sync conflicts
  - [ ] Display listening sessions on item details screen (split sessions if paused >15min)

  #### Playback Tracking Store Implementation

  - [x] Database Schema Updates:
    - [x] Enhance existing localListeningSessions table
    - [x] Add playbackProgress table for real-time tracking
    - [x] Create performance indexes
  - [x] Service Architecture:
    - [x] Create PlaybackTrackingService singleton
    - [x] Implement progress persistence and retrieval
    - [x] Add periodic sync with server
    - [x] Handle offline/online state transitions
    - [ ] Handle conflicts between local and server progress
          **Integration Points:**
    - [x] Hook into existing PlayerService for progress updates
    - [x] Connect with SessionTrackingService for session management
    - [x] Integrate with existing progress sync mechanisms

### Real-time Updates

- [ ] **WebSocket Integration**
  - [ ] Implement WebSocket connection with authentication
    - [ ] Add connection state management and reconnection logic
    - [ ] Handle network state changes
  - [ ] Handle `user_item_progress_updated` events
    - [ ] Sync with local progress store
  - [ ] Support all official ABS event types (lower priority)

### Podcast Support

- [ ] **Full Podcast Implementation**
  - [ ] Podcast-specific UI components and layouts
  - [ ] Episode management and subscription features
  - [ ] Podcast-specific playback controls (skip silence, variable speed)
  - [ ] RSS feed integration and auto-updates
  - [ ] Podcast-specific progress tracking
- [ ] Don't add library as a sort/display filter. Have separate library and podcast tabs so users don't need
      to switch back and forth between libraries

## 🎵 Player Features

### Core Player

- [x] Small floating player
- [x] Full screen player
- [x] Stream content from server
- [ ] Embed Player UI in item details screen (and dismiss the floating player on this screen)
- [ ] Extract common player UI components for reuse
- [ ] Setup background hooks to sync media progress to server

### Player Enhancements

- [ ] Auto-download setting when streaming playback starts
- [ ] Track playing events (start, pause, sync progress, sync failed)
  - [ ] Show player events on item details screen
- [ ] Show duration of book on item details
- [ ] Advanced playback controls (sleep timer, bookmarking)

## 📚 Library Management

### Library Tab

- [x] Select first library in user's available libraries
- [x] Persist most recently selected library
- [x] Fetch books from selected library with caching
- [x] Use /items/batch endpoint for bulk fetching
- [x] Item details view with download functionality
- [x] Show progress of book

### Library Improvements

- [x] Fetch and cache covers
- [x] Sorting options (title, author, date added, progress)
- [ ] Collapse series options
- [x] Rows vs grid view toggle
- [ ] Advanced filtering and search

### Content Organization

- [ ] **Series Tab**
  - [ ] Fetch series and render books
  - [ ] Include progress information for accurate series tracking
- [ ] **Authors Tab**
  - [ ] Fetch author metadata from server
  - [ ] Link books to authors accurately
- [ ] **Narrators Tab**
  - [ ] Fetch narrator metadata and render narrators

## 📥 Download System

### Download Management

- [x] Book download with progress tracking
- [x] Debounce/smooth download rate and ETA calculations
- [x] Review and simplify/refactor download.ts
- [ ] Review and simplify/refactor libraryItemDetail.tsx
- [ ] Fix background downloader library (new architecture)
  - [ ] Expo plugin to modify app delegate for URL completion
- [x] Fix download cancellation not clearing progress UI

### Download Enhancements

- [ ] Show overall download progress in nav bar (circular progress bar)
- [ ] Batch download management
- [ ] Download queue prioritization
- [ ] Storage management and cleanup
- [ ] Download scheduling and automation

## 🛠️ Technical Improvements

### Database & Architecture

- [x] All marshalling code runs through helper functions
- [x] Helper code imported from @/db/helpers
- [x] Separate helper files for different types
- [x] Move local state to companion objects for better conflict handling
- [x] Implement proper data migration strategies

### Authentication & Security

- [x] Tokens not stored in database
- [x] Store last login date
- [x] Token refresh functionality
- [ ] Enhanced security for token storage
- [ ] Biometric authentication support

### Performance & UX

- [ ] Implement proper error boundaries
- [ ] Add loading states and skeleton screens
- [ ] Optimize image loading and caching
- [x] Implement proper offline support
- [ ] Show indicator when offline
- [ ] Add accessibility features
  - [ ] Ensure screen reader navigation works
- [ ]I18n

## 🔧 Infrastructure

### Background Services

- [ ] Background sync service
- [ ] Notification management
- [ ] Background download management
- [ ] Periodic cleanup tasks

## 📱 Platform Specific

### iOS

- [ ] CarPlay integration
- [ ] Home screen widgets
- [ ] Siri shortcuts
- [ ] Background app refresh optimization
- [ ] iOS-specific UI adaptations

### Android

- [ ] Android Auto integration
- [ ] Notification controls
- [ ] Background service optimization
- [ ] Material Design compliance

## 🧪 Testing & Quality

### Testing

- [ ] Unit tests for core services
- [ ] Integration tests for API calls
- [ ] E2E tests for critical user flows
- [ ] Performance testing

### Code Quality

- [ ] Comprehensive error handling
- [ ] Logging and monitoring
- [ ] Code documentation
- [ ] Performance profiling

## 🔄 Future Considerations

### Advanced Features

- [ ] Server aliases (e.g. local and remote DNS)
  - [ ] Config enhancements to fallback between server aliases (network state heuristic for given DNS?)
- [ ] Multi-server support
  - [ ] DB enhancements to associate libraries with servers
  - [ ] Config enhancements to query the correct server for a library
- [ ] Custom themes and personalization
- [ ] Social features (sharing, recommendations)

---

## 📋 Implementation Plans

### Playback Tracking Store Plan

1. **Database Schema Updates**

   - Enhance existing `localListeningSessions` table
   - Add `playbackProgress` table for real-time tracking
   - Create indexes for performance

2. **Service Architecture**

   - Create `PlaybackTrackingService` singleton
   - Implement progress persistence and retrieval
   - Add periodic sync with server
   - Handle offline/online state transitions

3. **Integration Points**
   - Hook into `PlayerService` for progress updates
   - Connect with `SessionTrackingService` for session management
   - Integrate with existing progress sync mechanisms

### WebSocket Integration Plan

1. **Connection Management**

   - Implement `WebSocketService` with authentication
   - Add connection state management and reconnection logic
   - Handle network state changes

2. **Event Handling**

   - Parse and handle `user_item_progress_updated` events
   - Support all official ABS event types
   - Update local progress store based on events
   - Implement event queuing for offline scenarios

3. **Integration**
   - Connect with `PlaybackTrackingService`
   - Update UI components in real-time
   - Handle conflicts between local and server progress

### Podcast Support Plan

1. **UI Components**

   - Create podcast-specific layouts and components
   - Implement episode list and detail views
   - Add subscription management interface

2. **Playback Features**

   - Podcast-specific playback controls
   - Skip silence and intro/outro detection
   - Variable playback speed with presets
   - Sleep timer and bookmarking

3. **Content Management**
   - RSS feed parsing and updates
   - Episode download and management
   - Subscription and notification system
   - Auto-download settings

---

_Last updated: [Current Date]_
_Total items: [Count] completed, [Count] pending_
