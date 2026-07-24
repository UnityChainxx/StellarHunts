import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { Inventory, AssetType } from './entities/inventory';
import { User } from './entities/user';
import { NFT } from './entities/nft';
import { Badge } from './entities/badge';
import {
  UserInventoryResponseDto,
  InventoryItemDto,
  AssetDetailDto,
  PaginatedInventoryResponseDto,
} from './dto/inventory-response';
import { AddInventoryItemDto } from './dto/add-inventory-item';

// Server-side pagination boundaries for the `/inventory` endpoints (#104).
// Requests landing outside this range are clamped before touching the DB.
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const MAX_PAGE = 10_000;

const clampInt = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
};

const buildOffsetLimit = (page: number, limit: number) => {
  const safePage = clampInt(page, 1, MAX_PAGE, DEFAULT_PAGE);
  const safeLimit = clampInt(limit, 1, MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT);
  return { safePage, safeLimit, offset: (safePage - 1) * safeLimit };
};

@Injectable()
export class UserInventoryService {
  constructor(
    @InjectRepository(Inventory)
    private inventoryRepository: Repository<Inventory>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(NFT)
    private nftRepository: Repository<NFT>,
    @InjectRepository(Badge)
    private badgeRepository: Repository<Badge>,
  ) {}

  async getUserInventory(
    userId: string,
    page: number = DEFAULT_PAGE,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<PaginatedInventoryResponseDto | UserInventoryResponseDto> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { safePage, safeLimit, offset } = buildOffsetLimit(page, limit);

    const [inventoryItems, total] = await this.inventoryRepository.findAndCount({
      where: { userId },
      order: { acquiredAt: 'DESC' },
      skip: offset,
      take: safeLimit,
    } as FindManyOptions<Inventory>);

    const enrichedInventory = await Promise.all(
      inventoryItems.map(async (item) => {
        const assetDetails = await this.getAssetDetails(item.assetId, item.assetType);
        return this.mapToInventoryItemDto(item, assetDetails);
      }),
    );

    const nftCount = enrichedInventory.filter((item) => item.assetType === AssetType.NFT).length;
    const badgeCount = enrichedInventory.filter((item) => item.assetType === AssetType.BADGE).length;

    if (safePage === 1 && total <= safeLimit) {
      // Backwards-compatible response for callers that expect the full payload
      // when there is only a single page of data.
      return {
        userId: user.id,
        username: user.username,
        inventory: enrichedInventory,
        totalItems: total,
        nftCount: total === 0 ? 0 : await this.countByType(userId, AssetType.NFT),
        badgeCount: total === 0 ? 0 : await this.countByType(userId, AssetType.BADGE),
      };
    }

    return {
      userId: user.id,
      username: user.username,
      items: enrichedInventory,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      hasMore: offset + inventoryItems.length < total,
    };
  }

  private async countByType(userId: string, assetType: AssetType): Promise<number> {
    return this.inventoryRepository.count({ where: { userId, assetType } });
  }

  async getInventoryItemDetails(userId: string, inventoryItemId: string): Promise<InventoryItemDto> {
    const inventoryItem = await this.inventoryRepository.findOne({
      where: { id: inventoryItemId, userId },
    });

    if (!inventoryItem) {
      throw new NotFoundException('Inventory item not found');
    }

    const assetDetails = await this.getAssetDetails(inventoryItem.assetId, inventoryItem.assetType);
    return this.mapToInventoryItemDto(inventoryItem, assetDetails);
  }

