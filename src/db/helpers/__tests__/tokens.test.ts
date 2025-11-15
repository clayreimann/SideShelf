/**
 * Tests for token extraction helpers
 */

import { describe, expect, it } from '@jest/globals';
import {
  mockApiUser,
  mockLoginResponse,
  mockMeResponse,
} from '../../../__tests__/fixtures';
import {
  extractTokensFromAuthResponse,
  extractTokensFromUser,
  Tokens,
} from '../tokens';

describe('Tokens Helper', () => {
  describe('extractTokensFromAuthResponse', () => {
    it('should extract tokens from ApiMeResponse', () => {
      const mockResponse = {
        user: {
          ...mockApiUser,
          token: 'test-access-token',
          refreshToken: 'test-refresh-token',
        },
      };

      const result = extractTokensFromAuthResponse(mockResponse);

      expect(result).toEqual({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      });
    });

    it('should extract tokens from ApiLoginResponse', () => {
      const mockResponse = {
        user: {
          ...mockApiUser,
          token: 'login-access-token',
          refreshToken: 'login-refresh-token',
        },
      };

      const result = extractTokensFromAuthResponse(mockResponse);

      expect(result).toEqual({
        accessToken: 'login-access-token',
        refreshToken: 'login-refresh-token',
      });
    });

    it('should prioritize accessToken over token field', () => {
      const mockResponse = {
        user: {
          ...mockApiUser,
          accessToken: 'access-token-field',
          token: 'token-field',
          refreshToken: 'test-refresh-token',
        },
      };

      const result = extractTokensFromAuthResponse(mockResponse);

      expect(result).toEqual({
        accessToken: 'access-token-field',
        refreshToken: 'test-refresh-token',
      });
    });

    it('should handle missing accessToken and token', () => {
      const mockResponse = {
        user: {
          ...mockApiUser,
          refreshToken: 'test-refresh-token',
        },
      };

      const result = extractTokensFromAuthResponse(mockResponse);

      expect(result).toEqual({
        accessToken: null,
        refreshToken: 'test-refresh-token',
      });
    });

    it('should handle missing refreshToken', () => {
      const mockResponse = {
        user: {
          ...mockApiUser,
          token: 'test-access-token',
        },
      };

      const result = extractTokensFromAuthResponse(mockResponse);

      expect(result).toEqual({
        accessToken: 'test-access-token',
        refreshToken: null,
      });
    });

    it('should handle missing user object', () => {
      const mockResponse = {} as any;

      const result = extractTokensFromAuthResponse(mockResponse);

      expect(result).toEqual({
        accessToken: null,
        refreshToken: null,
      });
    });

    it('should handle null user', () => {
      const mockResponse = {
        user: null,
      } as any;

      const result = extractTokensFromAuthResponse(mockResponse);

      expect(result).toEqual({
        accessToken: null,
        refreshToken: null,
      });
    });

    it('should handle undefined tokens', () => {
      const mockResponse = {
        user: {
          id: 'user-1',
          username: 'testuser',
        },
      } as any;

      const result = extractTokensFromAuthResponse(mockResponse);

      expect(result).toEqual({
        accessToken: null,
        refreshToken: null,
      });
    });
  });

  describe('extractTokensFromUser', () => {
    it('should extract tokens from ApiUser object', () => {
      const mockUser = {
        ...mockApiUser,
        token: 'user-access-token',
        refreshToken: 'user-refresh-token',
      };

      const result = extractTokensFromUser(mockUser);

      expect(result).toEqual({
        accessToken: 'user-access-token',
        refreshToken: 'user-refresh-token',
      });
    });

    it('should prioritize accessToken over token field', () => {
      const mockUser = {
        ...mockApiUser,
        accessToken: 'access-token-field',
        token: 'token-field',
        refreshToken: 'test-refresh-token',
      };

      const result = extractTokensFromUser(mockUser);

      expect(result).toEqual({
        accessToken: 'access-token-field',
        refreshToken: 'test-refresh-token',
      });
    });

    it('should handle missing accessToken and token', () => {
      const mockUser = {
        ...mockApiUser,
        refreshToken: 'test-refresh-token',
      };

      const result = extractTokensFromUser(mockUser);

      expect(result).toEqual({
        accessToken: null,
        refreshToken: 'test-refresh-token',
      });
    });

    it('should handle missing refreshToken', () => {
      const mockUser = {
        ...mockApiUser,
        token: 'test-access-token',
      };

      const result = extractTokensFromUser(mockUser);

      expect(result).toEqual({
        accessToken: 'test-access-token',
        refreshToken: null,
      });
    });

    it('should handle null user', () => {
      const mockUser = null as any;

      const result = extractTokensFromUser(mockUser);

      expect(result).toEqual({
        accessToken: null,
        refreshToken: null,
      });
    });

    it('should handle undefined tokens', () => {
      const mockUser = {
        id: 'user-1',
        username: 'testuser',
      } as any;

      const result = extractTokensFromUser(mockUser);

      expect(result).toEqual({
        accessToken: null,
        refreshToken: null,
      });
    });

    it('should handle user with only token field (no accessToken)', () => {
      const mockUser = {
        ...mockApiUser,
        token: 'only-token-field',
      };

      const result = extractTokensFromUser(mockUser);

      expect(result).toEqual({
        accessToken: 'only-token-field',
        refreshToken: null,
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete login workflow', () => {
      // Simulate receiving a login response
      const loginResponse = {
        user: {
          ...mockApiUser,
          token: 'login-token',
          refreshToken: 'login-refresh-token',
        },
      };

      const tokens = extractTokensFromAuthResponse(loginResponse);

      expect(tokens.accessToken).toBe('login-token');
      expect(tokens.refreshToken).toBe('login-refresh-token');
    });

    it('should handle me response after login', () => {
      // Simulate receiving a /me response
      const meResponse = {
        user: {
          ...mockApiUser,
          accessToken: 'me-access-token',
          refreshToken: 'me-refresh-token',
        },
      };

      const tokens = extractTokensFromAuthResponse(meResponse);

      expect(tokens.accessToken).toBe('me-access-token');
      expect(tokens.refreshToken).toBe('me-refresh-token');
    });

    it('should extract tokens consistently from different sources', () => {
      const userTokens = extractTokensFromUser({
        ...mockApiUser,
        token: 'test-token',
        refreshToken: 'test-refresh',
      });

      const authTokens = extractTokensFromAuthResponse({
        user: {
          ...mockApiUser,
          token: 'test-token',
          refreshToken: 'test-refresh',
        },
      });

      expect(userTokens).toEqual(authTokens);
    });
  });
});
