import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { User } from 'src/auth/decorators/user.decorator';
import { OnboardingDto } from './dto/onboarding.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MeService } from './me.service';
import { PrismaService } from 'src/prisma/prisma.service';
import type { User as PrismaUser } from '@prisma/client';

@Controller('me')
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meService: MeService,
  ) {}

  @Get()
  getMe(@User() user: PrismaUser) {
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

  @Patch()
  updateProfile(@User() user: PrismaUser, @Body() dto: UpdateProfileDto) {
    return this.meService.updateProfile(user.cognitoSub, dto);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file'))
  uploadAvatar(
    @User() user: PrismaUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.meService.uploadAvatar(user.cognitoSub, file);
  }

  @Post('onboarding')
  async onboarding(@User() user: PrismaUser, @Body() dto: OnboardingDto) {
    if (user.role) {
      throw new BadRequestException('User already has a role assigned');
    }

    const trimmedUsername = dto.username?.trim();
    if (!trimmedUsername) {
      throw new BadRequestException('Username is required');
    }

    const updatedUser = await this.prisma.user.update({
      where: { cognitoSub: user.cognitoSub },
      data: {
        role: dto.role,
        username: trimmedUsername,
      },
    });

    return {
      id: updatedUser.id.toString(),
      email: updatedUser.email,
      role: updatedUser.role,
      username: updatedUser.username,
      profilePictureUrl: updatedUser.profilePictureUrl,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }
}
