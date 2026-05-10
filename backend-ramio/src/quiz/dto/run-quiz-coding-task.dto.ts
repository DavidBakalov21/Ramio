import { IsNumber, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RunQuizCodingTaskDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  questionId: number;

  @IsString()
  @MaxLength(100_000)
  code: string;
}
