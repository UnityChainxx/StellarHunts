import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class TrackReferralDto {
  @IsString()
  @IsNotEmpty()
  referrerId: string;

  @IsOptional()
  @IsString()
  newUserId?: string;
}
