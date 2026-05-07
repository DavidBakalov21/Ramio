import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssignmentLanguage } from '@prisma/client';

export class RunAssignmentDto {
  @IsString()
  code: string;

  @IsOptional()
  @IsEnum(AssignmentLanguage)
  language?: string;
}
