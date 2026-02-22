import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';

export class AssessSubmissionDto {
  @IsOptional()
  @IsString()
  teacherFeedback?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  points?: number;

  @IsOptional()
  isChecked?: boolean;
}
