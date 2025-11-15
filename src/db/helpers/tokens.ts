import type { ApiLoginResponse, ApiMeResponse, ApiUser } from '@/types/api';

export type Tokens = {
  accessToken: string | null;
  refreshToken: string | null;
};

// Type guard to check if response is ApiLoginResponse
function isApiLoginResponse(data: ApiMeResponse | ApiLoginResponse): data is ApiLoginResponse {
  return 'user' in data;
}

// Accepts either /login or /me response
export function extractTokensFromAuthResponse(data: ApiMeResponse | ApiLoginResponse): Tokens {
  if (isApiLoginResponse(data)) {
    // ApiLoginResponse has user property with accessToken/refreshToken/token
    const accessToken = data.user?.accessToken ?? data.user?.token ?? null;
    const refreshToken = data.user?.refreshToken ?? null;
    return { accessToken, refreshToken };
  } else {
    // ApiMeResponse only has token property (no accessToken/refreshToken)
    const accessToken = data.token ?? null;
    const refreshToken = null;
    return { accessToken, refreshToken };
  }
}

// Alternative function that accepts a ApiUser object directly
export function extractTokensFromUser(user: ApiUser): Tokens {
  const accessToken = user?.accessToken ?? user?.token ?? null;
  const refreshToken = user?.refreshToken ?? null;
  return { accessToken, refreshToken };
}
