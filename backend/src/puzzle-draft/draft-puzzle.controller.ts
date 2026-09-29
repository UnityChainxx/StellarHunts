import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AdminRole } from '../admin/admin-role.enum';
import { JwtAuthGuard } from '../admin/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/guards/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { DraftPuzzleService } from './draft-puzzle.service';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

// The draft workflow is an admin-only concern: creating, curating and
// publishing puzzle drafts requires an authenticated admin account.
@Controller('drafts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DraftPuzzleController {
  constructor(private readonly draftService: DraftPuzzleService) {}

  @Post()
  @Roles(AdminRole.ADMIN)
  create(@Body() dto: CreateDraftDto, @Req() req) {
    return this.draftService.create(dto, req.user.id);
  }

  @Get()
  @Roles(AdminRole.ADMIN)
  findAll() {
    return this.draftService.findAll();
  }

  @Patch(':id')
  @Roles(AdminRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateDraftDto) {
    return this.draftService.update(id, dto);
  }

  @Delete(':id')
  @Roles(AdminRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.draftService.remove(id);
  }

  @Post(':id/publish')
  @Roles(AdminRole.ADMIN)
  publish(@Param('id') id: string, @Req() req) {
    return this.draftService.publish(id, req.user?.id ?? 'system');
  }
}
