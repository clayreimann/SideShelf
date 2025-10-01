/**
 * Audiobookshelf API Response Types
 * Based on documentation: https://api.audiobookshelf.org/
 *
 * Note: These types represent the API response format and may differ
 * from database row types. Use ApiUser, ApiLibrary, etc. to distinguish
 * from database types (UserRow, LibraryRow, etc.)
 */

// Base types used across multiple endpoints
export interface ApiUser extends ApiMeResponse {
  accessToken?: string;
  refreshToken?: string;
}

export interface ApiUserPermissions {
  download: boolean;
  update: boolean;
  delete: boolean;
  upload: boolean;
  accessAllLibraries: boolean;
  accessAllTags: boolean;
  accessExplicitContent: boolean;
}

export interface ApiMediaProgress {
  id: string;
  libraryItemId: string;
  episodeId?: string;
  duration: number;
  progress: number;
  currentTime: number;
  isFinished: boolean;
  hideFromContinueListening: boolean;
  lastUpdate: number;
  startedAt: number;
  finishedAt: number | null;
}

export interface ApiAudioBookmark {
  id: string;
  libraryItemId: string;
  title: string;
  time: number;
  createdAt: number;
}

export interface ApiLibrary {
  id: string;
  name: string;
  folders: ApiFolder[];
  displayOrder: number;
  icon: string;
  mediaType: 'book' | 'podcast';
  provider: string;
  settings: ApiLibrarySettings;
  createdAt: number;
  lastUpdate: number;
}

export interface ApiLibrarySettings {
  coverAspectRatio: number;
  disableWatcher: boolean;
  skipMatchingMediaWithAsin: boolean;
  skipMatchingMediaWithIsbn: boolean;
  autoScanCronExpression: string | null;
}

export interface ApiFolder {
  id: string;
  fullPath: string;
  libraryId: string;
  addedAt: number;
}

export interface ApiLibraryItem {
  id: string;
  ino: string;
  libraryId: string;
  folderId: string;
  path: string;
  relPath: string;
  isFile: boolean;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  addedAt: number;
  updatedAt: number;
  lastScan: number;
  scanVersion: string;
  isMissing: boolean;
  isInvalid: boolean;
  mediaType: 'book' | 'podcast';
  media: ApiBook | ApiPodcast;
  libraryFiles: ApiLibraryFile[];
}

export interface ApiLibraryFile {
  ino: string;
  metadata: ApiFileMetadata;
  addedAt: number;
  updatedAt: number;
  fileType: string;
}

export interface ApiFileMetadata {
  filename: string;
  ext: string;
  path: string;
  relPath: string;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
}

export interface ApiBook {
  id: string;
  libraryItemId: string;
  metadata: ApiBookMetadata;
  coverPath: string | null;
  tags: string[];
  audioFiles: ApiAudioFile[];
  chapters: ApiBookChapter[];
  missingParts: unknown[];
  ebookFile: ApiEBookFile | null;
}

export interface ApiBookMetadata {
  title: string | null;
  subtitle: string | null;
  authors: ApiAuthor[];
  narrators: string[];
  series: ApiSeries[];
  genres: string[];
  publishedYear: string | null;
  publishedDate: string | null;
  publisher: string | null;
  description: string | null;
  isbn: string | null;
  asin: string | null;
  language: string | null;
  explicit: boolean;
  authorName: string;
  authorNameLF: string;
  narratorName: string;
  seriesName: string;
}

export interface ApiAuthor {
  id: string;
  asin: string | null;
  name: string;
  description: string | null;
  imagePath: string | null;
  addedAt: number;
  updatedAt: number;
}

export interface ApiSeries {
  id: string;
  name: string;
  description: string | null;
  addedAt: number;
  updatedAt: number;
  sequence: string | null;
}

export interface ApiAudioFile {
  index: number;
  ino: string;
  metadata: ApiFileMetadata;
  addedAt: number;
  updatedAt: number;
  trackNumFromMeta: number | null;
  discNumFromMeta: number | null;
  trackNumFromFilename: number | null;
  discNumFromFilename: number | null;
  manuallyVerified: boolean;
  exclude: boolean;
  error: string | null;
  format: string;
  duration: number;
  bitRate: number;
  language: string | null;
  codec: string;
  timeBase: string;
  channels: number;
  channelLayout: string;
  chapters: unknown[];
  embeddedCoverArt: string | null;
  metaTags: ApiAudioMetaTags;
  mimeType: string;
}

