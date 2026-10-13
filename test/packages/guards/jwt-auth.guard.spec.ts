import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from 'src/packages/guards/jwt-auth.guard';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

type Req = { headers: Record<string, string | undefined>; user?: unknown };

function buildContext(req: Req): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const validPayload = { sub: 'user-1', email: 'a@b.c', typ: 'access', role: 'TUTOR' };

describe('JwtAuthGuard', () => {
  let jwt: { verify: jest.Mock };
  let config: { get: jest.Mock };
  let reflector: Reflector;
  let rmq: { send: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verify: jest.fn().mockReturnValue(validPayload) };
    config = {
      get: jest.fn((key: string) =>
        key === 'JWT_ACCESS_SECRET' ? 'access-secret' : key === 'JWT_REFRESH_SECRET' ? 'refresh-secret' : undefined,
      ),
    };
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    rmq = { send: jest.fn().mockResolvedValue(true) };
    guard = new JwtAuthGuard(
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      reflector,
      rmq as unknown as RmqProducer,
    );
  });

  it('skips all checks for @Public routes', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(buildContext({ headers: {} }))).resolves.toBe(true);
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('rejects a missing Authorization header', async () => {
    await expect(guard.canActivate(buildContext({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-Bearer scheme', async () => {
    const req = { headers: { authorization: 'Basic abc' } };
    await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token that fails verification', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const req = { headers: { authorization: 'Bearer bad' } };
    await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token that is not an access token (typ mismatch)', async () => {
    jwt.verify.mockReturnValue({ ...validPayload, typ: 'refresh' });
    const req = { headers: { authorization: 'Bearer t' } };
    await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the user and returns true when the Redis session exists', async () => {
    const req: Req = { headers: { authorization: 'Bearer t' } };
    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'user-1', email: 'a@b.c', typ: 'access', role: 'TUTOR' });
    expect(rmq.send).toHaveBeenCalledWith('redis.exists', { key: 'session:user-1' });
  });

  it('verifies with JWT_ACCESS_SECRET from config', async () => {
    const req = { headers: { authorization: 'Bearer t' } };
    await guard.canActivate(buildContext(req));
    expect(jwt.verify).toHaveBeenCalledWith('t', { secret: 'access-secret' });
  });

  it('rejects when Redis reports no session (deleted)', async () => {
    rmq.send.mockResolvedValue(false);
    const req = { headers: { authorization: 'Bearer t' } };
    await expect(guard.canActivate(buildContext(req))).rejects.toThrow('Session expired or not found ...');
  });

  it('caches a valid session result and skips the RPC on the next request', async () => {
    const req = { headers: { authorization: 'Bearer t' } };
    await guard.canActivate(buildContext(req));
    await guard.canActivate(buildContext(req));
    expect(rmq.send).toHaveBeenCalledTimes(1);
  });

<<<<<<< Updated upstream
  it('does not cache an invalid session (GW-13): each request re-checks', async () => {
    rmq.send.mockResolvedValue(null);
=======
  it('caches an invalid session and rejects without another RPC', async () => {
    rmq.send.mockResolvedValue(false);
>>>>>>> Stashed changes
    const req = { headers: { authorization: 'Bearer t' } };
    await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(rmq.send).toHaveBeenCalledTimes(2);
  });

  it('fails open when the session store is unreachable', async () => {
    rmq.send.mockRejectedValue(new Error('rabbit down'));
    const req = { headers: { authorization: 'Bearer t' } };
    await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);
  });
});
