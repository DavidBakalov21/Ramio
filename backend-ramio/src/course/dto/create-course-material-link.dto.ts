import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateCourseMaterialLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsUrl({ require_protocol: true })
  @MaxLength(2048)
  url!: string;
}

