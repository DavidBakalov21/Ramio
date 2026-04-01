import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ChatMessageItemDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  content!: string;
}

export class SubmissionChatDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'messages is required and must not be empty' })
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageItemDto)
  messages!: ChatMessageItemDto[];
}
