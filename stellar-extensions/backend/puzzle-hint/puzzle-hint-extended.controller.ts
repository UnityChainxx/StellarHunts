import { Controller, Get, Post, Param, Body, Headers } from '@nestjs/common';
import { PuzzleHintExtendedService } from './puzzle-hint-extended.service';
import { RequestHintDto } from './dto/request-hint.dto';
import { CreatePuzzleHintDto } from './dto/create-puzzle-hint.dto';

@Controller('puzzle-hints')
export class PuzzleHintExtendedController {
  constructor(private readonly service: PuzzleHintExtendedService) {}

  /** Request a hint (deducts tokens, tracks usage). */
  @Post('request')
  requestHint(@Headers('x-user-id') userId: string, @Body() dto: RequestHintDto) {
    return this.service.requestHint(userId, dto);
  }

  /** Get list of hint summaries (order + cost) for a puzzle. */
  @Get(':puzzleId')
  listHints(@Param('puzzleId') puzzleId: string) {
    return this.service.listHintSummaries(puzzleId);
  }

  /** Get hints already used by the requesting user for a puzzle. */
  @Get(':puzzleId/used')
  getUsedHints(
    @Headers('x-user-id') userId: string,
    @Param('puzzleId') puzzleId: string,
  ) {
    return this.service.getUsedHints(userId, puzzleId);
  }

  /** Admin: create or update a hint for a puzzle. */
  @Post('admin')
  upsertHint(@Body() dto: CreatePuzzleHintDto) {
    return this.service.upsertHint(dto);
  }
}
