import { db } from '@/db/client';
import { users } from '@/db/schema/users';
import { LoginResponse, MeResponse, User } from '@/lib/api/types';
import { eq } from 'drizzle-orm';

export type NewUserRow = typeof users.$inferInsert;
export type UserRow = typeof users.$inferSelect;

// Extracts minimal user fields needed for our users table from /me or /login responses
export function marshalUserFromAuthResponse(data: MeResponse | LoginResponse): NewUserRow | null {
  if (!data?.user?.id || !data.user.username) return null;

  const user = data.user;
  const perms = user.permissions;

  const row: NewUserRow = {
    id: user.id,
    username: user.username,
    type: user.type ?? null,
    createdAt: user.createdAt ?? null,
    lastSeen: user.lastSeen ?? null,
    hideFromContinueListening: user.seriesHideFromContinueListening?.length
      ? user.seriesHideFromContinueListening.join(',')
      : null,
    canDownload: perms?.download ?? null,
    canUpdate: perms?.update ?? null,
    canDelete: perms?.delete ?? null,
    canUpload: perms?.upload ?? null,
    canAccessAllLibraries: perms?.accessAllLibraries ?? null,
    canAccessAllTags: perms?.accessAllTags ?? null,
    canAccessExplicitContent: perms?.accessExplicitContent ?? null,
  };
  return row;
}

// Alternative function that accepts a User object directly
export function marshalUserFromUser(user: User): NewUserRow | null {
  if (!user?.id || !user.username) return null;

  const perms = user.permissions;

  const row: NewUserRow = {
    id: user.id,
    username: user.username,
    type: user.type ?? null,
    createdAt: user.createdAt ?? null,
    lastSeen: user.lastSeen ?? null,
    hideFromContinueListening: user.seriesHideFromContinueListening?.length
      ? user.seriesHideFromContinueListening.join(',')
      : null,
    canDownload: perms?.download ?? null,
    canUpdate: perms?.update ?? null,
    canDelete: perms?.delete ?? null,
    canUpload: perms?.upload ?? null,
    canAccessAllLibraries: perms?.accessAllLibraries ?? null,
    canAccessAllTags: perms?.accessAllTags ?? null,
    canAccessExplicitContent: perms?.accessExplicitContent ?? null,
  };
  return row;
}

export async function upsertUser(row: NewUserRow | null): Promise<void> {
  if (!row) return;
  await db
    .insert(users)
    .values(row)
    .onConflictDoUpdate({ target: users.id, set: row });
}

export async function getUserByUsername(username: string): Promise<UserRow | null> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return result[0] || null;
}
