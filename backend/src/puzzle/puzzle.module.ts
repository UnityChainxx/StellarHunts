import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin/admin-auth.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { Puzzle } from './puzzle.entity';
import { PuzzleService } from './puzzle.service';
import { PuzzleController } from './puzzle.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Puzzle]),
    AuditLogModule,
    AdminAuthModule,
  ],
  controllers: [PuzzleController],
  providers: [PuzzleService],
  exports: [PuzzleService],
})
export class PuzzleModule {}
