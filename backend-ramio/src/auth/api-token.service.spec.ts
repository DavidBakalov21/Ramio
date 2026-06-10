import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { createHash } from 'crypto';
import { ApiTokenService } from './api-token.service';

describe('ApiTokenService', () => {
  let service: ApiTokenService;
  let prisma: {
    user: { findUnique: jest.Mock };
    teacherApiToken: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      teacherApiToken: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    service = new ApiTokenService(prisma as never);
  });

  describe('authenticateBearerToken', () => {
    it('returns null when header is missing', async () => {
      await expect(service.authenticateBearerToken(undefined)).resolves.toBeNull();
    });

    it('returns teacher user for a valid token', async () => {
      const token = 'ramio_validtoken';
      const teacher = {
        id: 1n,
        role: UserRole.TEACHER,
        profilePicture: null,
      };
      prisma.teacherApiToken.findUnique.mockResolvedValue({
        id: 10n,
        revokedAt: null,
        expiresAt: null,
        user: teacher,
      });
      prisma.teacherApiToken.update.mockResolvedValue({});

      const result = await service.authenticateBearerToken(`Bearer ${token}`);
      expect(result).toEqual(teacher);
      expect(prisma.teacherApiToken.findUnique).toHaveBeenCalledWith({
        where: {
          tokenHash: createHash('sha256').update(token).digest('hex'),
        },
        include: {
          user: { include: { profilePicture: true } },
        },
      });
    });
  });

  describe('createToken', () => {
    it('rejects non-teachers', async () => {
      await expect(
        service.createToken(1n, UserRole.STUDENT, 'CI script'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates a token for teachers', async () => {
      prisma.teacherApiToken.count.mockResolvedValue(0);
      prisma.teacherApiToken.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 5n,
          name: data.name,
          tokenPrefix: 'ramio_abcd',
          lastUsedAt: null,
          expiresAt: null,
          createdAt: new Date('2026-06-08T12:00:00.000Z'),
        }),
      );

      const result = await service.createToken(
        1n,
        UserRole.TEACHER,
        'CI script',
      );

      expect(result.name).toBe('CI script');
      expect(result.token).toMatch(/^ramio_/);
      expect(result.id).toBe('5');
    });

    it('enforces the active token limit', async () => {
      prisma.teacherApiToken.count.mockResolvedValue(25);
      await expect(
        service.createToken(1n, UserRole.TEACHER, 'Another token'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeToken', () => {
    it('throws when token is not found', async () => {
      prisma.teacherApiToken.findFirst.mockResolvedValue(null);
      await expect(
        service.revokeToken(1n, UserRole.TEACHER, 99n),
      ).rejects.toThrow(NotFoundException);
    });

    it('revokes an owned token', async () => {
      prisma.teacherApiToken.findFirst.mockResolvedValue({ id: 7n });
      prisma.teacherApiToken.update.mockResolvedValue({});

      await expect(
        service.revokeToken(1n, UserRole.TEACHER, 7n),
      ).resolves.toEqual({ message: 'API token revoked' });
    });
  });
});
