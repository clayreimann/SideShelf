import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';
import migrations from './migrations';

let sqliteDb: SQLite.SQLiteDatabase | null = null;

export function getSQLiteDb(): SQLite.SQLiteDatabase {
  if (!sqliteDb) {
    sqliteDb = SQLite.openDatabaseSync('app.db');
  }
  return sqliteDb;
}

export const db = drizzle(getSQLiteDb());

export async function ensureDatabaseInitialized(): Promise<void> {
  const raw = getSQLiteDb();
  raw.execSync(`PRAGMA journal_mode = WAL;`);
  await migrate(db, migrations);
}
