import { BadRequestException, Body, Controller, Get, Post, Req } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { OnboardingDto } from './dto/onboarding.dto';

@Controller('me')
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getMe(@Req() req: Request) {
    const u = (req as any).user;

    return {
      id: u.id.toString(), // BigInt -> string
      email: u.email,
      role: u.role, // 'STUDENT' | 'TEACHER' | null
      username: u.username,
      profilePictureUrl: u.profilePictureUrl,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      needsOnboarding: !u.role || !u.username,
    };
  }

  @Post('onboarding')
  async onboarding(@Req() req: Request, @Body() dto: OnboardingDto) {
    const user = (req as any).user;

    // Prevent updating role if user already has one (role is permanent)
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
      id: updatedUser.id.toString(), // BigInt -> string
      email: updatedUser.email,
      role: updatedUser.role,
      username: updatedUser.username,
      profilePictureUrl: updatedUser.profilePictureUrl,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }
}
