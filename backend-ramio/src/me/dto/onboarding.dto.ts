import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum UserRole {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
}

export class OnboardingDto {
  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  username?: string;
}

