import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsNumber,
  Min,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssignmentLanguage } from '@prisma/client';

export class UpdateAssignmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Title cannot be empty' })
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  points?: number;

  @IsOptional()
  @IsEnum(AssignmentLanguage)
  language?: AssignmentLanguage;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  dueDate?: number | null; // Unix timestamp (seconds), null to clear
}
