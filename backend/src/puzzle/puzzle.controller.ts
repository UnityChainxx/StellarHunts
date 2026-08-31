import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminRole } from '../admin/admin-role.enum';
import { JwtAuthGuard } from '../admin/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/guards/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { PuzzleService } from './puzzle.service';
import { CreatePuzzleDto } from './dto/create-puzzle.dto';
import { UpdatePuzzleDto } from './dto/update-puzzle.dto';

@ApiTags('Puzzles')
@Controller()
export class PuzzleController {
  constructor(private readonly puzzleService: PuzzleService) {}

  @Post('admin/puzzles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Create a new puzzle (admin)' })
  @ApiResponse({ status: 201, description: 'Puzzle created.' })
  create(@Body() createPuzzleDto: CreatePuzzleDto) {
    return this.puzzleService.create(createPuzzleDto);
  }

  @Get('admin/puzzles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Get all puzzles (admin)' })
  @ApiResponse({ status: 200, description: 'List of puzzles.' })
  findAllAdmin() {
    return this.puzzleService.findAllAdmin();
  }

  @Get('admin/puzzles/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Get puzzle by ID (admin)' })
  @ApiResponse({ status: 200, description: 'Puzzle found.' })
  findOneAdmin(@Param('id') id: string) {
    return this.puzzleService.findOneAdmin(id);
  }

  @Patch('admin/puzzles/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update puzzle by ID (admin)' })
  @ApiResponse({ status: 200, description: 'Puzzle updated.' })
  update(
    @Param('id') id: string,
    @Body() updatePuzzleDto: UpdatePuzzleDto,
    @Req() request: Request,
  ) {
    return this.puzzleService.update(
      id,
      updatePuzzleDto,
      this.actorId(request),
    );
  }

  @Delete('admin/puzzles/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete puzzle by ID (admin)' })
  @ApiResponse({ status: 204, description: 'Puzzle deleted.' })
  remove(@Param('id') id: string, @Req() request: Request) {
    return this.puzzleService.remove(id, this.actorId(request));
  }

  private actorId(request: Request): string {
    const user = request.user as { id?: string } | undefined;
    return String(user?.id ?? 'system');
  }

  @Get('puzzles/active')
  @ApiOperation({ summary: 'Get active puzzles (public)' })
  @ApiQuery({ name: 'difficulty', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of active puzzles.' })
  findActive(@Query('difficulty') difficulty?: string) {
    return this.puzzleService.findActive(difficulty);
  }
}
