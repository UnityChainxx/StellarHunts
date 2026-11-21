import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ModerationAction } from '../entities/moderation-queue-item.entity';

export class ReviewDecisionDto {
  @ApiProperty({
    description: 'Moderator decision',
    enum: ModerationAction,
  })
  @IsEnum(ModerationAction)
  action: ModerationAction;

  @ApiPropertyOptional({
    description:
      'Required for reject/request-changes; optional for approve. Shown to the submitter.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
