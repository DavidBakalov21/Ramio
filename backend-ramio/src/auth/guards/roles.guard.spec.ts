import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

function mockExecutionContext(user?: { role?: UserRole }): ExecutionContext {
  const request = { user };
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard.canActivate', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let context: ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
    context = mockExecutionContext();
  });

  describe('no @Roles metadata (reflector returns undefined) → true', () => {
    it('allows access', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      expect(guard.canActivate(context)).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });
  });

  describe('empty roles array → true', () => {
    it('allows access', () => {
      reflector.getAllAndOverride.mockReturnValue([]);
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('request.user missing → throws ForbiddenException', () => {
    it('throws ForbiddenException', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.TEACHER]);
      context = mockExecutionContext(undefined);
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'User not found in request',
      );
    });
  });

  describe('user.role missing → throws ForbiddenException', () => {
    it('throws ForbiddenException', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.TEACHER]);
      context = mockExecutionContext({});
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'User does not have a role assigned',
      );
    });
  });

  describe('user.role not in required set → throws ForbiddenException', () => {
    it('throws ForbiddenException', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.TEACHER]);
      context = mockExecutionContext({ role: UserRole.STUDENT });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'Access denied. Required role: TEACHER. User role: STUDENT',
      );
    });
  });

  describe('user.role in required set → true', () => {
    it('allows access', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.TEACHER]);
      context = mockExecutionContext({ role: UserRole.TEACHER });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('multiple required roles, user matches one → true', () => {
    it('allows access', () => {
      reflector.getAllAndOverride.mockReturnValue([
        UserRole.TEACHER,
        UserRole.STUDENT,
      ]);
      context = mockExecutionContext({ role: UserRole.STUDENT });
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
