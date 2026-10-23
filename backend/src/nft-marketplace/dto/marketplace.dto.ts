import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
  Length,
  Max,
  Min,
} from 'class-validator';

/** Decision a seller can take on a pending offer. */
export enum OfferDecision {
  ACCEPT = 'accept',
  REJECT = 'reject',
}

export class CreateListingDto {
  @ApiProperty({ description: 'On-chain identifier of the NFT to trade' })
  @IsString()
  @IsNotEmpty()
  nftId: string;

  @ApiProperty({ description: 'Display name of the NFT' })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiProperty({ description: 'Image URL of the NFT', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ description: 'Free-text description of the NFT', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Asking price in XLM', example: 25 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0.0000001)
  price: number;
}

export class CreateOfferDto {
  @ApiProperty({ description: 'Offered amount in XLM', example: 20 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0.0000001)
  amount: number;
}

export class RespondToOfferDto {
  @ApiProperty({ description: 'Seller decision on the offer', enum: OfferDecision })
  @IsEnum(OfferDecision)
  decision!: OfferDecision;
}

/** Query parameters for listing the open marketplace. */
export class ListListingsQueryDto {
  @ApiProperty({ description: 'Filter by seller user ID', required: false })
  @IsOptional()
  @IsString()
  sellerId?: string;

  @ApiProperty({ description: 'Maximum page size (default 50, capped at 100)', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}
