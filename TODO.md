# Audiobookshelf React Native - TODO

## 🚨 **CRITICAL PRE-LAUNCH ITEMS** (Priority 0)

### Legal & Compliance

- [ ] **Create Privacy Policy** - REQUIRED for App Store/Play Store
  - [ ] Document what data is collected (server URLs, usernames, playback progress)
  - [ ] Explain how data is stored locally vs on user's server
  - [ ] Add privacy policy link to app and store listings
  - [ ] Host privacy policy on a public URL
- [ ] **Create Terms of Service / EULA**
  - [ ] Clarify that app requires user's own Audiobookshelf server
  - [ ] Disclaimer about content responsibility
- [ ] **Add "About" section with legal links**
  - [ ] Add privacy policy link to Settings/More screen
  - [ ] Add terms of service link
  - [ ] Add support/contact information
  - [ ] Add app version display

### Internationalization (i18n)

- [ ] **Implement i18n system** (like the existing audiobookshelf-app)
  - [ ] Add i18n library (e.g., react-i18next or similar)
  - [ ] Create string resource files structure
  - [ ] Extract ALL hardcoded strings from UI components
  - [ ] Create en-us.json as base language
  - [ ] Update login screen strings
  - [ ] Update library detail screen strings
  - [ ] Update player UI strings
  - [ ] Update settings strings
  - [ ] Update error messages
  - [ ] Update all button labels, placeholders, and messages

### App Store Requirements

- [ ] **Prepare App Store Screenshots** (required for both stores)
  - [ ] iPhone 6.7" display (required for iOS)
  - [ ] iPhone 5.5" display (required for iOS)
  - [ ] iPad Pro 12.9" display (optional but recommended)
  - [ ] Android phone screenshots (multiple sizes)
  - [ ] Android tablet screenshots (optional but recommended)
  - [ ] Create compelling screenshots showing key features
- [ ] **Write App Store Description**
  - [ ] Compelling short description (80 chars for iOS subtitle)
  - [ ] Full description highlighting features
  - [ ] Keywords for discoverability
  - [ ] What's New section for v1.0.0
- [ ] **Prepare Promotional Assets**
  - [ ] App icon (already have: icon.png)
  - [ ] Feature graphic for Google Play
  - [ ] Promo video (optional but recommended)
- [ ] **Update App Store URLs in README**
  - [ ] Add correct iOS App Store URL
  - [ ] Add correct Google Play Store URL
  - [ ] Update repository URL if needed

### Production Configuration

- [ ] **Remove/Minimize Console Logging** (379 console.log statements found!)
  - [ ] Create production logging utility that conditionally logs
  - [ ] Replace console.log with proper logger in services
  - [ ] Replace console.error with proper error tracking
  - [ ] Keep critical error logs, remove debug logs
  - [ ] Or: Use babel-plugin-transform-remove-console for production builds
- [ ] **Add Error Tracking/Crash Reporting**
  - [ ] Integrate Sentry or similar crash reporting
  - [ ] Add error boundaries to catch React errors
  - [ ] Configure proper source maps for stack traces
  - [ ] Test crash reporting in production mode
- [ ] **Add Analytics (Optional but Recommended)**
  - [ ] Consider privacy-friendly analytics
  - [ ] Track key user flows (login, downloads, playback)
  - [ ] Track errors and failures
  - [ ] Ensure GDPR compliance
- [ ] **Verify Environment Variables**
  - [ ] Ensure no development URLs are hardcoded
  - [ ] Verify all sensitive config is properly secured
  - [ ] Check for any API keys that shouldn't be in code
- [ ] **Update app.json metadata**
  - [ ] Verify correct bundle identifiers
  - [ ] Update description
  - [ ] Verify permissions are correctly listed
  - [ ] Add App Store metadata (iOS)
  - [ ] Add Google Play metadata (Android)

### Testing & Quality Assurance

- [ ] **Comprehensive Testing**
  - [ ] Test on physical iOS device (not just simulator)
  - [ ] Test on physical Android device (not just emulator)
  - [ ] Test on different screen sizes
  - [ ] Test with slow network conditions
  - [ ] Test offline mode thoroughly
  - [ ] Test download and playback interruptions
  - [ ] Test app backgrounding/foregrounding
  - [ ] Test with low storage space
  - [ ] Test with different server versions
  - [ ] Test login/logout flows
  - [ ] Test token expiration and refresh
- [ ] **Beta Testing**
  - [ ] Set up TestFlight for iOS beta
  - [ ] Set up Google Play internal testing
  - [ ] Recruit beta testers
  - [ ] Collect and address feedback
  - [ ] Fix critical bugs found in beta
- [ ] **Expand Test Coverage**
  - [ ] Add more unit tests (currently only 5 test files)
  - [ ] Add integration tests for critical flows
  - [ ] Add E2E tests for main user journeys
  - [ ] Test error handling thoroughly

### Documentation & Support

- [ ] **Update README.md**
  - [ ] Add screenshots/demo
  - [ ] Clarify installation instructions
  - [ ] Add troubleshooting section
  - [ ] Add FAQ section
  - [ ] Update feature list to match reality
  - [ ] Add badge for app store availability
