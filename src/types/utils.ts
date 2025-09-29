/**
 * Utility types and helper interfaces
 *
 * These types are used for utility functions, theme management,
 * and other cross-cutting concerns.
 */


// Theme types
export type ThemedStyles = ReturnType<typeof createThemedStyles>;

// Helper function type (will be imported from actual implementation)
declare function createThemedStyles(): any;

// Provider types
export type AuthState = {
  serverUrl: string | null;
  accessToken: string | null;
  username: string | null;
};

export type AuthContextValue = AuthState & {
  initialized: boolean;
  isAuthenticated: boolean;
  login: (serverUrl: string, username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateServerUrl: (url: string) => void;
};

export type DbContextValue = {
  initialized: boolean;
  error: Error | null;
};

// Generic utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;
