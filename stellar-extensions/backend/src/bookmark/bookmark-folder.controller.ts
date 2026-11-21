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
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../../backend/src/admin/guards/jwt-auth.guard';
import { BookmarkService } from './bookmark.service';
import { CreateBookmarkFolderDto } from './dto/create-bookmark-folder.dto';
import { UpdateBookmarkFolderDto } from './dto/update-bookmark-folder.dto';

@ApiTags('Bookmark Folders')
@Controller('bookmark-folders')
@UseGuards(JwtAuthGuard)
export class BookmarkFolderController {
  constructor(private readonly bookmarkService: BookmarkService) {}

  @Post()
  @ApiOperation({ summary: 'Create a bookmark folder' })
  create(@Req() request: Request, @Body() dto: CreateBookmarkFolderDto) {
    return this.bookmarkService.createFolder(this.actorId(request), dto);
  }

  @Get()
  @ApiOperation({ summary: "List the current user's bookmark folders" })
  list(@Req() request: Request) {
    return this.bookmarkService.listFolders(this.actorId(request));
  }

  @Patch(':folderId')
  @ApiOperation({ summary: 'Rename a folder or change its visibility' })
  update(
    @Req() request: Request,
    @Param('folderId', new ParseUUIDPipe()) folderId: string,
    @Body() dto: UpdateBookmarkFolderDto,
  ) {
    return this.bookmarkService.updateFolder(
      this.actorId(request),
      folderId,
      dto,
    );
  }

  @Delete(':folderId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a folder, keeping its bookmarks' })
  async remove(
    @Req() request: Request,
    @Param('folderId', new ParseUUIDPipe()) folderId: string,
  ): Promise<void> {
    await this.bookmarkService.deleteFolder(this.actorId(request), folderId);
  }

  @Post(':folderId/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a folder and return its share link' })
  share(
    @Req() request: Request,
    @Param('folderId', new ParseUUIDPipe()) folderId: string,
  ) {
    return this.bookmarkService.shareFolder(this.actorId(request), folderId);
  }

  @Delete(':folderId/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a folder share link' })
  async unshare(
    @Req() request: Request,
    @Param('folderId', new ParseUUIDPipe()) folderId: string,
  ): Promise<void> {
    await this.bookmarkService.unshareFolder(this.actorId(request), folderId);
  }

  private actorId(request: Request): string {
    const user = request.user as { id?: string } | undefined;
    if (!user?.id) throw new UnauthorizedException('Authentication is required');
    return user.id;
  }
}
