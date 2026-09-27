import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import {
  annotateAuthFromGuards,
  classifyGuards,
  guardName,
  toOpenApiPath,
  type ModuleLike,
} from './annotate-auth';
import type { OpenApiDocumentLike } from './render-markdown';

class JwtAuthGuard {}
class AdminGuard {}
class RateLimitGuard {}
class Finder {}

function baseDocument(): OpenApiDocumentLike {
  return {
    info: { title: 't', version: '1' },
    paths: {
      '/users/{id}': { get: {} },
      '/admin/users': { post: {} },
      '/public': { get: {} },
    },
  };
}

function controllerModule(): ModuleLike {
  class UsersController {}
  Reflect.defineMetadata(PATH_METADATA, 'users', UsersController);

  const findOne = function findOne() {};
  Reflect.defineMetadata(PATH_METADATA, ':id', findOne);
  Reflect.defineMetadata(METHOD_METADATA, RequestMethod.GET, findOne);
  Reflect.defineMetadata(GUARDS_METADATA, [RateLimitGuard], findOne);
  (UsersController.prototype as Record<string, unknown>).findOne = findOne;

  class AdminController {}
  Reflect.defineMetadata(PATH_METADATA, 'admin', AdminController);
  const create = function create() {};
  Reflect.defineMetadata(PATH_METADATA, 'users', create);
  Reflect.defineMetadata(METHOD_METADATA, RequestMethod.POST, create);
  Reflect.defineMetadata(GUARDS_METADATA, [JwtAuthGuard, AdminGuard], create);
  (AdminController.prototype as Record<string, unknown>).create = create;

  return {
    controllers: new Map<unknown, { metatype?: unknown }>([
      [UsersController, { metatype: UsersController }],
      [AdminController, { metatype: AdminController }],
    ]),
  };
}

describe('classifyGuards', () => {
  it('recognises JWT and admin guards', () => {
    expect(classifyGuards(['JwtAuthGuard'])).toBe('JWT');
    expect(classifyGuards(['JwtAuthGuard', 'RolesGuard'])).toBe('JWT + Admin');
    expect(classifyGuards(['AdminGuard'])).toBe('JWT + Admin');
    expect(classifyGuards(['APIKeyGuard'])).toBe('API key');
  });

  it('ignores non-authentication guards', () => {
    expect(classifyGuards(['RateLimitGuard', 'OwnershipGuard'])).toBeUndefined();
  });
});

describe('guardName', () => {
  it('reads the class name of a guard', () => {
    expect(guardName(JwtAuthGuard)).toBe('JwtAuthGuard');
    expect(guardName(new Finder())).toBe('Finder');
  });
});

describe('toOpenApiPath', () => {
  it('converts express parameters to OpenAPI parameters', () => {
    expect(toOpenApiPath('/users/:id/posts/:postId')).toBe('/users/{id}/posts/{postId}');
    expect(toOpenApiPath('')).toBe('/');
    expect(toOpenApiPath('/health/')).toBe('/health');
  });
});

describe('annotateAuthFromGuards', () => {
  it('adds x-auth derived from route guards without touching public routes', () => {
    const document = baseDocument();
    annotateAuthFromGuards([controllerModule()], document);

    expect(document.paths['/users/{id}'].get['x-auth']).toBeUndefined();
    expect(document.paths['/admin/users'].post['x-auth']).toBe('JWT + Admin');
    expect(document.paths['/public'].get['x-auth']).toBeUndefined();
  });

  it('preserves an explicitly declared x-auth', () => {
    const document = baseDocument();
    document.paths['/admin/users'].post['x-auth'] = 'Custom';
    annotateAuthFromGuards([controllerModule()], document);

    expect(document.paths['/admin/users'].post['x-auth']).toBe('Custom');
  });
});
