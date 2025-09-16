// Initial schema migration
// Keep these statements in sync with the Drizzle schema in src/db/schema

export const id = '0000_initial';

export const queries = [
  `PRAGMA journal_mode = WAL;`,
  `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      type TEXT,
      token TEXT,
      created_at INTEGER,
      last_seen INTEGER
    );`,
  `CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      media_type TEXT,
      created_at INTEGER
    );`,
  `CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY,
      library_id TEXT NOT NULL,
      title TEXT,
      media_type TEXT,
      author TEXT,
      series TEXT,
      FOREIGN KEY (library_id) REFERENCES libraries(id) ON DELETE CASCADE
    );`,
];
