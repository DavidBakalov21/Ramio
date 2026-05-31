import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  MinLength,
  MaxLength,
  IsUrl,
  Min,
  ArrayMinSize,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  AssignmentLanguage,
  QuizCodingGradingMode,
  QuizQuestionType,
} from '@prisma/client';

export class CreateQuizAnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  order: number;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;
}

export class CreateQuizQuestionDto {
  @IsEnum(QuizQuestionType)
  type: QuizQuestionType;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  points: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  order: number;

  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuizAnswerDto)
  answers?: CreateQuizAnswerDto[];

  @ValidateIf(
    (q: CreateQuizQuestionDto) => q.type === QuizQuestionType.CODING_TASK,
  )
  @IsEnum(AssignmentLanguage)
  codingTaskLanguage?: AssignmentLanguage;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  codingTaskStarterCode?: string;

  @ValidateIf(
    (q: CreateQuizQuestionDto) => q.type === QuizQuestionType.CODING_TASK,
  )
  @IsString()
  @MaxLength(100_000)
  codingTaskTeacherTests?: string;

  @IsOptional()
  @IsEnum(QuizCodingGradingMode)
  codingTaskGradingMode?: QuizCodingGradingMode;

  @IsOptional()
  @IsBoolean()
  codingTaskAiReviewEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  codingTaskAiReviewRubric?: string;
}

export class CreateQuizDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  courseId: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  timeLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  deadline?: number;

  @IsOptional()
  @IsBoolean()
  allowReview?: boolean;

  @IsOptional()
  @IsBoolean()
  showCorrectAnswers?: boolean;

  @IsOptional()
  @IsBoolean()
  showPointsPerQuestion?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateQuizQuestionDto)
  questions: CreateQuizQuestionDto[];
}
