import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OwnershipGuard } from '../common/guards/ownership.guard';
import { Ownership } from '../common/decorators/ownership.decorator';
import { JwtAuthGuard } from '../admin/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/guards/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { AdminRole } from '../admin/admin-role.enum';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RewardShopService, ShopItem, Purchase } from './reward-shop.service';
import { AdjustPointsDto } from './dto/adjust-points.dto';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

class GetItemsFilterDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  availableOnly?: boolean;
}

class PurchaseItemDto {
  @IsNotEmpty()
  @IsString()
  userId: string;

  @IsNotEmpty()
  @IsString()
  itemId: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

@ApiTags('Reward Shop')
@Controller('reward-shop')
export class RewardShopController {
  private readonly logger = new Logger(RewardShopController.name);

  constructor(private readonly rewardShopService: RewardShopService) {}

  @Get('items')
  listItems(@Query() filterDto: GetItemsFilterDto): ShopItem[] {
    this.logger.log(
      `Received request to list items with filters: ${JSON.stringify(filterDto)}`,
    );
    return this.rewardShopService.listAvailableItems(
      filterDto.category,
      filterDto.minPrice,
      filterDto.maxPrice,
      filterDto.availableOnly,
    );
  }

  @Get('items/:itemId')
  getItemById(@Param('itemId') itemId: string): ShopItem {
    this.logger.log(`Received request for item by ID: ${itemId}`);
    return this.rewardShopService.getItemById(itemId);
  }

  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard('jwt'), OwnershipGuard)
  @Ownership({ body: 'userId' })
  purchaseItem(@Body() purchaseDto: PurchaseItemDto): Purchase {
    this.logger.log(
      `Received purchase request: ${JSON.stringify(purchaseDto)}`,
    );
    const { userId, itemId, idempotencyKey } = purchaseDto;
    return this.rewardShopService.purchaseItem(userId, itemId, idempotencyKey);
  }

  @Get('purchases/:purchaseId')
  @UseGuards(AuthGuard('jwt'))
  getPurchaseById(@Param('purchaseId') purchaseId: string): Purchase {
    this.logger.log(`Received request for purchase by ID: ${purchaseId}`);
    return this.rewardShopService.getPurchaseById(purchaseId);
  }

  @Get('users/:userId/points')
  @UseGuards(AuthGuard('jwt'), OwnershipGuard)
  @Ownership({ param: 'userId' })
  getUserPoints(@Param('userId') userId: string): {
    userId: string;
    points: number;
  } {
    this.logger.log(`Received request for user ${userId} points.`);
    const points = this.rewardShopService.getUserPoints(userId);
    return { userId, points };
  }

  @Post('users/:userId/add-points')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'), OwnershipGuard)
  @Ownership({ param: 'userId' })
  addPoints(
    @Param('userId') userId: string,
    @Body('amount') amount: number,
  ): void {
    if (typeof amount !== 'number' || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number.');
    }
    this.logger.log(
      `Received request to add ${amount} points to user ${userId}.`,
    );
    this.rewardShopService.addPointsToUser(userId, amount);
  }

  // ── Admin reward adjustment (issue #742) ────────────────────────────
  // Auth-gated (admin JWT + AdminRole), requires a reason text, and writes
  // an immutable audit-log entry via the service.
  @Post('admin/users/:userId/adjust-points')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiOperation({
    summary: "Adjust a user's point balance (admin only)",
    description:
      'Grants (positive amount) or revokes (negative amount) reward points. ' +
      'Requires a reason, which is stored in the audit log alongside the ' +
      'acting admin and the before/after balances.',
  })
  @ApiParam({ name: 'userId', description: 'User ID to adjust' })
  @ApiResponse({ status: 200, description: 'Adjustment applied' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed (amount zero/non-integer, missing reason)',
  })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  async adjustPoints(
    @Param('userId') userId: string,
    @Body() dto: AdjustPointsDto,
    @Req() req: any,
  ) {
    this.logger.log(
      `Admin reward adjustment request for user ${userId}: ${dto.amount} points.`,
    );
    return this.rewardShopService.adjustUserPoints(
      userId,
      dto.amount,
      dto.reason,
      this.actorId(req),
    );
  }

  private actorId(req: any): string {
    return String(req.user?.sub ?? req.user?.id ?? 'system');
  }
}
