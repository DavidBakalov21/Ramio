import {
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SaveQuizAnswerItemDto {
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  questionId: number;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  selectedAnswerIds?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  openText?: string;
}

export class SaveQuizAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveQuizAnswerItemDto)
  answers: SaveQuizAnswerItemDto[];
}
