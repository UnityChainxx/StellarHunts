import { IsArray, IsNumber, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MarkReadDto {
  @ApiProperty({
    description: 'Array of notification IDs to mark as read',
    type: [Number],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @ArrayMaxSize(100, { message: 'Cannot mark more than 100 notifications at once' })
  notificationIds: number[];
}
