/**
 * Test data fixtures for unit and integration tests
 *
 * This file provides realistic test data that matches the Audiobookshelf API structure
 * and database schema. Use these fixtures in tests to ensure consistency.
 */

import type {
  ApiBook,
  ApiLibrariesResponse,
  ApiLibrary,
  ApiLibraryItem,
  ApiLibraryItemsResponse,
  ApiLoginResponse,
  ApiMeResponse,
  ApiPodcast,
  ApiUser
} from '@/types/api';

import type {
  LibraryItemRow,
  LibraryRow,
  UserRow
} from '@/types/database';

// ApiUser fixtures
export const mockApiUser: ApiUser = {
  id: 'user-1',
  username: 'testuser',
  type: 'admin',
  token: 'test-token',
  createdAt: 1640995200000, // 2022-01-01
  lastSeen: 1672531200000, // 2023-01-01
  mediaProgress: [],
  seriesHideFromContinueListening: ['series-1', 'series-2'],
  bookmarks: [],
  isActive: true,
  isLocked: false,
  permissions: {
    download: true,
    update: true,
    delete: false,
    upload: true,
    accessAllLibraries: true,
    accessAllTags: true,
    accessExplicitContent: false,
  },
  librariesAccessible: [],
  itemTagsAccessible: [],
  hasOpenIDLink: false,
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
};

export const mockMeResponse: ApiMeResponse = {
  id: 'user-1',
  username: 'testuser',
  type: 'admin',
  token: 'test-token',
  createdAt: 1640995200000, // 2022-01-01
  lastSeen: 1672531200000, // 2023-01-01
  mediaProgress: [],
  seriesHideFromContinueListening: ['series-1', 'series-2'],
  bookmarks: [],
  isActive: true,
  isLocked: false,
  permissions: {
    download: true,
    update: true,
    delete: false,
    upload: true,
    accessAllLibraries: true,
    accessAllTags: true,
    accessExplicitContent: false,
  },
  librariesAccessible: [],
  itemTagsAccessible: [],
  hasOpenIDLink: false,
};

export const mockLoginResponse: ApiLoginResponse = {
  user: mockApiUser,
  userDefaultLibraryId: 'lib-1',
  serverSettings: {
    id: 'server-1',
    scannerFindCovers: true,
    scannerCoverProvider: 'audible',
    scannerParseSubtitle: true,
    scannerPreferMatchedMetadata: true,
    scannerDisableWatcher: false,
    storeCoverWithItem: false,
    storeMetadataWithItem: false,
    metadataFileFormat: 'json',
    rateLimitLoginRequests: 10,
    rateLimitLoginWindow: 600000,
    backupSchedule: false,
    backupsToKeep: 2,
    maxBackupSize: 1000000000,
    loggerDailyLogsToKeep: 7,
    loggerScannerLogsToKeep: 2,
    homeBookshelfView: 1,
    bookshelfView: 1,
    sortingIgnorePrefix: false,
    sortingPrefixes: ['the', 'a'],
    chromecastEnabled: false,
    dateFormat: 'MM/dd/yyyy',
    timeFormat: 'HH:mm',
    language: 'en-us',
    logLevel: 2,
    version: '2.0.0',
  },
};

export const mockUserRow: UserRow = {
  id: 'user-1',
  username: 'testuser',
  type: 'admin',
  createdAt: 1640995200000,
  lastSeen: 1672531200000,
  hideFromContinueListening: 'series-1,series-2',
  canDownload: true,
  canUpdate: true,
  canDelete: false,
  canUpload: true,
  canAccessAllLibraries: true,
  canAccessAllTags: true,
  canAccessExplicitContent: false,
};

// ApiLibrary fixtures
export const mockApiLibrary: ApiLibrary = {
  id: 'lib-1',
  name: 'My Books',
  folders: [
    {
      id: 'folder-1',
      fullPath: '/audiobooks',
      libraryId: 'lib-1',
      addedAt: 1640995200000,
    }
  ],
  displayOrder: 1,
  icon: 'database',
  mediaType: 'book',
  provider: 'audible',
  settings: {
    coverAspectRatio: 1,
    disableWatcher: false,
    skipMatchingMediaWithAsin: false,
    skipMatchingMediaWithIsbn: false,
    autoScanCronExpression: null,
  },
  createdAt: 1640995200000,
  lastUpdate: 1672531200000,
};

