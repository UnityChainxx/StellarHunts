import { Controller, Post, Body } from '@nestjs/common';
import { PuzzleForkService } from './puzzle-fork.service';
import { CreateForkDto } from './dto/create-fork.dto';

@Controller('puzzles')
export class PuzzleForkController {
  constructor(private readonly puzzleForkService: PuzzleForkService) {}

  /**
   * Admin-only endpoint to fork a puzzle.
   * In a real application, this should be protected with an AdminGuard.
   * Ex: @UseGuards(AdminGuard)
   */
  @Post('fork')
  // Relies on the global validation pipe (issue #340).
  forkPuzzle(@Body() createForkDto: CreateForkDto) {
    return this.puzzleForkService.fork(createForkDto);
  }
}
