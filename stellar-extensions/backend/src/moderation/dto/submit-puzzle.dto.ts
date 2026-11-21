import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ModerationPriority } from '../entities/moderation-queue-item.entity';

export class SubmitPuzzleDto {
  @ApiProperty({ description: 'Puzzle being submitted for moderation' })
  @IsUUID()
  puzzleId: string;

  @ApiProperty({ description: 'Puzzle title', example: 'Soroban storage tricks' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Puzzle description and content shown to moderators',
    example: 'Find the bug in this contract...',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description: string;

  @ApiPropertyOptional({
    description:
      'Requested priority. Automated checks may escalate it (never downgrade).',
    enum: ModerationPriority,
  })
  @IsOptional()
  @IsEnum(ModerationPriority)
  priority?: ModerationPriority;
}
