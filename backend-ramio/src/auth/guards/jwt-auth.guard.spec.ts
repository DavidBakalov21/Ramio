import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

jest.mock('../auth.service', () => ({
  AuthService: jest.fn(),
}));

import { JwtAuthGuard } from './jwt-auth.guard';

function mockExecutionContext(cookies: Record<string, string> = {}) {
  const request: { cookies: Record<string, string>; user?: unknown } = {
    cookies,
  };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard.canActivate', () => {
  let guard: JwtAuthGuard;
  let auth: {
    verifyAccessToken: jest.Mock;
    getEmailFromCognito: jest.Mock;
  };
  let prisma: {
    user: { findUnique: jest.Mock };
  };
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    auth = {
      verifyAccessToken: jest.fn(),
      getEmailFromCognito: jest.fn(),
    };
    prisma = {
      user: { findUnique: jest.fn() },
    };
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new JwtAuthGuard(
      auth as never,
      prisma as never,
      reflector as unknown as Reflector,
    );
    jest.spyOn(Math, 'random').mockReturnValue(1);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('missing access_token cookie → Unauthorized', () => {
    it('throws UnauthorizedException', async () => {
      const { context } = mockExecutionContext({});
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'No access token cookie',
      );
    });
  });

  describe('valid token, cognitoSub matches a user → attaches user to request, returns true', () => {
    it('attaches user and returns true', async () => {
      const user = {
        id: 1n,
        cognitoSub: 'sub-123',
        email: 'teacher@example.com',
        profilePicture: null,
      };
      auth.verifyAccessToken.mockResolvedValue({
        sub: 'sub-123',
        email: 'teacher@example.com',
      });
      prisma.user.findUnique.mockResolvedValue(user);

      const { context, request } = mockExecutionContext({
        access_token: 'valid-token',
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { cognitoSub: 'sub-123' },
        include: { profilePicture: true },
      });
    });
  });

  describe('valid token, sub mismatch but email matches → resolves user via email fallback', () => {
    it('falls back to email lookup', async () => {
      const user = {
        id: 2n,
        cognitoSub: 'db-sub-old',
        email: 'student@example.com',
        profilePicture: null,
      };
      auth.verifyAccessToken.mockResolvedValue({
        sub: 'token-sub-new',
        email: 'student@example.com',
      });
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(user);

      const { context, request } = mockExecutionContext({
        access_token: 'valid-token',
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenNthCalledWith(1, {
        where: { cognitoSub: 'token-sub-new' },
        include: { profilePicture: true },
      });
      expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
        where: { email: 'student@example.com' },
        include: { profilePicture: true },
      });
      expect(auth.getEmailFromCognito).not.toHaveBeenCalled();
    });
  });

  describe('verifyAccessToken throws (expired/invalid) → Unauthorized', () => {
    it('throws UnauthorizedException', async () => {
      auth.verifyAccessToken.mockRejectedValue(
        new UnauthorizedException('Token expired'),
      );
      const { context } = mockExecutionContext({ access_token: 'bad-token' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('route marked @Public → guard bypasses verification', () => {
    it('returns true without reading cookies', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const { context } = mockExecutionContext({});
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      expect(auth.verifyAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('valid token but no matching user at all → rejected', () => {
    it('throws UnauthorizedException', async () => {
      auth.verifyAccessToken.mockResolvedValue({
        sub: 'orphan-sub',
        email: 'missing@example.com',
        username: 'orphan',
      });
      prisma.user.findUnique.mockResolvedValue(null);
      auth.getEmailFromCognito.mockResolvedValue(null);

      const { context } = mockExecutionContext({ access_token: 'valid-token' });
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'User not found',
      );
    });
  });
});
