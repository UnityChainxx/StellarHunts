import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromoCode } from './promo-code.entity';
import { PromoCodeRedemption } from './entities/promo-code-redemption.entity';
import { User } from '../auth/entities/user.entity';
import { PromoCodeService } from './promo-code.service';
import { PromoCodeController } from './promo-code.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PromoCode, PromoCodeRedemption, User])],
  controllers: [PromoCodeController],
  providers: [PromoCodeService],
})
export class PromoCodeModule {}
