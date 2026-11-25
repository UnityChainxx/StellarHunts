import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[a-z0-9-]+$/, { message: 'Tag must be lowercase alphanumeric with hyphens' })
  name: string;
}
