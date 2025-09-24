/**
 * Test database utilities for setting up isolated test databases
 */

import migrations from '@/db/migrations/migrations';
import * as schema from '@/db/schema';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as SQLite from 'expo-sqlite';

// Create a unique database name for each test
let testDbCounter = 0;

export class TestDatabase {
  private sqliteDb: SQLite.SQLiteDatabase;
  private drizzleDb: ReturnType<typeof drizzle>;
  private dbName: string;

  constructor() {
    this.dbName = `test_db_${Date.now()}_${++testDbCounter}.sqlite`;
    this.sqliteDb = SQLite.openDatabaseSync(`:memory:`); // Use in-memory database for tests
    this.drizzleDb = drizzle(this.sqliteDb, { schema });

    // Set the mock database instances for the current test
    if ((global as any).setMockDb) {
      (global as any).setMockDb(this.drizzleDb);
    }
    if ((global as any).setMockSQLiteDb) {
      (global as any).setMockSQLiteDb(this.sqliteDb);
    }
  }

  /**
   * Initialize the test database with migrations
   */
  async initialize(): Promise<void> {
    try {
      await migrate(this.drizzleDb, migrations);
    } catch (error) {
      console.error('Failed to initialize test database:', error);
      throw error;
    }
  }

  /**
   * Get the Drizzle database instance
   */
  get db() {
    return this.drizzleDb;
  }

  /**
   * Get the SQLite database instance
   */
  get sqlite() {
    return this.sqliteDb;
  }

  /**
   * Clean up the database
   */
  async cleanup(): Promise<void> {
    try {
      // For in-memory databases, we just need to close the connection
      // The database will be automatically destroyed
      // Note: expo-sqlite might not have a close method, so we'll just let it be garbage collected
    } catch (error) {
      console.error('Failed to cleanup test database:', error);
    }
  }

  /**
   * Clear all tables (useful between tests)
   */
  async clearAllTables(): Promise<void> {
    const tables = [
      'users',
      'libraries',
      'libraryItems',
      'mediaMetadata',
      'audioFiles',
      'chapters',
      'libraryFiles',
      'authors',
      'series',
      'genres',
      'narrators',
      'languages',
      'tags',
      'mediaJoins',
      'mediaProgress',
    ];

    for (const table of tables) {
      try {
        await this.sqliteDb.execSync(`DELETE FROM ${table}`);
      } catch (error) {
        // Table might not exist, which is fine
        console.debug(`Could not clear table ${table}:`, error);
      }
    }
  }
}

/**
 * Create a fresh test database instance
 */
export async function createTestDb(): Promise<TestDatabase> {
  const testDb = new TestDatabase();
  await testDb.initialize();
  return testDb;
}

/**
 * Jest helper to setup and cleanup test database
 */
export function setupTestDb() {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.cleanup();
    }
  });

  return {
    getDb: () => testDb.db,
    getTestDb: () => testDb,
  };
}
