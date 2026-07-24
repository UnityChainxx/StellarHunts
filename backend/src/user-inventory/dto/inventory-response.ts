import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, IsEnum, IsOptional, IsObject, IsDateString } from 'class-validator';
import { AssetType } from '../entities/inventory';

export class AssetDetailDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  iconUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  rarity?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  achievementType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class InventoryItemDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty({ enum: AssetType })
  @IsEnum(AssetType)
  assetType: AssetType;

  @ApiProperty()
  @IsDateString()
  acquiredAt: Date;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  acquisitionContext?: Record<string, any>;

  @ApiProperty()
  assetDetails: AssetDetailDto;
}

export class UserInventoryResponseDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsString()
  username: string;

  @ApiProperty({ type: [InventoryItemDto] })
  inventory: InventoryItemDto[];

  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  nftCount: number;

  @ApiProperty()
  badgeCount: number;
}

// Server-side pagination envelope returned by the inventory endpoints when
// `page` or `limit` is provided (or the total exceeds a single page) (#104).
export class PaginatedInventoryResponseDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ type: [InventoryItemDto] })
  items: InventoryItemDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 150 })
  total: number;

  @ApiProperty({ example: 8 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasMore: boolean;
}