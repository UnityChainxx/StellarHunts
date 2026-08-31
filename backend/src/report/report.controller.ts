import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { AdminRole } from '../admin/admin-role.enum';
import { JwtAuthGuard } from '../admin/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/guards/roles.guard';
import { Roles } from '../admin/roles.decorator';

@Controller('report')
// Stricter than the global policy (issue #340): report payloads are small,
// stable shapes where unknown fields are rejected outright rather than
// silently stripped. Kept as a justified, explicit override.
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  // Reports are user-generated; the actor id comes from the request when
  // available and falls back to the service default otherwise.
  @Post()
  create(@Body() createReportDto: CreateReportDto, @Req() req: any) {
    const userId = req.user?.id ?? req.user?.sub ?? 1;
    return this.reportService.create(createReportDto, userId);
  }

  // Admin-only endpoints. JwtAuthGuard authenticates the admin token
  // (admin-jwt strategy) and RolesGuard enforces the AdminRole. Every
  // mutation below writes an immutable audit record (see ReportService).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @Get()
  findAll() {
    return this.reportService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @Post(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body('adminNote') adminNote: string | undefined,
    @Req() req: any,
  ) {
    return this.reportService.resolve(+id, adminNote, this.actorId(req));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reportService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateReportDto: UpdateReportDto,
    @Req() req: any,
  ) {
    return this.reportService.update(+id, updateReportDto, this.actorId(req));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.reportService.remove(+id, this.actorId(req));
  }

  private actorId(req: any): string {
    return String(req.user?.id ?? 'system');
  }
}
