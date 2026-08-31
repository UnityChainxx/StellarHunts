import { IsString, IsEnum, IsOptional, IsNumber, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { InAppNotificationType } from '../entities/in-app-notification.entity';

export class CreateNotificationDto {
  @ApiProperty({ description: 'Title of the notification', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Notification title must be 200 characters or fewer' })
  title: string;

  @ApiProperty({ description: 'Message content of the notification', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'Notification message must be 2000 characters or fewer' })
  message: string;

  @ApiProperty({
    description: 'Type of notification',
    enum: InAppNotificationType,
  })
  @IsEnum(InAppNotificationType)
  type: InAppNotificationType;

  @ApiProperty({
    description: 'ID of the user who should receive this notification',
    required: false,
  })
  @IsNumber()
  @IsOptional()
  userId?: number;
}
