import { IsString, IsOptional, MaxLength, MinLength, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
  dueDate?: number; // Unix timestamp (seconds), null to clear
}
