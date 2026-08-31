import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by {@link OwnershipGuard} to locate the `userId` that a
 * route operates on.
 */
export const OWNERSHIP_KEY = 'ownership';

export interface OwnershipConfig {
  /** Name of the route parameter holding the target user id (e.g. `userId`). */
  param?: string;
  /** Name of the body field holding the target user id (e.g. `userId`). */
  body?: string;
}

/**
 * Declares which `userId` a route operates on so the global
 * {@link OwnershipGuard} can enforce that callers only touch their own data
 * (unless they carry an explicit administrative role).
 *
 * @example
 * ```ts
 * @UseGuards(AuthGuard('jwt'), OwnershipGuard)
 * @Ownership({ param: 'userId' })
 * getUserPoints(@Param('userId') userId: string) { ... }
 * ```
 */
export const Ownership = (config: OwnershipConfig) =>
  SetMetadata(OWNERSHIP_KEY, config);
