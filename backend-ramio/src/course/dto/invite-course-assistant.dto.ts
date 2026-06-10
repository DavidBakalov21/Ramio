import { IsEmail } from 'class-validator';

export class InviteCourseAssistantDto {
  @IsEmail()
  email!: string;
}