  async addInventoryItem(addItemDto: AddInventoryItemDto): Promise<InventoryItemDto> {
    const { userId, assetId, assetType, acquisitionContext } = addItemDto;

    // Verify user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify asset exists
    const assetExists = await this.verifyAssetExists(assetId, assetType);
    if (!assetExists) {
      throw new NotFoundException(`${assetType} not found`);
    }

    // Check if user already owns this item
    const existingItem = await this.inventoryRepository.findOne({
      where: { userId, assetId, assetType },
    });

    if (existingItem) {
      throw new ConflictException('User already owns this item');
    }

    // Create new inventory item
    const inventoryItem = this.inventoryRepository.create({
      userId,
      assetId,
      assetType,
      acquisitionContext,
    });

    const savedItem = await this.inventoryRepository.save(inventoryItem);
    const assetDetails = await this.getAssetDetails(assetId, assetType);

    return this.mapToInventoryItemDto(savedItem, assetDetails);
  }

  async getUserNFTs(
    userId: string,
    page: number = DEFAULT_PAGE,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<PaginatedInventoryResponseDto | InventoryItemDto[]> {
    const { safePage, safeLimit, offset } = buildOffsetLimit(page, limit);

    const [nftItems, total] = await this.inventoryRepository.findAndCount({
      where: { userId, assetType: AssetType.NFT },
      order: { acquiredAt: 'DESC' },
      skip: offset,
      take: safeLimit,
    } as FindManyOptions<Inventory>);

    const items = await Promise.all(
      nftItems.map(async (item) => {
        const assetDetails = await this.getAssetDetails(item.assetId, item.assetType);
        return this.mapToInventoryItemDto(item, assetDetails);
      }),
    );

    if (safePage === 1 && total <= safeLimit) {
      return items;
    }

    return {
      userId,
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      hasMore: offset + nftItems.length < total,
    };
  }

  async getUserBadges(
    userId: string,
    page: number = DEFAULT_PAGE,
    limit: number = DEFAULT_PAGE_LIMIT,
  ): Promise<PaginatedInventoryResponseDto | InventoryItemDto[]> {
    const { safePage, safeLimit, offset } = buildOffsetLimit(page, limit);

    const [badgeItems, total] = await this.inventoryRepository.findAndCount({
      where: { userId, assetType: AssetType.BADGE },
      order: { acquiredAt: 'DESC' },
      skip: offset,
      take: safeLimit,
    } as FindManyOptions<Inventory>);

    const items = await Promise.all(
      badgeItems.map(async (item) => {
        const assetDetails = await this.getAssetDetails(item.assetId, item.assetType);
        return this.mapToInventoryItemDto(item, assetDetails);
      }),
    );

    if (safePage === 1 && total <= safeLimit) {
      return items;
    }

    return {
      userId,
      items,
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      hasMore: offset + badgeItems.length < total,
    };
  }

  private async getAssetDetails(assetId: string, assetType: AssetType): Promise<AssetDetailDto> {
    if (assetType === AssetType.NFT) {
      const nft = await this.nftRepository.findOne({ where: { id: assetId } });
      if (!nft) throw new NotFoundException('NFT not found');
      
      return {
        id: nft.id,
        name: nft.name,
        description: nft.description,
        imageUrl: nft.imageUrl,
        rarity: nft.rarity,
        metadata: nft.metadata,
      };
    } else {
      const badge = await this.badgeRepository.findOne({ where: { id: assetId } });
      if (!badge) throw new NotFoundException('Badge not found');
      
      return {
        id: badge.id,
        name: badge.name,
        description: badge.description,
        iconUrl: badge.iconUrl,
        achievementType: badge.achievementType,
      };
    }
  }

  private async verifyAssetExists(assetId: string, assetType: AssetType): Promise<boolean> {
    if (assetType === AssetType.NFT) {
      const nft = await this.nftRepository.findOne({ where: { id: assetId } });
      return !!nft;
    } else {
      const badge = await this.badgeRepository.findOne({ where: { id: assetId } });
      return !!badge;
    }
  }

  private mapToInventoryItemDto(inventory: Inventory, assetDetails: AssetDetailDto): InventoryItemDto {
    return {
      id: inventory.id,
      assetType: inventory.assetType,
      acquiredAt: inventory.acquiredAt,
      acquisitionContext: inventory.acquisitionContext,
      assetDetails,
    };
  }
}
