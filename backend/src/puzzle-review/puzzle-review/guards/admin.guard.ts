import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AdminRole } from '../../../admin/admin-role.enum';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // The admin JWT strategy attaches the resolved admin plus its role
    // (AdminRole.ADMIN / AdminRole.SUPERADMIN) to request.user.
    const user = request.user;
    if (!user) {
      this.logger.warn('No user found in request');
      throw new UnauthorizedException('Authentication required');
    }

    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isAdmin =
      user.role === AdminRole.ADMIN ||
      user.role === AdminRole.SUPERADMIN ||
      roles.includes(AdminRole.ADMIN) ||
      roles.includes(AdminRole.SUPERADMIN);

    if (!isAdmin) {
      this.logger.warn(
        `User ${user.id} attempted to access admin endpoint without proper permissions`,
      );
      throw new UnauthorizedException('Admin access required');
    }

    this.logger.log(`Admin access granted to user ${user.id}`);
    return true;
  }
}
