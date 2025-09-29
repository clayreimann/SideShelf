import type { ApiLoginResponse, ApiMeResponse, ApiUser } from '@/types/api';

export type Tokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

// Accepts either /login or /me response
export function extractTokensFromAuthResponse(data: ApiMeResponse | ApiLoginResponse): Tokens {
  const user = data.user;
  const accessToken = user?.accessToken ?? user?.token ?? null;
  const refreshToken = user?.refreshToken ?? null;
  return { accessToken, refreshToken };
}

// Alternative function that accepts a ApiUser object directly
export function extractTokensFromUser(user: ApiUser): Tokens {
  const accessToken = user?.accessToken ?? user?.token ?? null;
  const refreshToken = user?.refreshToken ?? null;
  return { accessToken, refreshToken };
}
