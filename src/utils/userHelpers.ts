import { getStoredUsername } from "@/lib/secureStore";
import { getUserByUsername, type UserRow } from "@/db/helpers/users";

/**
 * Gets the current authenticated user from storage.
 *
 * This helper consolidates the common pattern of:
 * 1. Retrieving username from async storage
 * 2. Looking up user by username in the database
 * 3. Validating the user has an ID
 *
 * @returns User object if found and valid, null otherwise
 */
export async function getCurrentUser(): Promise<UserRow | null> {
  try {
    const username = await getStoredUsername();
    if (!username) return null;

    const user = await getUserByUsername(username);
    return user?.id ? user : null;
  } catch (error) {
    console.error("[getCurrentUser] Error fetching user:", error);
    return null;
  }
}

/**
 * Gets the current authenticated user, throwing an error if not found.
 *
 * Use this for operations that absolutely require an authenticated user
 * and should fail fast if one is not available.
 *
 * @throws Error if no authenticated user is found
 * @returns User object
 */
export async function requireCurrentUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("No authenticated user found");
  }
  return user;
}
