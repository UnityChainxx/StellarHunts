import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  IsDateString,
  IsUrl,
  Min,
  Max,
  Validate,
} from 'class-validator';
import { IsSafeHttpUrlConstraint } from '../../common/security/safe-url.constraint';
import {
  ChallengeDifficulty,
  ChallengeType,
  ChallengeStatus,
} from '../entities/challenge.entity';

export class CreateChallengeDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  question: string;

  @IsString()
  correctAnswer: string;

  @IsEnum(ChallengeType)
  @IsOptional()
  type?: ChallengeType = ChallengeType.TEXT;

  @IsEnum(ChallengeDifficulty)
  @IsOptional()
  difficulty?: ChallengeDifficulty = ChallengeDifficulty.EASY;

  @IsEnum(ChallengeStatus)
  @IsOptional()
  status?: ChallengeStatus = ChallengeStatus.DRAFT;

  @IsDateString()
  @IsOptional()
  unlockTime?: string;

  @IsDateString()
  @IsOptional()
  expiryTime?: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  points?: number = 100;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  maxAttempts?: number = 3;

  @IsInt()
  @Min(0)
  @Max(5)
  @IsOptional()
  maxHints?: number = 3;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  hints?: string[] = [];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  multipleChoiceOptions?: string[];

  @IsOptional()
  @IsUrl({ require_tld: false })
  @Validate(IsSafeHttpUrlConstraint)
  imageUrl?: string;

  @IsBoolean()
  @IsOptional()
  caseSensitive?: boolean = true;

  @IsBoolean()
  @IsOptional()
  fuzzyMatching?: boolean = false;

  @IsInt()
  @IsOptional()
  order?: number = 0;

  @IsOptional()
  metadata?: Record<string, any>;
}
