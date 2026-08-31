import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class SubmitAnswerDto {
  @IsString()
  questionId: string;

  @IsArray()
  @IsString({ each: true })
  selectedOptionIds: string[];
}

export class SubmitQuizDto {
  @IsString()
  quizId: string;

  @IsArray()
  answers: SubmitAnswerDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  timeTaken?: number; // in seconds — negative values are rejected (issue #364)
}
