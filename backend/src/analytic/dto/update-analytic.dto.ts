import { PartialType } from '@nestjs/swagger';
import { CreateAnalyticsDto } from './create-analytic.dto';

export class UpdateAnalyticsDto extends PartialType(CreateAnalyticsDto) {}
