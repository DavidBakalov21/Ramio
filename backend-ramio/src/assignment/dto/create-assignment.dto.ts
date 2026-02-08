import { IsString, IsOptional, MaxLength, MinLength, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAssignmentDto {
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
  dueDate?: number;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  courseId: number;
}
