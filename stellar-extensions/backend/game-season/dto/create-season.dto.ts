import { IsString, IsDate, IsNumber, IsOptional, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSeasonDto {
  @IsString()
  @MinLength(3)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @Type(() => Date)
  @IsDate()
  endDate: Date;

  @IsNumber()
  rewardPool: number;

  @IsOptional()
  @IsString()
  badgeName?: string;
}