export const mockApiPodcastLibrary: ApiLibrary = {
  id: 'lib-2',
  name: 'My Podcasts',
  folders: [
    {
      id: 'folder-2',
      fullPath: '/podcasts',
      libraryId: 'lib-2',
      addedAt: 1640995200000,
    }
  ],
  displayOrder: 2,
  icon: 'podcast',
  mediaType: 'podcast',
  provider: 'itunes',
  settings: {
    coverAspectRatio: 1,
    disableWatcher: false,
    skipMatchingMediaWithAsin: false,
    skipMatchingMediaWithIsbn: false,
    autoScanCronExpression: null,
  },
  createdAt: 1640995200000,
  lastUpdate: 1672531200000,
};

export const mockLibrariesResponse: ApiLibrariesResponse = {
  libraries: [mockApiLibrary, mockApiPodcastLibrary],
};

export const mockLibraryRow: LibraryRow = {
  id: 'lib-1',
  name: 'My Books',
  icon: 'database',
  displayOrder: 1,
  mediaType: 'book',
  createdAt: 1640995200000,
  updatedAt: 1672531200000,
};

export const mockPodcastLibraryRow: LibraryRow = {
  id: 'lib-2',
  name: 'My Podcasts',
  icon: 'podcast',
  displayOrder: 2,
  mediaType: 'podcast',
  createdAt: 1640995200000,
  updatedAt: 1672531200000,
};

// ApiBook fixtures
export const mockBook: ApiBook = {
  id: 'media-1',
  libraryItemId: 'li-1',
  metadata: {
    title: 'The Great Gatsby',
    subtitle: 'A Classic Novel',
    authors: [
      {
        id: 'author-1',
        name: 'F. Scott Fitzgerald',
        asin: null,
        description: null,
        imagePath: null,
        addedAt: 1640995200000,
        updatedAt: 1640995200000,
      }
    ],
    narrators: ['Jim Dale'],
    series: [
      {
        id: 'series-1',
        name: 'Classic Literature',
        sequence: '1',
        description: null,
        addedAt: 1640995200000,
        updatedAt: 1640995200000,
      }
    ],
    genres: ['Fiction', 'Classic'],
    publishedYear: '1925',
    publishedDate: '1925-04-10',
    publisher: 'Scribner',
    description: 'A classic American novel set in the Jazz Age.',
    isbn: '9780743273565',
    asin: 'B000FC2L1I',
    language: 'en',
    explicit: false,
    authorName: 'F. Scott Fitzgerald',
    authorNameLF: 'Fitzgerald, F. Scott',
    narratorName: 'Jim Dale',
    seriesName: 'Classic Literature',
  },
  coverPath: '/covers/book1.jpg',
  tags: ['classic', 'american-literature'],
  audioFiles: [
    {
      index: 1,
      ino: '1234567890',
      metadata: {
        filename: 'chapter01.mp3',
        ext: '.mp3',
        path: '/audiobooks/gatsby/chapter01.mp3',
        relPath: 'chapter01.mp3',
        size: 15728640,
        mtimeMs: 1640995200000,
        ctimeMs: 1640995200000,
        birthtimeMs: 1640995200000,
      },
      addedAt: 1640995200000,
      updatedAt: 1640995200000,
      trackNumFromMeta: 1,
      discNumFromMeta: 1,
      trackNumFromFilename: 1,
      discNumFromFilename: 1,
      manuallyVerified: false,
      exclude: false,
      error: null,
      format: 'MP3',
      duration: 3600.5,
      bitRate: 128000,
      language: 'en',
      codec: 'mp3',
      timeBase: '1/14112000',
      channels: 2,
      channelLayout: 'stereo',
      chapters: [],
      embeddedCoverArt: null,
      metaTags: {
        tagAlbum: 'The Great Gatsby',
        tagArtist: 'F. Scott Fitzgerald',
        tagGenre: 'Fiction',
        tagTitle: 'Chapter 1',
        tagSeries: null,
        tagSeriesPart: null,
        tagTrack: '1/20',
        tagDisc: null,
        tagSubtitle: null,
        tagAlbumArtist: 'F. Scott Fitzgerald',
        tagDate: '1925',
        tagComposer: null,
        tagPublisher: null,
        tagComment: null,
        tagDescription: null,
        tagEncoder: null,
        tagEncodedBy: null,
        tagIsbn: null,
        tagLanguage: null,
        tagASIN: null,
        tagOverdriveMediaMarker: null,
        tagOriginalYear: null,
        tagReleaseCountry: null,
        tagReleaseType: null,
        tagReleaseStatus: null,
        tagISRC: null,
        tagMusicBrainzTrackId: null,
        tagMusicBrainzAlbumId: null,
        tagMusicBrainzAlbumArtistId: null,
        tagMusicBrainzArtistId: null,
      },
      mimeType: 'audio/mpeg',
    }
  ],
  chapters: [
    {
      id: 0,
      start: 0,
      end: 3600.5,
      title: 'Chapter 1',
    }
  ],
  missingParts: [],
  ebookFile: null,
};

