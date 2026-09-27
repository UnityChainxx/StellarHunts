/**
 * Annotates OpenAPI operations with the authentication requirement derived
 * from the NestJS route guards.
 *
 * The Swagger scanner can only see security declared with `@ApiBearerAuth()`
 * / `@ApiSecurity()`. Most routes in this codebase protect themselves with
 * `@UseGuards(...)` instead, so relying on `security` alone would label them
 * `Public` in the generated reference. This walks the module graph, reads the
 * `__guards__` metadata for every route, and stores a human-readable
 * `x-auth` vendor extension that the Markdown renderer prefers (issue #555).
 */

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import type { OpenApiDocumentLike } from './render-markdown';

/** Structural view of a module's registered controllers. */
export interface ModuleLike {
  controllers: Map<unknown, { metatype?: unknown }>;
}

/** Human-readable name of a guard class reference. */
export function guardName(guard: unknown): string {
  if (typeof guard === 'function') return guard.name;
  if (guard && typeof guard === 'object') {
    const ctor = (guard as { constructor?: { name?: string } }).constructor;
    if (ctor && typeof ctor.name === 'string' && ctor.name.length > 0) {
      return ctor.name;
    }
  }
  return String(guard ?? '');
}

/**
 * Maps a set of guard names to an auth label, or `undefined` when none of the
 * guards enforce authentication (e.g. rate limiting or ownership checks).
 */
export function classifyGuards(guardNames: string[]): string | undefined {
  const has = (needle: string) => guardNames.some((name) => name.includes(needle));

  if (has('APIKeyGuard')) return 'API key';
  if (has('AdminGuard') || has('RolesGuard')) return 'JWT + Admin';
  if (has('JwtAuthGuard') || has('AuthGuard')) return 'JWT';
  return undefined;
}

function asRoutePath(value: unknown): string {
  if (Array.isArray(value)) return asRoutePath(value[0]);
  return typeof value === 'string' ? value : '';
}

/** Converts an Express-style route (`/users/:id`) to its OpenAPI form. */
export function toOpenApiPath(path: string): string {
  const withParams = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  const collapsed = withParams.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  if (collapsed.length === 0) return '/';
  return collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
}

function joinRoute(controllerPath: string, methodPath: string): string {
  const segments = [controllerPath, methodPath]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0);
  return toOpenApiPath(`/${segments.join('/')}`);
}

/**
 * Mutates `document`, adding `x-auth` to operations whose route carries
 * authentication guards. Existing `x-auth` values (e.g. from `security`
 * annotations) are preserved.
 */
export function annotateAuthFromGuards(
  modules: Iterable<ModuleLike>,
  document: OpenApiDocumentLike,
): void {
  for (const moduleRef of modules) {
    for (const wrapper of moduleRef.controllers.values()) {
      const controller = wrapper?.metatype as (Function & { prototype?: object }) | undefined;
      if (typeof controller !== 'function' || !controller.prototype) continue;

      const controllerPath = asRoutePath(Reflect.getMetadata(PATH_METADATA, controller));
      const controllerGuards = (
        (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? []
      ).map(guardName);

      for (const propertyName of Object.getOwnPropertyNames(controller.prototype)) {
        if (propertyName === 'constructor') continue;
        const handler = (controller.prototype as Record<string, unknown>)[propertyName];
        if (typeof handler !== 'function') continue;

        const method: RequestMethod | undefined = Reflect.getMetadata(
          METHOD_METADATA,
          handler,
        );
        if (method === undefined) continue;

        const methodName = RequestMethod[method]?.toLowerCase();
        if (!methodName || methodName === 'all') continue;

        const methodPath = asRoutePath(Reflect.getMetadata(PATH_METADATA, handler));
        const guards = [
          ...controllerGuards,
          ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []).map(
            guardName,
          ),
        ];

        const label = classifyGuards(guards);
        if (!label) continue;

        const operation = document.paths[joinRoute(controllerPath, methodPath)]?.[methodName];
        if (operation && !operation['x-auth']) {
          operation['x-auth'] = label;
        }
      }
    }
  }
}
