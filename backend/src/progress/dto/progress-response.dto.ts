// Response-only DTO (issue #529): this shape is never bound as a @Body()
// request type, so it carries no class-validator decorators by design.
import { ApiProperty } from '@nestjs/swagger';

export class ProgressResponseDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  completedPuzzles: number;

  @ApiProperty()
  totalPuzzles: number;

  @ApiProperty()
  percentComplete: number;

  @ApiProperty()
  lastUpdated: Date;
}
