import { IsArray, IsNumber, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AssessQuizAnswerItemDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  questionId: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pointsEarned: number;
}

export class AssessQuizSubmissionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssessQuizAnswerItemDto)
  answers: AssessQuizAnswerItemDto[];
}
