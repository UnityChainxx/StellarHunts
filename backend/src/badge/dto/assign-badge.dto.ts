import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

// Request body for POST /badges/assign. Both fields are required: without
// decorators the global ValidationPipe (whitelist: true) would strip the
// entire payload and the handler would receive an empty object (issue #529).
export class AssignBadgeDto {
  @ApiProperty({ description: 'ID of the user to assign the badge to', example: 1 })
  @IsInt()
  @IsPositive()
  userId: number;

  @ApiProperty({ description: 'ID of the badge to assign', example: 1 })
  @IsInt()
  @IsPositive()
  badgeId: number;
}
