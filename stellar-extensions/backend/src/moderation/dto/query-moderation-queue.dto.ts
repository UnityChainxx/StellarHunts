import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import {
  ModerationPriority,
  ModerationStatus,
} from '../entities/moderation-queue-item.entity';

export class QueryModerationQueueDto {
  @ApiPropertyOptional({ enum: ModerationStatus })
  @IsOptional()
  @IsEnum(ModerationStatus)
  status?: ModerationStatus;

  @ApiPropertyOptional({ enum: ModerationPriority })
  @IsOptional()
  @IsEnum(ModerationPriority)
  priority?: ModerationPriority;

  @ApiPropertyOptional({ description: 'Filter by assigned moderator' })
  @IsOptional()
  @IsUUID()
  moderatorId?: string;
}
