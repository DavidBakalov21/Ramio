import { IsOptional, IsString } from 'class-validator';

export class SupportCheckoutDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  assignmentId?: string;
}
