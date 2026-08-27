import { PartialType } from '@nestjs/swagger';
import { UserRankDto } from './create-user-ranking.dto';

export class UpdateUserRankingDto extends PartialType(UserRankDto) {}
