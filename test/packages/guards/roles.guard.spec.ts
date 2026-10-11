import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@packages/decorators';
import { RolesGuard } from 'src/packages/guards/roles.guard';

const handler = jest.fn();
const classRef = jest.fn();

function buildContext(user?: { role: string }): ExecutionContext {
  const request = { user };
  return {
    getHandler: () => handler,
    getClass: () => classRef,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows the request when no roles metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows the request when the roles list is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(buildContext({ role: 'STUDENT' }))).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN', 'TUTOR']);
    expect(guard.canActivate(buildContext({ role: 'TUTOR' }))).toBe(true);
  });

  it('rejects a user whose role is not in the required list', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(buildContext({ role: 'STUDENT' }))).toThrow(ForbiddenException);
  });

  it('rejects a request with no authenticated user when roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });

  it('reads roles from handler and class metadata under ROLES_KEY', () => {
    const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const ctx = buildContext({ role: 'ADMIN' });
    guard.canActivate(ctx);
    expect(spy).toHaveBeenCalledWith(ROLES_KEY, [handler, classRef]);
  });
});
