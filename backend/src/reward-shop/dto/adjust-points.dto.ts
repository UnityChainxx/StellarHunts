import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  MaxLength,
  MinLength,
  NotEquals,
} from 'class-validator';

/**
 * Admin reward adjustment (issue #742).
 *
 * Bound as a request body, so every field carries validation decorators for
 * the global ValidationPipe (`whitelist: true`, `forbidNonWhitelisted: true`)
 * — see CONTRIBUTING.md.
 */
export class AdjustPointsDto {
  @ApiProperty({
    description:
      'Signed adjustment: a positive number grants points, a negative one revokes them. May not be zero.',
    example: 100,
  })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  amount!: number;

  @ApiProperty({
    description:
      'Mandatory free-text justification for the adjustment. Stored verbatim in the audit log.',
    example: 'Compensation for lost progress in incident INC-1042',
    minLength: 5,
    maxLength: 500,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
