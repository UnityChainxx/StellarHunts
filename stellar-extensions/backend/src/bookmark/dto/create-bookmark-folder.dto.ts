import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBookmarkFolderDto {
  @ApiProperty({ description: 'Folder name', example: 'Hard Soroban puzzles' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: 'Create the folder with a public share link',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
