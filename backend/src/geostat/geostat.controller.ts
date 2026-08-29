import { Controller, Post, Get, Ip } from '@nestjs/common';
import { GeoStatService } from './geostat.service';

@Controller('geostat')
export class GeoStatController {
  constructor(private readonly geoStatsService: GeoStatService) {}

  @Post('track')
  track(@Ip() ip: string) {
    return this.geoStatsService.trackUser(ip);
  }

  @Get('stats')
  getStats() {
    return this.geoStatsService.getStats();
  }
}
