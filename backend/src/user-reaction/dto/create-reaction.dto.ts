import { IsString, IsNotEmpty, IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReactionDto {
  @ApiProperty({
    description: 'User ID who is reacting',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Content ID being reacted to',
    example: 'puzzle-123',
  })
  @IsString()
  @IsNotEmpty()
  contentId: string;

  @ApiProperty({
    description: 'Emoji reaction',
    example: '👍',
    enum: ['👍', '👎', '❤️', '😂', '😮', '😢', '😡', '🤔', '🎉', '🔥'],
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(👍|👎|❤️|😂|😮|😢|😡|🤔|🎉|🔥)$/, {
    message:
      'Invalid emoji. Allowed emojis: 👍, 👎, ❤️, 😂, 😮, 😢, 😡, 🤔, 🎉, 🔥',
  })
  emoji: string;
}
