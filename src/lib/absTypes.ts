// Minimal ABS API types used by the app. Based on API docs
// https://api.audiobookshelf.org/#me

export type AbsUser = {
  id: string;
  username: string;
  type?: string | null;
  token?: string | null;
  lastSeen?: number | null;
  createdAt?: number | null;
  permissions?: AbsUserPermissions | null;
};

export type AbsLibrary = {
  id: string;
  name: string;
  mediaType?: string | null;
  createdAt?: number | null;
};

export type AbsLibraryItem = {
  id: string;
  libraryId: string;
  title?: string | null;
  mediaType?: string | null;
  author?: string | null;
  series?: string | null;
};

export type AbsUserPermissions = {
  download?: boolean;
  update?: boolean;
  delete?: boolean;
  upload?: boolean;
  accessAllLibraries?: boolean;
  accessAllTags?: boolean;
  accessExplicitContent?: boolean;
};

export type AbsMediaProgress = {
  id: string;
  libraryItemId: string;
  episodeId?: string | null;
  duration?: number | null;
  progress?: number | null;
  currentTime?: number | null;
  isFinished?: boolean | null;
  hideFromContinueListening?: boolean | null;
  lastUpdate?: number | null;
  startedAt?: number | null;
  finishedAt?: number | null;
};

export type MeResponse = {
  user: AbsUser;
  userDefaultLibraryId?: string | null;
  librariesAccessible?: AbsLibrary[];
  mediaProgress?: AbsMediaProgress[];
};
