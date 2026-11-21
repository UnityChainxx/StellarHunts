import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBookmarkDto {
  @ApiProperty({ description: 'Puzzle being bookmarked' })
  @IsUUID()
  puzzleId: string;

  @ApiPropertyOptional({ description: 'Folder to place the bookmark in' })
  @IsOptional()
  @IsUUID()
  folderId?: string | null;

  @ApiPropertyOptional({ description: 'Private note about the puzzle' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Mark the bookmark as a favorite' })
  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}
