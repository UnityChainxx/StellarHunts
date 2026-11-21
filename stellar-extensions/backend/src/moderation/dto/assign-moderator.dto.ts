import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignModeratorDto {
  @ApiProperty({ description: 'Moderator account to assign to the puzzle' })
  @IsUUID()
  moderatorId: string;
}
