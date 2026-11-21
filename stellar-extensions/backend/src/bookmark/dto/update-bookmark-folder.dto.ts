import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateBookmarkFolderDto {
  @ApiPropertyOptional({ description: 'New folder name' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Toggle the folder visibility. Setting this to false revokes the share link.',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
