import { Controller, Post, Body } from '@nestjs/common';
import { DailyRewardService } from './daily-reward.service';
import { DailyCheckinDto } from './dto/daily-checkin.dto';

@Controller('rewards')
export class DailyRewardController {
  constructor(private readonly dailyRewardService: DailyRewardService) {}

  @Post('daily-checkin')
  // Relies on the global validation pipe (issue #340).
  dailyCheckIn(@Body() dailyCheckinDto: DailyCheckinDto) {
    return this.dailyRewardService.dailyCheckIn(dailyCheckinDto.userId);
  }
}
