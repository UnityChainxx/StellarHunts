import { IsString, IsInt, Min } from 'class-validator';

export class RequestHintDto {
  @IsString()
  puzzleId: string;

  @IsInt()
  @Min(0)
  hintOrder: number;
}
