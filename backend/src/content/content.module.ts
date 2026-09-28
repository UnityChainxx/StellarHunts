import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin/admin-auth.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { Content } from './content.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Content]), AdminAuthModule],
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
