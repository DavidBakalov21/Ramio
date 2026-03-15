import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateTestsFromDescriptionDto {
  @IsString()
  @MaxLength(10_000, { message: 'Description must not exceed 10,000 characters' })
  description: string;

  @IsOptional()
  @IsIn(['python', 'javascript'], {
    message: 'language must be "python" or "javascript"',
  })
  language?: 'python' | 'javascript';
}

export class GenerateTestsFromDescriptionResponseDto {
  tests: string;
}
