import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { GeoStats } from './entities/geostat.entity';
import { GeoStatService } from './geostat.service';
import { GeoStatController } from './geostat.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GeoStats]), HttpModule],
  providers: [GeoStatService],
  controllers: [GeoStatController],
})
export class GeoStatsModule {}
