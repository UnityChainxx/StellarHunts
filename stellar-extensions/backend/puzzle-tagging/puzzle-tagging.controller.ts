import { Controller, Get, Post, Delete, Param, Body, Query } from '@nestjs/common';
import { PuzzleTaggingService } from './puzzle-tagging.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { TagPuzzleDto } from './dto/tag-puzzle.dto';

@Controller('puzzle-tags')
export class PuzzleTaggingController {
  constructor(private readonly service: PuzzleTaggingService) {}

  @Post()
  createTag(@Body() dto: CreateTagDto) {
    return this.service.createTag(dto);
  }

  @Post(':puzzleId/tags')
  addTags(@Param('puzzleId') puzzleId: string, @Body() dto: TagPuzzleDto) {
    return this.service.addTagsToPuzzle(puzzleId, dto.tags);
  }

  @Delete(':puzzleId/tags/:tag')
  removeTag(@Param('puzzleId') puzzleId: string, @Param('tag') tag: string) {
    return this.service.removeTagFromPuzzle(puzzleId, tag);
  }

  @Get('search')
  search(@Query('tag') tag: string) {
    return this.service.searchByTag(tag);
  }

  @Get('autocomplete')
  autocomplete(@Query('prefix') prefix: string) {
    return this.service.autocomplete(prefix || '');
  }

  @Get('cloud')
  tagCloud() {
    return this.service.tagCloud();
  }

  @Post('admin/merge')
  mergeTags(@Body() body: { source: string; target: string }) {
    return this.service.mergeTags(body.source, body.target);
  }

  @Delete('admin/:tag')
  deleteTag(@Param('tag') tag: string) {
    return this.service.deleteTag(tag);
  }
}
