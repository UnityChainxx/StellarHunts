import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GeoStats } from './entities/geostat.entity';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { isIP } from 'node:net';
import { assertSafeHttpUrl } from '../common/security/safe-url';

@Injectable()
export class GeoStatService {
  constructor(
    @InjectRepository(GeoStats)
    private readonly geoStatsRepository: Repository<GeoStats>,
    private readonly httpService: HttpService,
  ) {}

  async trackUser(ipAddress: string): Promise<GeoStats> {
    try {
      // The IP is interpolated into the path of a fixed, known host, but we
      // still (1) require a real IP literal to prevent path injection and
      // (2) use the validated https URL so the outbound call stays on an
      // approved scheme/host (issue #318).
      if (!isIP(ipAddress)) {
        throw new Error('Invalid IP address');
      }
      const lookupUrl = `https://ip-api.com/json/${ipAddress}`;
      assertSafeHttpUrl(lookupUrl, 'geolocation lookup URL');

      const { data } = await firstValueFrom(
        this.httpService.get(lookupUrl),
      );

      const newGeoStat = this.geoStatsRepository.create({
        ipAddress,
        country: data.country || 'Unknown',
      });

      return await this.geoStatsRepository.save(newGeoStat);
    } catch (error) {
      console.error('Error resolving IP address:', error);

      const newGeoStat = this.geoStatsRepository.create({
        ipAddress,
        country: 'Unknown',
      });
      return await this.geoStatsRepository.save(newGeoStat);
    }
  }

  async getStats(): Promise<{ country: string; userCount: string }[]> {
    return this.geoStatsRepository
      .createQueryBuilder('geostat')
      .select('country')
      .addSelect('COUNT(DISTINCT "ipAddress")', 'userCount')
      .groupBy('country')
      .getRawMany();
  }
}
