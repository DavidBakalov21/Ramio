import {
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsUrl,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateQuizAnswerDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  id: number;

  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl()
  imageUrl?: string | null;
}

export class UpdateQuizQuestionDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  id: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  points?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUrl()
  imageUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateQuizAnswerDto)
  answers?: UpdateQuizAnswerDto[];
}

export class UpdateQuizDto {
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  deadline?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  timeLimit?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateQuizQuestionDto)
  questions?: UpdateQuizQuestionDto[];
}
