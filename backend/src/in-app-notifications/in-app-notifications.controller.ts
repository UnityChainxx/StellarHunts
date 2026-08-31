import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { InAppNotificationsService } from './in-app-notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { SystemNotificationDto } from './dto/system-notification.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { InAppNotificationType } from './entities/in-app-notification.entity';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { RateLimit } from '../common/decorators/rate-limit.decorator';

@ApiTags('In-App Notifications')
@Controller('in-app-notifications')
@ApiBearerAuth()
@UseGuards(RateLimitGuard)
export class InAppNotificationsController {
  constructor(
    private readonly notificationsService: InAppNotificationsService,
  ) {}

  @Get()
  @RateLimit({ limit: 30, windowMs: 60_000 })
  @ApiOperation({ summary: 'Get all notifications for the authenticated user' })
  @ApiQuery({ name: 'type', enum: InAppNotificationType, required: false })
  @ApiResponse({ status: HttpStatus.OK, description: 'Notifications retrieved successfully', type: [NotificationResponseDto] })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  async getUserNotifications(
    @Query('userId', ParseIntPipe) userId: number, // In real app, this would come from JWT token
    @Query('type') type?: InAppNotificationType,
  ) {
    return this.notificationsService.getUserNotifications(userId, type);
  }

  @Get('unread-count')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  @ApiOperation({ summary: 'Get count of unread notifications for the authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Unread count retrieved successfully', type: Number })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  async getUnreadCount(
    @Query('userId', ParseIntPipe) userId: number, // In real app, this would come from JWT token
  ): Promise<number> {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Post()
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Notification created successfully', type: NotificationResponseDto })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  async createNotification(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.createNotification(createNotificationDto);
  }

  @Post('system')
  @RateLimit({ limit: 5, windowMs: 60_000 })
  @ApiOperation({ summary: 'Create a system-wide notification' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'System notification created successfully', type: [NotificationResponseDto] })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input data' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  async createSystemNotification(@Body() systemNotificationDto: SystemNotificationDto) {
    return this.notificationsService.createSystemNotification(systemNotificationDto);
  }

  @Patch('read')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  @ApiOperation({ summary: 'Mark specific notifications as read' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Notifications marked as read successfully' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  async markAsRead(
    @Query('userId', ParseIntPipe) userId: number, // In real app, this would come from JWT token
    @Body() markReadDto: MarkReadDto,
  ) {
    return this.notificationsService.markAsRead(userId, markReadDto);
  }

  @Patch('read-all')
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @ApiOperation({ summary: 'Mark all notifications as read for the authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'All notifications marked as read successfully' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  async markAllAsRead(
    @Query('userId', ParseIntPipe) userId: number, // In real app, this would come from JWT token
  ) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch('archive')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  @ApiOperation({ summary: 'Archive specific notifications' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Notifications archived successfully' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  async archiveNotifications(
    @Query('userId', ParseIntPipe) userId: number, // In real app, this would come from JWT token
    @Body() markReadDto: MarkReadDto,
  ) {
    return this.notificationsService.archiveNotifications(
      userId,
      markReadDto.notificationIds,
    );
  }

  @Delete(':id')
  @RateLimit({ limit: 20, windowMs: 60_000 })
  @ApiOperation({ summary: 'Delete a specific notification' })
  @ApiParam({ name: 'id', description: 'Notification ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Notification deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Notification not found' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Rate limit exceeded' })
  async deleteNotification(
    @Query('userId', ParseIntPipe) userId: number, // In real app, this would come from JWT token
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.notificationsService.deleteNotification(userId, id);
  }
}
