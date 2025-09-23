import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema';

let sqliteDb: SQLite.SQLiteDatabase | null = null;

export function getSQLiteDb(): SQLite.SQLiteDatabase {
  if (!sqliteDb) {
    console.log('Opening SQLite database');
    // sqliteDb = SQLite.openDatabaseSync('app.sqlite');
    // sqliteDb = SQLite.openDatabaseSync('app.db');
    // sqliteDb = SQLite.openDatabaseSync('abs.db');
    // sqliteDb = SQLite.openDatabaseSync('abs.sqlite');
    sqliteDb = SQLite.openDatabaseSync('abs2.sqlite');
  }
  return sqliteDb;
}

export const db = drizzle(getSQLiteDb(), { schema });