export interface ApiAudioMetaTags {
  tagAlbum: string | null;
  tagArtist: string | null;
  tagGenre: string | null;
  tagTitle: string | null;
  tagSeries: string | null;
  tagSeriesPart: string | null;
  tagTrack: string | null;
  tagDisc: string | null;
  tagSubtitle: string | null;
  tagAlbumArtist: string | null;
  tagDate: string | null;
  tagComposer: string | null;
  tagPublisher: string | null;
  tagComment: string | null;
  tagDescription: string | null;
  tagEncoder: string | null;
  tagEncodedBy: string | null;
  tagIsbn: string | null;
  tagLanguage: string | null;
  tagASIN: string | null;
  tagOverdriveMediaMarker: string | null;
  tagOriginalYear: string | null;
  tagReleaseCountry: string | null;
  tagReleaseType: string | null;
  tagReleaseStatus: string | null;
  tagISRC: string | null;
  tagMusicBrainzTrackId: string | null;
  tagMusicBrainzAlbumId: string | null;
  tagMusicBrainzAlbumArtistId: string | null;
  tagMusicBrainzArtistId: string | null;
}

export interface ApiBookChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface ApiEBookFile {
  ino: string;
  metadata: ApiFileMetadata;
  ebookFormat: string;
  addedAt: number;
  updatedAt: number;
}

export interface ApiPodcast {
  id: string;
  libraryItemId: string;
  metadata: ApiPodcastMetadata;
  coverPath: string | null;
  tags: string[];
  episodes: ApiPodcastEpisode[];
  autoDownloadEpisodes: boolean;
  autoDownloadSchedule: string;
  lastEpisodeCheck: number;
  maxEpisodesToKeep: number;
  maxNewEpisodesToDownload: number;
}

export interface ApiPodcastMetadata {
  title: string | null;
  author: string | null;
  description: string | null;
  releaseDate: string | null;
  genres: string[];
  feedUrl: string | null;
  imageUrl: string | null;
  itunesPageUrl: string | null;
  itunesId: string | null;
  itunesArtistId: string | null;
  explicit: boolean;
  language: string | null;
  type: string | null;
}

export interface ApiPodcastEpisode {
  libraryItemId: string;
  id: string;
  index: number;
  season: string | null;
  episode: string | null;
  episodeType: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  enclosure: ApiPodcastEpisodeEnclosure | null;
  pubDate: string | null;
  audioFile: ApiAudioFile | null;
  publishedAt: number | null;
  addedAt: number;
  updatedAt: number;
}

export interface ApiPodcastEpisodeEnclosure {
  url: string;
  type: string;
  length: string | null;
}

export interface ApiCollection {
  id: string;
  libraryId: string;
  userId: string;
  name: string;
  description: string | null;
  books: ApiLibraryItem[];
  lastUpdate: number;
  createdAt: number;
}

export interface ApiPlaylist {
  id: string;
  libraryId: string;
  userId: string;
  name: string;
  description: string | null;
  coverPath: string | null;
  items: ApiPlaylistItem[];
  lastUpdate: number;
  createdAt: number;
}

export interface ApiPlaylistItem {
  libraryItemId: string;
  episodeId: string | null;
  libraryItem: ApiLibraryItem;
  episode: ApiPodcastEpisode | null;
}

// API Response Types
export interface ApiLoginResponse {
  user: ApiUser;
  userDefaultLibraryId: string;
  serverSettings: Record<string, unknown>;
}

export interface ApiMeResponse {
  id: string;
  username: string;
  type: string;
  token?: string;
  mediaProgress: ApiMediaProgress[];
  seriesHideFromContinueListening: string[];
  bookmarks: ApiAudioBookmark[];
  isActive: boolean;
  isLocked: boolean;
  lastSeen: number;
  createdAt: number;
  permissions: ApiUserPermissions;
  librariesAccessible: string[];
  itemTagsAccessible: string[];
  hasOpenIDLink: boolean;
}

export interface ApiLibrariesResponse {
  libraries: ApiLibrary[];
}

// Filter data types for library filtering
export interface ApiFilterData {
  authors: ApiFilterAuthor[];
  genres: string[];
  tags: string[];
  series: ApiFilterSeries[];
  narrators: string[];
  languages: string[];
}

export interface ApiFilterAuthor {
  id: string;
  name: string;
}

export interface ApiFilterSeries {
  id: string;
  name: string;
}

export interface ApiLibraryResponse extends ApiLibrary {}

export interface ApiLibraryResponseWithFilterData  {
  filterdata: ApiFilterData;
  library: ApiLibrary;
  issues: number;
  numUserPlaylists: number;
}

export interface ApiLibraryItemsResponse {
  results: ApiLibraryItem[];
  total: number;
  limit: number;
  page: number;
  sortBy: string;
  sortDesc: boolean;
  filterBy: string;
  mediaType: string;
  minified: boolean;
  collapseseries: boolean;
  include: string;
}

export interface ApiLibraryItemResponse extends ApiLibraryItem {}

// Error response type
export interface ApiError {
  error: string;
  message?: string;
}

// Chapter interface from API (based on the sample data)
export interface ApiChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}