// ApiPodcast fixtures
export const mockPodcast: ApiPodcast = {
  id: 'media-2',
  libraryItemId: 'li-2',
  metadata: {
    title: 'Tech Talk ApiPodcast',
    author: 'Tech Experts',
    description: 'Weekly discussions about the latest in technology.',
    releaseDate: '2023-01-01',
    genres: ['Technology', 'Education'],
    feedUrl: 'https://example.com/tech-talk/feed.xml',
    imageUrl: 'https://example.com/tech-talk/cover.jpg',
    itunesPageUrl: 'https://podcasts.apple.com/us/podcast/tech-talk/id123456789',
    itunesId: '123456789',
    itunesArtistId: '987654321',
    explicit: false,
    language: 'en',
    type: 'episodic',
  },
  coverPath: '/covers/podcast1.jpg',
  tags: ['technology', 'weekly'],
  episodes: [
    {
      libraryItemId: 'li-2',
      id: 'ep-1',
      index: 1,
      season: '1',
      episode: '1',
      episodeType: 'full',
      title: 'Introduction to AI',
      subtitle: 'Understanding artificial intelligence basics',
      description: 'In this episode, we explore the fundamentals of AI.',
      enclosure: {
        url: 'https://example.com/episodes/ep1.mp3',
        type: 'audio/mpeg',
        length: '25165824',
      },
      pubDate: 'Mon, 01 Jan 2023 10:00:00 GMT',
      audioFile: {
        index: 1,
        ino: '2345678901',
        metadata: {
          filename: 'ep1.mp3',
          ext: '.mp3',
          path: '/podcasts/tech-talk/ep1.mp3',
          relPath: 'ep1.mp3',
          size: 25165824,
          mtimeMs: 1672531200000,
          ctimeMs: 1672531200000,
          birthtimeMs: 1672531200000,
        },
        addedAt: 1672531200000,
        updatedAt: 1672531200000,
        trackNumFromMeta: null,
        discNumFromMeta: null,
        trackNumFromFilename: null,
        discNumFromFilename: null,
        manuallyVerified: false,
        exclude: false,
        error: null,
        format: 'MP3',
        duration: 1800,
        bitRate: 128000,
        language: 'en',
        codec: 'mp3',
        timeBase: '1/14112000',
        channels: 2,
        channelLayout: 'stereo',
        chapters: [],
        embeddedCoverArt: null,
        metaTags: {
          tagAlbum: 'Tech Talk ApiPodcast',
          tagArtist: 'Tech Experts',
          tagGenre: null,
          tagTitle: 'Introduction to AI',
          tagSeries: null,
          tagSeriesPart: null,
          tagTrack: null,
          tagDisc: null,
          tagSubtitle: null,
          tagAlbumArtist: null,
          tagDate: null,
          tagComposer: null,
          tagPublisher: null,
          tagComment: null,
          tagDescription: null,
          tagEncoder: null,
          tagEncodedBy: null,
          tagIsbn: null,
          tagLanguage: null,
          tagASIN: null,
          tagOverdriveMediaMarker: null,
          tagOriginalYear: null,
          tagReleaseCountry: null,
          tagReleaseType: null,
          tagReleaseStatus: null,
          tagISRC: null,
          tagMusicBrainzTrackId: null,
          tagMusicBrainzAlbumId: null,
          tagMusicBrainzAlbumArtistId: null,
          tagMusicBrainzArtistId: null,
        },
        mimeType: 'audio/mpeg',
      },
      publishedAt: 1672531200000,
      addedAt: 1672531200000,
      updatedAt: 1672531200000,
    }
  ],
  autoDownloadEpisodes: false,
  autoDownloadSchedule: '0 * * * *',
  lastEpisodeCheck: 1672531200000,
  maxEpisodesToKeep: 0,
  maxNewEpisodesToDownload: 3,
};

