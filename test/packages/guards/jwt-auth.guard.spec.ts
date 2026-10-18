import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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

const validPayload = { sub: 'user-1', email: 'a@b.c', typ: 'access', role: 'TUTOR', sid: 'sid-1' };
const bearer = { headers: { authorization: 'Bearer t' } };

describe('JwtAuthGuard', () => {
  let jwt: { verify: jest.Mock };
  let config: { get: jest.Mock };
  let reflector: Reflector;
  let rmq: { send: jest.Mock };
  let guard: JwtAuthGuard;

  const build = () =>
    new JwtAuthGuard(
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      reflector,
      rmq as unknown as RmqProducer,
    );

  beforeEach(() => {
    jwt = { verify: jest.fn().mockReturnValue(validPayload) };
    config = {
      get: jest.fn((key: string) =>
        key === 'JWT_ACCESS_SECRET'
          ? 'access-secret'
          : key === 'JWT_REFRESH_SECRET'
            ? 'refresh-secret'
            : undefined,
      ),
    };
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    rmq = { send: jest.fn().mockResolvedValue(true) };
    guard = build();
  });

  afterEach(() => jest.useRealTimers());

  it('skips all checks for @Public routes', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(buildContext({ headers: {} }))).resolves.toBe(true);
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it('rejects a missing or non-Bearer Authorization header', async () => {
    await expect(guard.canActivate(buildContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      guard.canActivate(buildContext({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies with the access secret pinned to HS256', async () => {
    const req = { ...bearer };
    await guard.canActivate(buildContext(req));
    expect(jwt.verify).toHaveBeenCalledWith('t', {
      secret: 'access-secret',
      algorithms: ['HS256'],
    });
  });

  it('rejects a token that fails verification or is not an access token', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    await expect(guard.canActivate(buildContext(bearer))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    jwt.verify.mockReturnValue({ ...validPayload, typ: 'refresh' });
    await expect(guard.canActivate(buildContext(bearer))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects legacy tokens without a sid claim (forces re-login)', async () => {
    jwt.verify.mockReturnValue({ ...validPayload, sid: undefined });
    await expect(guard.canActivate(buildContext(bearer))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(rmq.send).not.toHaveBeenCalled();
  });

  it('rejects unknown or non-string roles instead of demoting them', async () => {
    for (const role of ['superadmin', 'SUPERUSER', 42]) {
      jwt.verify.mockReturnValue({ ...validPayload, role });
      await expect(guard.canActivate(buildContext(bearer))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('accepts each known role and attaches id, email, role and sid', async () => {
    for (const role of ['STUDENT', 'ADMIN', 'TUTOR', 'PARENT']) {
      jwt.verify.mockReturnValue({ ...validPayload, role });
      const req: { headers: Record<string, string>; user?: unknown } = { ...bearer };
      await expect(guard.canActivate(buildContext(req))).resolves.toBe(true);
      expect(req.user).toEqual({ id: 'user-1', email: 'a@b.c', typ: 'access', role, sid: 'sid-1' });
    }
  });

  describe('session check (session:{sub}:{sid} via redis.exists)', () => {
    it('queries the per-session key', async () => {
      await guard.canActivate(buildContext(bearer));
      expect(rmq.send).toHaveBeenCalledWith('redis.exists', { key: 'session:user-1:sid-1' });
    });

    it('rejects when the session no longer exists (logout / revocation)', async () => {
      rmq.send.mockResolvedValue(false);
      await expect(guard.canActivate(buildContext(bearer))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('caches a valid session for 5 seconds per user+sid', async () => {
      jest.useFakeTimers({ now: 1_000_000 });
      await guard.canActivate(buildContext(bearer));
      await guard.canActivate(buildContext(bearer));
      expect(rmq.send).toHaveBeenCalledTimes(1);
      jest.setSystemTime(1_000_000 + 5_001);
      await guard.canActivate(buildContext(bearer));
      expect(rmq.send).toHaveBeenCalledTimes(2);
    });

    it('does not cache a negative result: every request re-checks', async () => {
      rmq.send.mockResolvedValue(false);
      await expect(guard.canActivate(buildContext(bearer))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(guard.canActivate(buildContext(bearer))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(rmq.send).toHaveBeenCalledTimes(2);
    });

    it('fails closed (503) when the session store is unreachable, after one retry', async () => {
      rmq.send.mockRejectedValue(new Error('timeout'));
      await expect(guard.canActivate(buildContext(bearer))).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(rmq.send).toHaveBeenCalledTimes(2);
    });

    it('recovers when the retry succeeds', async () => {
      rmq.send.mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce(true);
      await expect(guard.canActivate(buildContext(bearer))).resolves.toBe(true);
    });

    it('fails open only when SESSION_CHECK_FAIL_OPEN=true', async () => {
      config.get.mockImplementation((key: string) =>
        key === 'JWT_ACCESS_SECRET'
          ? 'access-secret'
          : key === 'JWT_REFRESH_SECRET'
            ? 'refresh-secret'
            : key === 'SESSION_CHECK_FAIL_OPEN'
              ? 'true'
              : undefined,
      );
      guard = build();
      rmq.send.mockRejectedValue(new Error('down'));
      await expect(guard.canActivate(buildContext(bearer))).resolves.toBe(true);
    });
  });
});
