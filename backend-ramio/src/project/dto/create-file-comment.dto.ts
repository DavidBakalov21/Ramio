import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateFileCommentDto {
  @IsString()
  @IsNotEmpty()
  filePath: string;

  @IsInt()
  @Min(1)
  lineStart: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  lineEnd?: number;

  @IsString()
  @IsNotEmpty()
  body: string;
}
