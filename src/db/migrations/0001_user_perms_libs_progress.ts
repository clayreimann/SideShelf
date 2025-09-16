export const id = '0001_user_perms_libs_progress';

export const queries = [
  `ALTER TABLE users ADD COLUMN permissions_json TEXT;`,
  `CREATE TABLE IF NOT EXISTS user_libraries (
    user_id TEXT NOT NULL,
    library_id TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(library_id) REFERENCES libraries(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS media_progress (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    library_item_id TEXT NOT NULL,
    episode_id TEXT,
    duration REAL,
    progress REAL,
    current_time REAL,
    is_finished INTEGER,
    hide_from_continue_listening INTEGER,
    last_update INTEGER,
    started_at INTEGER,
    finished_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );`,
];
