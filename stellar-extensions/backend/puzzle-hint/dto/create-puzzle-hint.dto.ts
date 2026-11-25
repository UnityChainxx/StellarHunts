import { IsString, IsInt, Min, MinLength } from 'class-validator';

export class CreatePuzzleHintDto {
  @IsString()
  puzzleId: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsInt()
  @Min(0)
  order: number;

  @IsInt()
  @Min(0)
  tokenCost: number;
}
