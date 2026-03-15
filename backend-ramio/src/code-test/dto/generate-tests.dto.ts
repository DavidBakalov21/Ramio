import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateTestsDto {
  @IsString()
  @MaxLength(50_000, { message: 'Code must not exceed 50,000 characters' })
  code: string;

  @IsOptional()
  @IsIn(['python', 'javascript'], {
    message: 'language must be "python" or "javascript"',
  })
  language?: 'python' | 'javascript';
}

export class GenerateTestsResponseDto {
  tests: string;
}
