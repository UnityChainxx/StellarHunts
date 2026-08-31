import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { Wallet } from './entities/wallet.entity';
import { ConsumedWalletNonce } from './entities/consumed-nonce.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, ConsumedWalletNonce])],
  providers: [WalletService],
  controllers: [WalletController],
  exports: [WalletService],
})
export class WalletModule {}
