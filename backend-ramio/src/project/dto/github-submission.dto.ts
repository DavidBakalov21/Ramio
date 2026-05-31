import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class GithubSubmissionDto {
  @IsUrl(
    { protocols: ['https'], host_whitelist: ['github.com'] },
    {
      message:
        'repoUrl must be a valid public GitHub repository URL (https://github.com/owner/repo)',
    },
  )
  repoUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  branch?: string;
}
