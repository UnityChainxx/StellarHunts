import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class StartSessionDto {
  @ApiPropertyOptional({
    description:
      'Account id, wallet address or anonymous client id. Omit for anonymous sessions.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  userId?: string;

  @ApiPropertyOptional({
    description:
      'Client-generated session correlation id; reusing it returns the existing session.',
    example: 'sess_01J...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_:-]+$/, {
    message: 'sessionKey may only contain letters, digits, "_", ":" and "-"',
  })
  sessionKey?: string;

  @ApiPropertyOptional({ description: 'Entry page/route of the session' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  entryPage?: string;

  @ApiPropertyOptional({ description: 'Client context (device, referrer, ...)' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class EndSessionDto {
  @ApiPropertyOptional({
    description: 'Client-side end timestamp (defaults to server time)',
  })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ description: 'Page where the session ended' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  exitPage?: string;
}

export class PageVisitDto {
  @ApiProperty({ description: 'Route/path visited', example: '/puzzles/abc' })
  @IsString()
  @MaxLength(512)
  path: string;

  @ApiPropertyOptional({ description: 'Document title, when known' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Time spent on the page in milliseconds' })
  @IsOptional()
  durationMs?: number;

  @ApiPropertyOptional({ description: 'Visit timestamp (defaults to server time)' })
  @IsOptional()
  @IsDateString()
  visitedAt?: string;
}

export class PuzzleAttemptDto {
  @ApiProperty({ description: 'Puzzle being attempted' })
  @IsUUID()
  puzzleId: string;

  @ApiPropertyOptional({
    description: 'Set when the attempt solved the puzzle',
  })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({
    description: 'Mark the attempt as abandoned (dropped off)',
  })
  @IsOptional()
  abandoned?: boolean;

  @ApiPropertyOptional({ description: 'Attempt timestamp (defaults to server time)' })
  @IsOptional()
  @IsDateString()
  attemptedAt?: string;
}

export class AnalyticsPreferenceDto {
  @ApiProperty({ description: 'User the preference applies to' })
  @IsString()
  @MaxLength(128)
  userId: string;

  @ApiProperty({ description: 'True opts the user out of session analytics' })
  optedOut: boolean;
}

export class SessionStatsQueryDto {
  @ApiPropertyOptional({ description: 'Range start (ISO date)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Range end (ISO date)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
