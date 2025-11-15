import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";
import * as schema from "./schema";

const DB_NAME = "abs2.sqlite";

let sqliteDb: SQLite.SQLiteDatabase | null = null;
let drizzleDb: ExpoSQLiteDatabase<typeof schema> | null = null;

export function getSQLiteDb(): SQLite.SQLiteDatabase {
  if (!sqliteDb) {
    console.log("Opening SQLite database");
    // sqliteDb = SQLite.openDatabaseSync('app.sqlite');
    // sqliteDb = SQLite.openDatabaseSync('app.db');
    // sqliteDb = SQLite.openDatabaseSync('abs.db');
    // sqliteDb = SQLite.openDatabaseSync('abs.sqlite');
    sqliteDb = SQLite.openDatabaseSync(DB_NAME);
  }
  return sqliteDb;
}

/**
 * Get the current Drizzle database instance
 * This ensures we always have a valid instance even after database reset
 */
function getCurrentDb(): ExpoSQLiteDatabase<typeof schema> {
  if (!drizzleDb) {
    console.log("[db] Creating Drizzle instance");
    drizzleDb = drizzle(getSQLiteDb(), { schema });
  }
  return drizzleDb;
}

/**
 * Delete and recreate the database file
 * This will reset the database to a clean state
 */
export async function resetDatabaseFile(): Promise<void> {
  console.log("[db] Resetting database file...");

  // Close the current database connection
  if (sqliteDb) {
    try {
      sqliteDb.closeSync();
    } catch (error) {
      console.warn("[db] Error closing database:", error);
    }
    sqliteDb = null;
  }

  // Clear the drizzle instance so it gets recreated
  drizzleDb = null;

  // Delete the database file
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
    console.log("[db] Database file deleted");
  } catch (error) {
    console.warn("[db] Error deleting database file:", error);
  }

  // Re-open the database (creates a new empty file)
  getSQLiteDb();
  console.log("[db] Database file recreated");

  // Recreate the drizzle instance
  getCurrentDb();
  console.log("[db] Drizzle instance recreated");
}

/**
 * Database instance that always delegates to the current valid connection
 * This ensures the db export remains valid even after database resets
 */
export const db = new Proxy({} as ExpoSQLiteDatabase<typeof schema>, {
  get(_target, prop) {
    const currentDb = getCurrentDb();
    const value = currentDb[prop as keyof typeof currentDb];
    // Bind functions to the current db instance
    if (typeof value === "function") {
      return value.bind(currentDb);
    }
    return value;
  },
});
