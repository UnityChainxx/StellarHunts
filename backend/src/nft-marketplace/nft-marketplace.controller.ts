import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NftMarketplaceService } from './nft-marketplace.service';
import { NftListing } from './entities/nft-listing.entity';
import { NftTradeOffer } from './entities/nft-trade-offer.entity';
import {
  CreateListingDto,
  CreateOfferDto,
  ListListingsQueryDto,
  RespondToOfferDto,
} from './dto/marketplace.dto';

/**
 * NFT transfer/trade marketplace (issue #735).
 *
 * Peer-to-peer trading of reward NFTs with an offer/accept flow, escrowed
 * settlement, and configurable marketplace fees. Read endpoints are public;
 * every mutation requires a JWT and is ownership-checked in the service.
 */
@ApiTags('NFT Marketplace')
@Controller('nft-marketplace')
export class NftMarketplaceController {
  constructor(private readonly marketplaceService: NftMarketplaceService) {}

  @Get('listings')
  @ApiOperation({
    summary: 'List open and escrowed marketplace listings',
  })
  @ApiQuery({ name: 'sellerId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: [NftListing] })
  getActiveListings(@Query() query: ListListingsQueryDto): Promise<NftListing[]> {
    return this.marketplaceService.getActiveListings(query);
  }

  @Get('listings/:id')
  @ApiOperation({ summary: 'Get a listing by ID' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 200, type: NftListing })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  getListing(@Param('id') id: string): Promise<NftListing> {
    return this.marketplaceService.getListing(id);
  }

  @Get('listings/:id/offers')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List offers on a listing' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 200, type: [NftTradeOffer] })
  getOffersForListing(@Param('id') id: string): Promise<NftTradeOffer[]> {
    return this.marketplaceService.getOffersForListing(id);
  }

  @Get('users/:userId/offers')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the authenticated user's own offers" })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiResponse({ status: 200, type: [NftTradeOffer] })
  getMyOffers(@Param('userId') userId: string, @Req() req: any): Promise<NftTradeOffer[]> {
    const requester = String(req.user?.sub ?? req.user?.id ?? '');
    if (requester !== userId) {
      // Enforced here so a caller cannot enumerate another user's offers.
      return Promise.resolve([]);
    }
    return this.marketplaceService.getOffersByUser(userId);
  }

  @Post('listings')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List an NFT for sale' })
  @ApiResponse({ status: 201, type: NftListing })
  createListing(@Body() dto: CreateListingDto, @Req() req: any): Promise<NftListing> {
    return this.marketplaceService.createListing(this.actorId(req), dto);
  }

  @Delete('listings/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a listing (seller only)' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  cancelListing(@Param('id') id: string, @Req() req: any): Promise<NftListing> {
    return this.marketplaceService.cancelListing(id, this.actorId(req));
  }

  @Post('listings/:id/offers')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Make an offer on a listing' })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 201, type: NftTradeOffer })
  createOffer(
    @Param('id') id: string,
    @Body() dto: CreateOfferDto,
    @Req() req: any,
  ): Promise<NftTradeOffer> {
    return this.marketplaceService.createOffer(id, this.actorId(req), dto);
  }

  @Delete('offers/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw a pending offer (offeror only)' })
  @ApiParam({ name: 'id', description: 'Offer ID' })
  cancelOffer(@Param('id') id: string, @Req() req: any): Promise<NftTradeOffer> {
    return this.marketplaceService.cancelOffer(id, this.actorId(req));
  }

  @Post('offers/:id/respond')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept or reject an offer (seller only)' })
  @ApiParam({ name: 'id', description: 'Offer ID' })
  @ApiResponse({ status: 200, description: 'Decision recorded; accepting moves the NFT into escrow' })
  respondToOffer(
    @Param('id') id: string,
    @Body() dto: RespondToOfferDto,
    @Req() req: any,
  ) {
    return this.marketplaceService.respondToOffer(id, this.actorId(req), dto.decision);
  }

  @Post('listings/:id/settle')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Settle the escrow: transfer the NFT to the buyer and pay the seller minus the fee',
  })
  @ApiParam({ name: 'id', description: 'Listing ID' })
  @ApiResponse({ status: 200, description: 'Settlement summary' })
  settleEscrow(@Param('id') id: string, @Req() req: any) {
    return this.marketplaceService.settleEscrow(id, this.actorId(req));
  }

  private actorId(req: any): string {
    return String(req.user?.sub ?? req.user?.id ?? 'system');
  }
}
