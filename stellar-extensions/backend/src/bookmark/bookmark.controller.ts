import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../../backend/src/admin/guards/jwt-auth.guard';
import { BookmarkService } from './bookmark.service';
import { CreateBookmarkDto } from './dto/create-bookmark.dto';
import { MoveBookmarkDto } from './dto/move-bookmark.dto';

@ApiTags('Puzzle Bookmarks')
@Controller('bookmarks')
@UseGuards(JwtAuthGuard)
export class BookmarkController {
  constructor(private readonly bookmarkService: BookmarkService) {}

  @Post()
  @ApiOperation({ summary: 'Bookmark a puzzle' })
  create(@Req() request: Request, @Body() dto: CreateBookmarkDto) {
    return this.bookmarkService.bookmark(this.actorId(request), dto);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's bookmarks" })
  list(
    @Req() request: Request,
    @Query('folderId') folderId?: string,
  ) {
    return this.bookmarkService.listBookmarks(this.actorId(request), folderId);
  }

  @Patch(':bookmarkId/move')
  @ApiOperation({ summary: 'Move a bookmark to another folder' })
  move(
    @Req() request: Request,
    @Param('bookmarkId', new ParseUUIDPipe()) bookmarkId: string,
    @Body() dto: MoveBookmarkDto,
  ) {
    return this.bookmarkService.moveBookmark(
      this.actorId(request),
      bookmarkId,
      dto,
    );
  }

  @Delete(':puzzleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a bookmark' })
  async remove(
    @Req() request: Request,
    @Param('puzzleId', new ParseUUIDPipe()) puzzleId: string,
  ): Promise<void> {
    await this.bookmarkService.unbookmark(this.actorId(request), puzzleId);
  }

  private actorId(request: Request): string {
    const user = request.user as { id?: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Authentication is required');
    return user.id;
  }
}
