// Audiobookshelf API Response Types
// Based on documentation: https://api.audiobookshelf.org/

// Base types used across multiple endpoints
export interface User {
  id: string;
  username: string;
  type: string;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  mediaProgress: MediaProgress[];
  seriesHideFromContinueListening: string[];
  bookmarks: AudioBookmark[];
  isActive: boolean;
  isLocked: boolean;
  lastSeen: number;
  createdAt: number;
  permissions: UserPermissions;
  librariesAccessible: string[];
  itemTagsAccessible: string[];
}

export interface UserPermissions {
  download: boolean;
  update: boolean;
  delete: boolean;
  upload: boolean;
  accessAllLibraries: boolean;
  accessAllTags: boolean;
  accessExplicitContent: boolean;
}

export interface MediaProgress {
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

export interface AudioBookmark {
  id: string;
  libraryItemId: string;
  title: string;
  time: number;
  createdAt: number;
}

export interface Library {
  id: string;
  name: string;
  folders: Folder[];
  displayOrder: number;
  icon: string;
  mediaType: 'book' | 'podcast';
  provider: string;
  settings: LibrarySettings;
  createdAt: number;
  lastUpdate: number;
}

export interface LibrarySettings {
  coverAspectRatio: number;
  disableWatcher: boolean;
  skipMatchingMediaWithAsin: boolean;
  skipMatchingMediaWithIsbn: boolean;
  autoScanCronExpression: string | null;
}

export interface Folder {
  id: string;
  fullPath: string;
  libraryId: string;
  addedAt: number;
}

export interface LibraryItem {
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
  media: Book | Podcast;
  libraryFiles: LibraryFile[];
}

export interface LibraryFile {
  ino: string;
  metadata: FileMetadata;
  addedAt: number;
  updatedAt: number;
  fileType: string;
}

export interface FileMetadata {
  filename: string;
  ext: string;
  path: string;
  relPath: string;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
}

export interface Book {
  id: string;
  libraryItemId: string;
  metadata: BookMetadata;
  coverPath: string | null;
  tags: string[];
  audioFiles: AudioFile[];
  chapters: BookChapter[];
  missingParts: unknown[];
  ebookFile: EBookFile | null;
}

export interface BookMetadata {
  title: string | null;
  subtitle: string | null;
  authors: Author[];
  narrators: string[];
  series: Series[];
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

export interface Author {
  id: string;
  asin: string | null;
  name: string;
  description: string | null;
  imagePath: string | null;
  addedAt: number;
  updatedAt: number;
}

export interface Series {
  id: string;
  name: string;
  description: string | null;
  addedAt: number;
  updatedAt: number;
  sequence: string | null;
}

export interface AudioFile {
  index: number;
  ino: string;
  metadata: FileMetadata;
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
  metaTags: AudioMetaTags;
  mimeType: string;
}

export interface AudioMetaTags {
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

export interface BookChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface EBookFile {
  ino: string;
  metadata: FileMetadata;
  ebookFormat: string;
  addedAt: number;
  updatedAt: number;
}

export interface Podcast {
  id: string;
  libraryItemId: string;
  metadata: PodcastMetadata;
  coverPath: string | null;
  tags: string[];
  episodes: PodcastEpisode[];
  autoDownloadEpisodes: boolean;
  autoDownloadSchedule: string;
  lastEpisodeCheck: number;
  maxEpisodesToKeep: number;
  maxNewEpisodesToDownload: number;
}

export interface PodcastMetadata {
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

export interface PodcastEpisode {
  libraryItemId: string;
  id: string;
  index: number;
  season: string | null;
  episode: string | null;
  episodeType: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  enclosure: PodcastEpisodeEnclosure | null;
  pubDate: string | null;
  audioFile: AudioFile | null;
  publishedAt: number | null;
  addedAt: number;
  updatedAt: number;
}

export interface PodcastEpisodeEnclosure {
  url: string;
  type: string;
  length: string | null;
}

export interface Collection {
  id: string;
  libraryId: string;
  userId: string;
  name: string;
  description: string | null;
  books: LibraryItem[];
  lastUpdate: number;
  createdAt: number;
}

export interface Playlist {
  id: string;
  libraryId: string;
  userId: string;
  name: string;
  description: string | null;
  coverPath: string | null;
  items: PlaylistItem[];
  lastUpdate: number;
  createdAt: number;
}

export interface PlaylistItem {
  libraryItemId: string;
  episodeId: string | null;
  libraryItem: LibraryItem;
  episode: PodcastEpisode | null;
}

// API Response Types
export interface LoginResponse {
  user: User;
  userDefaultLibraryId: string;
  serverSettings: Record<string, unknown>;
}

export interface MeResponse {
  user: User;
  userDefaultLibraryId: string;
  serverSettings: Record<string, unknown>;
}

export interface LibrariesResponse {
  libraries: Library[];
}

export interface LibraryResponse extends Library {}

export interface LibraryItemsResponse {
  results: LibraryItem[];
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

export interface LibraryItemResponse extends LibraryItem {}

// Error response type
export interface ApiError {
  error: string;
  message?: string;
}
