import { db } from '@/db/client';
import migrations from '@/db/migrations/migrations.js';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import React, { createContext, useContext, useMemo } from 'react';

type DbContextValue = {
  initialized: boolean;
  error: Error | null;
  db: typeof db;
};

const DbContext = createContext<DbContextValue | undefined>(undefined);

export function DbProvider({ children }: { children: React.ReactNode }) {
  const { success, error } = useMigrations(db, migrations);
  useDrizzleStudio(db.$client);

  console.log('db migrate - success', success);
  console.log('db migrate - error', error);
  const value = useMemo<DbContextValue>(() => ({
    initialized: !!success && !error,
    error: error ?? null,
    db: db,
  }), [success, error]);

  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb must be used within DbProvider');
  return ctx;
}
