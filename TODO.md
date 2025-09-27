# To Do

## Next:
- [ ] Book download
  - [ ] debounce/smoothe dl rate and ETA calculations
  - [ ] review and simplify/refactor download.ts
  - [ ] review and simplify/refactor libraryItemDetail.tsx
  - [ ] Fix background downloader library (new architecture, etc)
- [ ] Player UI on item details screen
- [ ] Add now playing to home screen
- [x] Home screen continue listening list
- [ ] Stream content from server
  - [ ] setting to auto download items when streaming playback starts?
- [ ] Small floating player
- [ ] Full screen player
- [ ] Track playing events (start, pause, sync progress, sync failed)
  - [ ] Display listening sessions on item details screen (split sessions if paused for more than 15 minutes–configurable)

## Library tab
- [x] select the first library in the user's available libraries
- [x] persist the most recently selected library in local storage and default to that if it's available
- [x] fetch books from the selected library
  - [x] display from cache after the first run
  - [ ] use the /items/batch endpoint to fetch books in bulk
    - start with books that have progress information
    - batch size should be 50
    - update the cache with books and joins
    - remove join caching from library provider refresh
    - add new table to track library item full refresh date, ensure full refresh at least 3 days after last full refresh
    - add debounce so that batches are not run more than once per minute
- [x] item details view
  - [ ] download item to local storage
  - [ ] show progress of book
  - [ ] show duration of book
- [ ] fetch and cache covers
- [ ] sorting options
- [ ] collapse series options
- [ ] rows vs grid view

## Player
- add persistent player UI hovering just above tab bar (maybe using {router.slot}?)
- add react-native-track-player dependency
- setup background hooks to sync the media progress back to the server
- add a modal full-screen player that hides the floating player

## Series tab

- fetch series and render books
- fetch each series and include progress information to capture acutal series

## Authors

- fetch author metadata from server and render authors
- fetch each author and include items to accurately link books to authors

## Narrators

- fetch narrator metadata and render narrators

## Components

- common book entry view for flatlist


## Reset
- [x] Add a button under advanced to reset the database and log out

## General
- [x] All code for marshalling responses and inserting rows should run through helper code
- [x] Helper code should be imported from @/db/helpers
- [x] Helpers for different types should be in separate files

## AuthProvider
- [x] Tokens should not be stored in the database
- [x] Should store last log-in date
- [x] Vends function for API to ask for token refresh

## LibraryProvider
LibraryProvider shape:
- [x] track list of libraries (ordered by displayOrder)
- [x] track currently selected library
- [x] track list of items in the selected library (projected to minimal fields for grid/rows)
- [x] have a function to refresh the list of libraries
- [x] have a function to refresh the library

LibraryProvider implementation:
- call helpers in a separate file to marshal the data into the database
- on load if the user is authorized and no libraries are found fetch the list of libraries from the server
- after libraries are fetched, if there is no selected library, select the first library
- when a library is selected
    - refresh the library with include=filterdata, filter data includes authors, series, genres, narrators
        - the data included in the filter data should be used to populate/update/prune related tables (authors, series, genres, narrators)
    - refresh the list of items in the selected library
        - authors, series, genres, narrators from library items should only be used to populate join tables

## Downloader fixes

- progress update time floatValue instead of intValue
- update event emitting to use enqueueEvent instead of sendEventWithName
