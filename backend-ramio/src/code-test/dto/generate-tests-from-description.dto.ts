import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateTestsFromDescriptionDto {
  @IsString()
  @MaxLength(10_000, {
    message: 'Description must not exceed 10,000 characters',
  })
  description: string;

  @IsOptional()
  @IsIn(['python', 'javascript', 'java', 'csharp'], {
    message: 'language must be "python", "javascript", "java", or "csharp"',
  })
  language?: 'python' | 'javascript' | 'java' | 'csharp';
}

export class GenerateTestsFromDescriptionResponseDto {
  tests: string;
}
