import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminRoleGuard } from 'src/packages/guards/admin-role.guard';

function buildContext(user?: { role: string }): ExecutionContext {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AdminRoleGuard', () => {
  const guard = new AdminRoleGuard();

  it('allows an ADMIN user', () => {
    expect(guard.canActivate(buildContext({ role: 'ADMIN' }))).toBe(true);
  });

  it.each(['STUDENT', 'TUTOR', 'PARENT'])('rejects a %s user', (role) => {
    expect(() => guard.canActivate(buildContext({ role }))).toThrow(ForbiddenException);
  });

  it('rejects a request without a user', () => {
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });
});
