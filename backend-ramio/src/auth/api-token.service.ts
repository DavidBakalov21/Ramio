import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';

const TOKEN_PREFIX = 'ramio_';
const MAX_TOKENS_PER_USER = 25;

type UserWithProfile = Awaited<
  ReturnType<ApiTokenService['loadUserWithProfile']>
>;

@Injectable()
export class ApiTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateToken(): string {
    return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  }

  private async loadUserWithProfile(userId: bigint) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { profilePicture: true },
    });
  }

  private assertTeacherRole(role: UserRole | null) {
    if (role !== UserRole.TEACHER) {
      throw new ForbiddenException('Only teachers can use API tokens');
    }
  }

  private formatTokenRecord(token: {
    id: bigint;
    name: string;
    tokenPrefix: string;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: token.id.toString(),
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      lastUsedAt: token.lastUsedAt,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
    };
  }

  async authenticateBearerToken(
    authorizationHeader: string | undefined,
  ): Promise<UserWithProfile | null> {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authorizationHeader.slice('Bearer '.length).trim();
    if (!token.startsWith(TOKEN_PREFIX)) {
      return null;
    }

    const tokenHash = this.hashToken(token);
    const record = await this.prisma.teacherApiToken.findUnique({
      where: { tokenHash },
      include: {
        user: { include: { profilePicture: true } },
      },
    });

    if (!record || record.revokedAt) {
      return null;
    }

    if (record.expiresAt && record.expiresAt <= new Date()) {
      return null;
    }

    if (record.user.role !== UserRole.TEACHER) {
      return null;
    }

    void this.prisma.teacherApiToken
      .update({
        where: { id: record.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);

    return record.user;
  }

  async listTokens(userId: bigint, role: UserRole | null) {
    this.assertTeacherRole(role);

    const tokens = await this.prisma.teacherApiToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return tokens.map((token) => this.formatTokenRecord(token));
  }

  async createToken(
    userId: bigint,
    role: UserRole | null,
    name: string,
    expiresAt?: Date,
  ) {
    this.assertTeacherRole(role);

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Token name is required');
    }

    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException('Expiry must be in the future');
    }

    const activeCount = await this.prisma.teacherApiToken.count({
      where: { userId, revokedAt: null },
    });

    if (activeCount >= MAX_TOKENS_PER_USER) {
      throw new BadRequestException(
        `You can have at most ${MAX_TOKENS_PER_USER} active API tokens`,
      );
    }

    const token = this.generateToken();
    const created = await this.prisma.teacherApiToken.create({
      data: {
        userId,
        name: trimmedName,
        tokenHash: this.hashToken(token),
        tokenPrefix: token.slice(0, TOKEN_PREFIX.length + 8),
        expiresAt: expiresAt ?? null,
      },
    });

    return {
      ...this.formatTokenRecord(created),
      token,
    };
  }

  async revokeToken(userId: bigint, role: UserRole | null, tokenId: bigint) {
    this.assertTeacherRole(role);

    const token = await this.prisma.teacherApiToken.findFirst({
      where: { id: tokenId, userId, revokedAt: null },
    });

    if (!token) {
      throw new NotFoundException('API token not found');
    }

    await this.prisma.teacherApiToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });

    return { message: 'API token revoked' };
  }
}
