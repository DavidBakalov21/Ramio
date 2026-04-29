import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** For multipart upload; file is provided via interceptor. */
export class CreateCourseMaterialFileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  /** Optional override; otherwise inferred from mime type / filename. */
  @IsOptional()
  @IsString()
  @IsIn(['PDF', 'VIDEO', 'FILE'])
  type?: 'PDF' | 'VIDEO' | 'FILE';
}

