import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ImportStudentRowDto {
  @IsEmail()
  identifier!: string;

  @IsOptional()
  @IsString()
  github_username?: string;

  @IsOptional()
  @IsString()
  github_id?: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class ImportStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportStudentRowDto)
  students!: ImportStudentRowDto[];
}
