import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiTokenDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
