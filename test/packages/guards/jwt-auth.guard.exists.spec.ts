import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from 'src/packages/guards/jwt-auth.guard';

const ctx = (req: object) =>
  ({ getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

function build(send: jest.Mock) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
  return new JwtAuthGuard(
    { verify: jest.fn().mockReturnValue({ sub: 'u9', email: 'a@b.c', typ: 'access', role: 'TUTOR' }) } as any,
    { get: jest.fn().mockReturnValue('s') } as any,
    reflector,
    { send } as any,
  );
}
const req = () => ({ headers: { authorization: 'Bearer t' } });

describe('JwtAuthGuard session check uses redis.exists (AC7)', () => {
  it('calls redis.exists (not redis.get) with the session key', async () => {
    const send = jest.fn().mockResolvedValue(true);
    await expect(build(send).canActivate(ctx(req()))).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith('redis.exists', { key: 'session:u9' });
    expect(send.mock.calls.map((c) => c[0])).not.toContain('redis.get');
  });

  it('false -> 401', async () => {
    const send = jest.fn().mockResolvedValue(false);
    await expect(build(send).canActivate(ctx(req()))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('infra error -> fail open', async () => {
    const send = jest.fn().mockRejectedValue(new Error('rmq down'));
    await expect(build(send).canActivate(ctx(req()))).resolves.toBe(true);
  });

  it('caches a valid result', async () => {
    const send = jest.fn().mockResolvedValue(true);
    const g = build(send);
    await g.canActivate(ctx(req()));
    await g.canActivate(ctx(req()));
    expect(send).toHaveBeenCalledTimes(1);
  });
});
