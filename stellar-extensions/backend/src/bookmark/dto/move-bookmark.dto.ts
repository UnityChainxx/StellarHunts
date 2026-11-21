import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class MoveBookmarkDto {
  /** Destination folder, or null to move the bookmark out of any folder. */
  @ApiPropertyOptional({
    description: 'Destination folder ID, or null for no folder',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  folderId?: string | null;
}
