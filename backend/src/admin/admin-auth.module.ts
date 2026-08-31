import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Admin } from './admin.entity';
import { AdminService } from './admin.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * AdminAuthModule
 * ---------------
 * Provides the admin JWT strategy and guards (`admin-jwt` passport strategy
 * plus role checks against `AdminRole`) without registering global guards.
 *
 * Feature modules that need role-protected admin actions import this module
 * and apply `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)` on their
 * controllers. The strategy is registered here so `AuthGuard('admin-jwt')`
 * resolves for every consuming module.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'supersecret',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [AdminService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [AdminService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AdminAuthModule {}
