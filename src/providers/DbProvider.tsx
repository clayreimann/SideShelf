import { db, resetDatabaseFile } from "@/db/client";
import migrations from "@/db/migrations/migrations.js";
import { DbErrorScreen } from "@/components/errors/DbErrorScreen";
import { logger } from "@/lib/logger";
import { useMigrations } from "drizzle-orm/expo-sqlite/migrator";
import { useDrizzleStudio } from "expo-drizzle-studio-plugin";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type DbContextValue = {
  initialized: boolean;
  error: Error | null;
  db: typeof db;
  resetDatabase: () => Promise<void>;
};

const DbContext = createContext<DbContextValue | undefined>(undefined);

export function DbProvider({ children }: { children: React.ReactNode }) {
  const [resetKey, setResetKey] = useState(0);
  const { success, error } = useMigrations(db, migrations);
  // @ts-ignore (ignore private property `nativeDatabase`)
  useDrizzleStudio(db.$client);

  console.log(
    `[db migrate] - migration version=${migrations.journal.version} migrations=[${Object.keys(migrations.migrations).join(", ")}] success=${success} error=${error}`
  );

  const handleResetDatabase = useCallback(async () => {
    console.log("[DbProvider] Resetting database...");
    await resetDatabaseFile();
    // Force re-run migrations by changing the key
    // This will cause the component to remount and migrations to run again
    setResetKey((prev) => prev + 1);
    console.log("[DbProvider] Database reset complete, migrations will re-run");
  }, []);

  const value = useMemo<DbContextValue>(
    () => ({
      initialized: !!success && !error,
      error: error ?? null,
      db: db,
      resetDatabase: handleResetDatabase,
    }),
    [success, error, handleResetDatabase]
  );

  if (error) {
    logger.error("DbProvider", "Database migration failed", error);
    return <DbErrorScreen error={error} onReset={handleResetDatabase} />;
  }

  if (!success) {
    // Migrations still running — return null so splash screen remains visible
    return null;
  }

  return (
    <DbContext.Provider value={value} key={resetKey}>
      {children}
    </DbContext.Provider>
  );
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error("useDb must be used within DbProvider");
  return ctx;
}
