import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { User } from '@prisma/client';

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private toResponse(user: User) {
    return {
      id: user.id.toString(),
      email: user.email,
      role: user.role,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      aboutMe: user.aboutMe,
      birthdate: user.birthdate,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      needsOnboarding: !user.role || !user.username,
    };
  }

  async updateProfile(cognitoSub: string, dto: UpdateProfileDto) {
    const data: Partial<{
      username: string;
      aboutMe: string | null;
      birthdate: Date | null;
    }> = {};

    if (dto.username !== undefined) {
      const trimmed = dto.username.trim();
      if (!trimmed) {
        throw new BadRequestException('Username cannot be empty');
      }
      data.username = trimmed;
    }
    if (dto.aboutMe !== undefined) {
      data.aboutMe = dto.aboutMe.trim() || null;
    }
    if (dto.birthdate !== undefined) {
      data.birthdate = dto.birthdate ? new Date(dto.birthdate) : null;
    }

    const user = await this.prisma.user.update({
      where: { cognitoSub },
      data,
    });
    return this.toResponse(user);
  }

  async uploadAvatar(cognitoSub: string, file: Express.Multer.File) {
    const bucket =
      this.config.get<string>('S3_BUCKET_AVATARS') ??
      this.config.get<string>('S3_BUCKET') ??
      'ramio-file-storage';
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Allowed: JPEG, PNG, GIF, WebP',
      );
    }
    const maxSize = 3 * 1024 * 1024; // 3MB
    if (file.size > maxSize) {
      throw new BadRequestException('Avatar must be at most 3MB');
    }

    const { url } = await this.storage.uploadFile(file, bucket, 'avatars/');
    const user = await this.prisma.user.update({
      where: { cognitoSub },
      data: { profilePictureUrl: url },
    });
    return this.toResponse(user);
  }
}
