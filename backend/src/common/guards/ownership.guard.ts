import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '../../admin/admin-role.enum';
import { OWNERSHIP_KEY, OwnershipConfig } from '../decorators/ownership.decorator';

/**
 * Roles that are explicitly allowed to access any user's data. Mirrors
 * `AdminRole` so user tokens (which carry no `role` claim) can never pass.
 */
const ADMIN_ROLES = new Set<string>([AdminRole.ADMIN, AdminRole.SUPERADMIN]);

/**
 * Enforces that a route which operates on a specific `userId` (declared via
 * `@Ownership({ param: 'userId' })` or `@Ownership({ body: 'userId' })`) can
 * only be invoked by the owner of that id — unless the caller carries an
 * explicit administrative role.
 *
 * The authenticated caller is read from `request.user`:
 * - user JWTs validated through the passport `jwt` strategy expose the full
 *   user entity (`.id`);
 * - user JWTs decoded by `AuthMiddleware` expose the raw payload (`.sub`);
 * - admin JWTs expose the admin entity (`.id`) plus a `.role` claim.
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.reflector.getAllAndOverride<OwnershipConfig>(
      OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // An explicitly authenticated administrator may access any user's data.
    if (user?.role && ADMIN_ROLES.has(user.role)) {
      return true;
    }

    const callerId = user?.id ?? user?.sub;
    if (!callerId) {
      throw new UnauthorizedException(
        'Authentication required to access this resource',
      );
    }

    const targetUserId = config.param
      ? request.params?.[config.param]
      : config.body
        ? request.body?.[config.body]
        : undefined;

    // No target id on the request — let the route handler validate it.
    if (!targetUserId) {
      return true;
    }

    if (String(callerId) !== String(targetUserId)) {
      throw new ForbiddenException('You can only access your own data');
    }

    return true;
  }
}
