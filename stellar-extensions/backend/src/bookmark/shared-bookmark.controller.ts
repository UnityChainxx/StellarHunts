import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookmarkService } from './bookmark.service';

@ApiTags('Puzzle Bookmarks')
@Controller('shared/bookmarks')
export class SharedBookmarkController {
  constructor(private readonly bookmarkService: BookmarkService) {}

  /**
   * Public, unauthenticated view of a shared collection. Private folders and
   * unknown slugs both 404 so the endpoint never leaks folder existence.
   */
  @Get(':slug')
  @ApiOperation({ summary: 'View a shared bookmark collection' })
  get(@Param('slug') slug: string) {
    return this.bookmarkService.getSharedCollection(slug);
  }
}
