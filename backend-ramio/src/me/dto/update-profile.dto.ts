import { IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  aboutMe?: string;

  @IsOptional()
  @IsDateString()
  birthdate?: string;
}
