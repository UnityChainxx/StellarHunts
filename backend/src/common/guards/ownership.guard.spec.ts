import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OwnershipGuard } from './ownership.guard';
import { AdminRole } from '../../admin/admin-role.enum';

function mockContext(
  request: Record<string, any>,
  config?: unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('OwnershipGuard', () => {
  let guard: OwnershipGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OwnershipGuard,
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();
    guard = moduleRef.get(OwnershipGuard);
  });

  describe('when no @Ownership metadata is present', () => {
    it('allows the request through', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const ctx = mockContext({ user: undefined });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('route param ownership', () => {
    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue({ param: 'userId' });
    });

    it('allows a user to access their own data', () => {
      const ctx = mockContext({
        user: { id: 'user-1' },
        params: { userId: 'user-1' },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows a user whose JWT exposes sub to access their own data', () => {
      const ctx = mockContext({
        user: { sub: 'user-1' },
        params: { userId: 'user-1' },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('forbids accessing another user data', () => {
      const ctx = mockContext({
        user: { id: 'user-1' },
        params: { userId: 'user-2' },
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException when no caller is authenticated', () => {
      const ctx = mockContext({ user: undefined, params: { userId: 'user-2' } });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('allows an admin to access any user data', () => {
      const ctx = mockContext({
        user: { id: 'admin-1', role: AdminRole.ADMIN },
        params: { userId: 'user-2' },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows a superadmin to access any user data', () => {
      const ctx = mockContext({
        user: { id: 'admin-1', role: AdminRole.SUPERADMIN },
        params: { userId: 'user-2' },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('body ownership', () => {
    beforeEach(() => {
      reflector.getAllAndOverride.mockReturnValue({ body: 'userId' });
    });

    it('allows a user to act on their own id in the body', () => {
      const ctx = mockContext({
        user: { id: 'user-1' },
        body: { userId: 'user-1' },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('forbids acting on another user id in the body', () => {
      const ctx = mockContext({
        user: { id: 'user-1' },
        body: { userId: 'user-2' },
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows an admin to act on any user id in the body', () => {
      const ctx = mockContext({
        user: { id: 'admin-1', role: AdminRole.ADMIN },
        body: { userId: 'user-2' },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('passes through when the target userId is missing', () => {
      reflector.getAllAndOverride.mockReturnValue({ param: 'userId' });
      const ctx = mockContext({ user: { id: 'user-1' }, params: {} });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('compares ids as strings', () => {
      reflector.getAllAndOverride.mockReturnValue({ param: 'userId' });
      const ctx = mockContext({
        user: { id: 42 },
        params: { userId: '42' },
      });
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
