import { IsString, MaxLength } from 'class-validator';

export class RunCodeDto {
  @IsString()
  @MaxLength(100_000, { message: 'Code must not exceed 100,000 characters' })
  code: string;

  @IsString()
  @MaxLength(100_000, { message: 'Tests must not exceed 100,000 characters' })
  tests: string;
}

export class RunCodeResponseDto {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}
