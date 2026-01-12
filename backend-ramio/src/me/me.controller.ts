import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { User } from 'src/auth/decorators/user.decorator';
import { OnboardingDto } from './dto/onboarding.dto';
import type { User as PrismaUser } from '@prisma/client';

@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getMe(@User() user: PrismaUser) {
    return {
      id: user.id.toString(),
      email: user.email,
      role: user.role,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      needsOnboarding: !user.role || !user.username,
    };
  }

  @Post('onboarding')
  async onboarding(@User() user: PrismaUser, @Body() dto: OnboardingDto) {
    if (user.role) {
      throw new BadRequestException('User already has a role assigned');
    }

    // Update user with role and username
    const updatedUser = await this.prisma.user.update({
      where: { cognitoSub: user.cognitoSub },
      data: {
        role: dto.role,
        username: dto.username || null,
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
