import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

type UserWithProfile = {
  id: bigint;
  email: string;
  role: string | null;
  username: string | null;
  aboutMe: string | null;
  birthdate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  profilePicture?: { url: string } | null;
};

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  private toResponse(user: UserWithProfile) {
    return {
      id: user.id.toString(),
      email: user.email,
      role: user.role,
      username: user.username,
      profilePictureUrl: user.profilePicture?.url ?? null,
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
      include: { profilePicture: true },
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
    const maxSize = 15 * 1024 * 1024; // 3MB
    if (file.size > maxSize) {
      throw new BadRequestException('Avatar must be at most 3MB');
    }

    const { url, key } = await this.storage.uploadFile(file, bucket, 'avatars/');
    const userRecord = await this.prisma.user.findUnique({
      where: { cognitoSub },
      select: { id: true },
    });
    if (!userRecord) throw new BadRequestException('User not found');

    await this.prisma.profilePicture.upsert({
      where: { userId: userRecord.id },
      update: { url, key, name: file.originalname },
      create: {
        userId: userRecord.id,
        url,
        key,
        name: file.originalname,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { cognitoSub },
      include: { profilePicture: true },
    });
    if (!user) throw new BadRequestException('User not found');
    return this.toResponse(user);
  }
}
