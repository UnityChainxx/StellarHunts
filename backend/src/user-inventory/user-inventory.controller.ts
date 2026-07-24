
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserInventoryService } from './user-inventory.service';
import {
  UserInventoryResponseDto,
  InventoryItemDto,
  PaginatedInventoryResponseDto,
} from './dto/inventory-response';
import { AddInventoryItemDto } from './dto/add-inventory-item';
import { Auth } from '../auth/decorators/auth-decorator';
import { AuthType } from '../auth/enums/auth-type.enum';

@ApiTags('User Inventory')
@ApiBearerAuth()
@Controller('users/:userId/inventory')
export class UserInventoryController {
  constructor(private readonly userInventoryService: UserInventoryService) {}

  @Auth(AuthType.Bearer) // Assuming you have JWT auth
  @Get()
  @ApiOperation({ summary: 'Get user complete digital inventory' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'User inventory retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserInventory(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<UserInventoryResponseDto | PaginatedInventoryResponseDto> {
    return this.userInventoryService.getUserInventory(userId, page, limit);
  }

  @Auth(AuthType.Bearer)
  @Get('nfts')
  @ApiOperation({ summary: 'Get user NFTs only' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'User NFTs retrieved successfully' })
  async getUserNFTs(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<InventoryItemDto[] | PaginatedInventoryResponseDto> {
    return this.userInventoryService.getUserNFTs(userId, page, limit);
  }

  @Auth(AuthType.Bearer)
  @Get('badges')
  @ApiOperation({ summary: 'Get user badges only' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'User badges retrieved successfully' })
  async getUserBadges(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<InventoryItemDto[] | PaginatedInventoryResponseDto> {
    return this.userInventoryService.getUserBadges(userId, page, limit);
  }

  @Auth(AuthType.Bearer)
  @Get('items/:itemId')
  @ApiOperation({ summary: 'Get individual asset details' })
  @ApiResponse({ status: 200, description: 'Inventory item details retrieved successfully', type: InventoryItemDto })
  @ApiResponse({ status: 404, description: 'Inventory item not found' })
  async getInventoryItemDetails(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<InventoryItemDto> {
    return this.userInventoryService.getInventoryItemDetails(userId, itemId);
  }

  @Auth(AuthType.Bearer)
  @Post('items')
  @ApiOperation({ summary: 'Add item to user inventory' })
  @ApiResponse({ status: 201, description: 'Item added to inventory successfully', type: InventoryItemDto })
  @ApiResponse({ status: 404, description: 'User or asset not found' })
  @ApiResponse({ status: 409, description: 'User already owns this item' })
  async addInventoryItem(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() addItemDto: AddInventoryItemDto,
  ): Promise<InventoryItemDto> {
    // Ensure the userId in the URL matches the DTO
    addItemDto.userId = userId;
    return this.userInventoryService.addInventoryItem(addItemDto);
  }
}