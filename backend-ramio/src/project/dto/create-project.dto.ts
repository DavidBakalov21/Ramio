import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProjectDto {
  @IsString()
  @MinLength(1, { message: 'Title is required' })
  @MaxLength(255)
  title: string;

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
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  dueDate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  assessmentPrompt?: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  courseId: number;
}
