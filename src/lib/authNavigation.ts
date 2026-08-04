import type { AuthStatus } from "@/types/auth";

export type PostLoginNavigation = "dismiss" | "replaceRoot";

export function shouldRedirectToLogin(authStatus: AuthStatus): boolean {
  return authStatus === "signedOut";
}

export function getPostLoginNavigation(mode: string | undefined): PostLoginNavigation {
  return mode === "reauth" ? "dismiss" : "replaceRoot";
}
