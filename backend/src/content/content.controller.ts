import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
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
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { JwtAuthGuard } from '../admin/guards/jwt-auth.guard';
import { RolesGuard } from '../admin/guards/roles.guard';
import { Roles } from '../admin/roles.decorator';
import { AdminRole } from '../admin/admin-role.enum';

@ApiTags('Content')
@Controller()
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  // Public endpoints
  @Get('content')
  @ApiOperation({ summary: 'Get all active content (public)' })
  @ApiQuery({
    name: 'topic',
    required: false,
    type: String,
    description: 'Filter content by topic',
  })
  @ApiResponse({ status: 200, description: 'List of active content.' })
  async findAll(@Query('topic') topic?: string) {
    if (topic) {
      return this.contentService.findAllByTopic(topic);
    }
    return this.contentService.findAll();
  }

  @Get('content/:id')
  @ApiOperation({ summary: 'Get content by ID (public)' })
  @ApiResponse({ status: 200, description: 'Content found.' })
  @ApiResponse({ status: 404, description: 'Content not found.' })
  async findOne(@Param('id') id: string) {
    return this.contentService.findOne(id);
  }

  // Admin endpoints
  @Post('admin/content')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Create new content (admin)' })
  @ApiResponse({ status: 201, description: 'Content created successfully.' })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async create(@Body() createContentDto: CreateContentDto) {
    return this.contentService.create(createContentDto);
  }

  @Get('admin/content')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Get all content including inactive (admin)' })
  @ApiResponse({ status: 200, description: 'List of all content.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findAllAdmin() {
    return this.contentService.findAllAdmin();
  }

  @Get('admin/content/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Get content by ID including inactive (admin)' })
  @ApiResponse({ status: 200, description: 'Content found.' })
  @ApiResponse({ status: 404, description: 'Content not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async findOneAdmin(@Param('id') id: string) {
    return this.contentService.findOneAdmin(id);
  }

  @Patch('admin/content/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Update content by ID (admin)' })
  @ApiResponse({ status: 200, description: 'Content updated successfully.' })
  @ApiResponse({ status: 404, description: 'Content not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async updateAdmin(
    @Param('id') id: string,
    @Body() updateContentDto: UpdateContentDto,
  ) {
    return this.contentService.updateAdmin(id, updateContentDto);
  }

  @Delete('admin/content/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete content by ID (admin)' })
  @ApiResponse({ status: 204, description: 'Content deleted successfully.' })
  @ApiResponse({ status: 404, description: 'Content not found.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async removeAdmin(@Param('id') id: string) {
    return this.contentService.removeAdmin(id);
  }
}
