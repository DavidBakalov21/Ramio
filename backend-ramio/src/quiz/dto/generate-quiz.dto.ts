import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GenerateQuizDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  courseId: number;

  @IsString()
  @MaxLength(3000)
  prompt: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  questionCount?: number;
}
