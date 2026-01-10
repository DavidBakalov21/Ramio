import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class OnboardingDto {
  @IsEnum(UserRole, {
    message: 'Role must be either STUDENT or TEACHER',
  })
  role: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(50, {
    message: 'Username must be at most 50 characters',
  })
  username?: string;
}
