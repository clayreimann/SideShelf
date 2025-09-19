import { LoginResponse, MeResponse, User } from '@/lib/api/types';

export type Tokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

// Accepts either /login or /me response
export function extractTokensFromAuthResponse(data: MeResponse | LoginResponse): Tokens {
  const user = data.user;
  const accessToken = user?.accessToken ?? user?.token ?? null;
  const refreshToken = user?.refreshToken ?? null;
  return { accessToken, refreshToken };
}

// Alternative function that accepts a User object directly
export function extractTokensFromUser(user: User): Tokens {
  const accessToken = user?.accessToken ?? user?.token ?? null;
  const refreshToken = user?.refreshToken ?? null;
  return { accessToken, refreshToken };
}