- [ ] **Create User Documentation**
  - [ ] Getting started guide
  - [ ] How to connect to server
  - [ ] How to download content
  - [ ] How to use player features
  - [ ] Common troubleshooting steps
- [ ] **Set up Support Channels**
  - [ ] Create GitHub Discussions or similar
  - [ ] Add support email or contact method
  - [ ] Link to Audiobookshelf Discord
  - [ ] Create issue templates

### Code Quality & Security

- [ ] **Security Audit**
  - [ ] Review token storage (currently using SecureStore - good!)
  - [ ] Ensure sensitive data isn't logged
  - [ ] Review all network calls for security
  - [ ] Verify SSL/TLS is enforced where possible
  - [ ] Check for any hardcoded credentials
- [ ] **Performance Optimization**
  - [ ] Profile app performance
  - [ ] Optimize image loading and caching
  - [ ] Optimize database queries
  - [ ] Check for memory leaks
  - [ ] Optimize bundle size
- [ ] **Code Cleanup**
  - [ ] Remove commented code
  - [ ] Remove unused imports
  - [ ] Remove unused files/components
  - [ ] Ensure consistent code style
  - [ ] Run linter and fix all warnings
  - [ ] Add JSDoc to public APIs

### Build & Release Preparation

- [ ] **Configure Production Builds**
  - [ ] Test production iOS build
  - [ ] Test production Android build
  - [ ] Verify app signing is configured
  - [ ] Set up automated versioning
  - [ ] Configure OTA updates (if using)
- [ ] **App Store Submission Prep**
  - [ ] Review Apple App Store guidelines
  - [ ] Review Google Play Store guidelines
  - [ ] Prepare answers for review questions
  - [ ] Create demo account for reviewers (if needed)
  - [ ] Prepare demo server for reviewers (if needed)
- [ ] **Version Management**
  - [ ] Create release branching strategy
  - [ ] Tag v1.0.0 release
  - [ ] Create CHANGELOG.md
  - [ ] Document release process

---

## 🚀 High Priority Features

### Build issues

- [x] Separate branch of downloader library on my fork to enable consistent building
- [x] Embed fonts in app build
- [x] Provide prompt to reauthorize when refresh token is expired
- [x] Manage creds in expo CLI
- [x] Downloaded files should only store paths relative to app bundle and we should resolve absolute file paths at runtime
- [x] Conditionally use native tabs for ios 26+
- [x] Sessions for downloaded media are not being correctly created, streaming progress works fine, but progress from local items appears to create the session but subsequent syncs fail
- [x] Fetch currently playing/most recent item status from TrackPlayer
- [x] PlayerService should be the single entrypoint to play/pause tracks.
  - [x] PlayerService updates store state for accurate tracking
  - [x] PlayerService stores/remembers the last played item so that the floating player can be
        populated on start (for downloaded media)
  - [x] ProgressService should not close the current session if the new session is for the same
        item (unless timeout expired)
  - [x] ProgressService should check on startup for dangling sessions (crash or memory pressure quit) and close them
- [x] PlayerService.PlayerTrack should take the resume position
- [x] PlayerService should update the track metadata with new chapter information
- [ ] Add background task service library to end sessions after 10 minutes of inactivity

### Misc/Bugs

- [ ] Refactor the new cover home screen to use a section list
- [ ] Download All button in series
- [ ] Download next item in series when X time left
- [x] When the mini-player is shown add padding to the bottom of views so that you can scroll all the way to the bottom
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
- [x] Extract common player UI components for reuse
- [x] Setup background hooks to sync media progress to server

### Player Enhancements

- [ ] Auto-download setting when streaming playback starts
- [ ] Record playing events (start, pause, sync progress, sync failed)
  - [ ] Show player events on item details screen
- [x] Show duration of book on item details
- [ ] Advanced playback controls (sleep timer, bookmarking)
  - [x] Sleep timer
  - [ ] Bookmarking

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
- [x] Advanced filtering and search

### Content Organization

- [x] **Series Tab**
  - [x] Fetch series and render books
  - [ ] Show which items in a series have been played
- [x] **Authors Tab**
  - [x] Fetch author metadata from server
  - [x] Link books to authors accurately
- [ ] **Narrators Tab**
  - [ ] Fetch narrator metadata and render narrators

## 📥 Download System

### Download Management

- [x] Book download with progress tracking
- [x] Debounce/smooth download rate and ETA calculations
- [x] Review and simplify/refactor download.ts
- [x] Review and simplify/refactor libraryItemDetail.tsx
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
- [x] Optimize image loading and caching
- [x] Implement proper offline support
- [ ] Show indicator when offline
- [ ] Add accessibility features
  - [ ] Ensure screen reader navigation works
  - [x] Test VoiceOver (iOS) and TalkBack (Android)
  - [ ] Add proper accessibility labels

## 🔧 Infrastructure

### Background Services

- [x] Background sync service
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
- [x] Logging and monitoring
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

_Last updated: November 9, 2025_
_Critical pre-launch items: ~40 items_
_Total items: ~150+ items across all priorities_
