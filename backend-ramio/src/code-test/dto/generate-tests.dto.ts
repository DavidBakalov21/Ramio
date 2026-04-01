import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateTestsDto {
  @IsString()
  @MaxLength(50_000, { message: 'Code must not exceed 50,000 characters' })
  code: string;

  @IsOptional()
  @IsIn(['python', 'javascript', 'java', 'csharp'], {
    message: 'language must be "python", "javascript", "java", or "csharp"',
  })
  language?: 'python' | 'javascript' | 'java' | 'csharp';
}

export class GenerateTestsResponseDto {
  tests: string;
}
