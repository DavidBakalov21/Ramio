import { IsString, MaxLength } from 'class-validator';

export class RunAssignmentDto {
  @IsString()
  code: string;
}
