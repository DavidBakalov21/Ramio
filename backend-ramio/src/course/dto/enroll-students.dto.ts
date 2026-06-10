import { ArrayMinSize, IsArray, IsEmail } from 'class-validator';

export class EnrollStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsEmail({}, { each: true })
  emails!: string[];
}
