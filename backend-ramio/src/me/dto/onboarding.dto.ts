import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class OnboardingDto {
  @IsEnum(UserRole, {
    message: 'Role must be either STUDENT or TEACHER',
  })
  role: UserRole;

  @IsString()
  @IsNotEmpty({
    message: 'Username is required',
  })
  @MaxLength(50, {
    message: 'Username must be at most 50 characters',
  })
  username: string;
}