// ApiLibrary Item fixtures
export const mockBookLibraryItem: ApiLibraryItem = {
  id: 'li-1',
  ino: '1111111111',
  libraryId: 'lib-1',
  folderId: 'folder-1',
  path: '/audiobooks/gatsby',
  relPath: 'gatsby',
  isFile: false,
  mtimeMs: 1640995200000,
  ctimeMs: 1640995200000,
  birthtimeMs: 1640995200000,
  addedAt: 1640995200000,
  updatedAt: 1672531200000,
  lastScan: 1672531200000,
  scanVersion: '2.0.0',
  isMissing: false,
  isInvalid: false,
  mediaType: 'book',
  media: mockBook,
  libraryFiles: [
    {
      ino: '1234567890',
      metadata: {
        filename: 'chapter01.mp3',
        ext: '.mp3',
        path: '/audiobooks/gatsby/chapter01.mp3',
        relPath: 'chapter01.mp3',
        size: 15728640,
        mtimeMs: 1640995200000,
        ctimeMs: 1640995200000,
        birthtimeMs: 1640995200000,
      },
      addedAt: 1640995200000,
      updatedAt: 1640995200000,
      fileType: 'audio',
    }
  ],
};

export const mockPodcastLibraryItem: ApiLibraryItem = {
  id: 'li-2',
  ino: '2222222222',
  libraryId: 'lib-2',
  folderId: 'folder-2',
  path: '/podcasts/tech-talk',
  relPath: 'tech-talk',
  isFile: false,
  mtimeMs: 1672531200000,
  ctimeMs: 1672531200000,
  birthtimeMs: 1672531200000,
  addedAt: 1672531200000,
  updatedAt: 1672531200000,
  lastScan: 1672531200000,
  scanVersion: '2.0.0',
  isMissing: false,
  isInvalid: false,
  mediaType: 'podcast',
  media: mockPodcast,
  libraryFiles: [
    {
      ino: '2345678901',
      metadata: {
        filename: 'ep1.mp3',
        ext: '.mp3',
        path: '/podcasts/tech-talk/ep1.mp3',
        relPath: 'ep1.mp3',
        size: 25165824,
        mtimeMs: 1672531200000,
        ctimeMs: 1672531200000,
        birthtimeMs: 1672531200000,
      },
      addedAt: 1672531200000,
      updatedAt: 1672531200000,
      fileType: 'audio',
    }
  ],
};

export const mockLibraryItemsResponse: ApiLibraryItemsResponse = {
  results: [mockBookLibraryItem, mockPodcastLibraryItem],
  total: 2,
  limit: 0,
  page: 0,
  sortBy: 'addedAt',
  sortDesc: true,
  filterBy: 'all',
  mediaType: 'book',
  minified: false,
  collapseseries: false,
  include: 'progress,rssfeed',
};

// Database row fixtures
export const mockLibraryItemRow: LibraryItemRow = {
  id: 'li-1',
  ino: 1111111111,
  libraryId: 'lib-1',
  folderId: 'folder-1',
  path: '/audiobooks/gatsby',
  relPath: 'gatsby',
  isFile: false,
  mtimeMs: 1640995200000,
  ctimeMs: 1640995200000,
  birthtimeMs: 1640995200000,
  addedAt: 1640995200000,
  updatedAt: 1672531200000,
  lastScan: 1672531200000,
  scanVersion: 2,
  isMissing: false,
  isInvalid: false,
  mediaType: 'book',
};

export const mockPodcastLibraryItemRow: LibraryItemRow = {
  id: 'li-2',
  ino: 2222222222,
  libraryId: 'lib-2',
  folderId: 'folder-2',
  path: '/podcasts/tech-talk',
  relPath: 'tech-talk',
  isFile: false,
  mtimeMs: 1672531200000,
  ctimeMs: 1672531200000,
  birthtimeMs: 1672531200000,
  addedAt: 1672531200000,
  updatedAt: 1672531200000,
  lastScan: 1672531200000,
  scanVersion: 2,
  isMissing: false,
  isInvalid: false,
  mediaType: 'podcast',
};

// Array fixtures for bulk operations
export const mockLibraries = [mockLibraryRow, mockPodcastLibraryRow];
export const mockLibraryItems = [mockLibraryItemRow, mockPodcastLibraryItemRow];
export const mockApiLibraries = [mockApiLibrary, mockApiPodcastLibrary];
export const mockApiLibraryItems = [mockBookLibraryItem, mockPodcastLibraryItem];
