import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCourseMaterialFileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PDF', 'VIDEO', 'FILE'])
  type?: 'PDF' | 'VIDEO' | 'FILE';
}

