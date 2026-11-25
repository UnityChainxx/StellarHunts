import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class TagPuzzleDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  tags: string[];
}
