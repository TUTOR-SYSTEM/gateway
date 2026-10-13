import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
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

const bearer = (token = 't') => ({ authorization: `Bearer ${token}` });
const access = (overrides: Record<string, unknown> = {}) => ({
  sub: 'user-1',
  email: 'a@b.c',
  typ: 'access',
  role: 'TUTOR',
  ...overrides,
});

describe('JwtAuthGuard branch coverage', () => {
  let jwt: { verify: jest.Mock };
  let config: { get: jest.Mock };
  let reflector: Reflector;
  let rmq: { send: jest.Mock };
  let guard: JwtAuthGuard;
  let env: Record<string, string | undefined>;

  function build(
    configValues: Record<string, string | undefined> = {
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
    },
  ) {
    config = { get: jest.fn((key: string) => configValues[key]) };
    guard = new JwtAuthGuard(
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      reflector,
      rmq as unknown as RmqProducer,
    );
  }

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jwt = { verify: jest.fn().mockReturnValue(access()) };
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    rmq = { send: jest.fn().mockResolvedValue(true) };
    env = {};
    build();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('role parsing', () => {
    it.each(['STUDENT', 'ADMIN', 'TUTOR', 'PARENT'])('accepts the known role %s', async (role) => {
      jwt.verify.mockReturnValue(access({ role }));
      const req: Req = { headers: bearer() };
      await guard.canActivate(buildContext(req));
      expect(req.user).toMatchObject({ role });
    });

    it('demotes an unknown string role to STUDENT instead of rejecting', async () => {
      jwt.verify.mockReturnValue(access({ role: 'SUPERUSER' }));
      const req: Req = { headers: bearer() };
      await guard.canActivate(buildContext(req));
      expect(req.user).toMatchObject({ role: 'STUDENT' });
    });

    it('rejects a token whose role claim is not a string', async () => {
      jwt.verify.mockReturnValue(access({ role: 42 }));
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toThrow(
        'Check role user failed ...',
      );
    });

    it('rejects a token that has no role claim at all', async () => {
      const { role: _omit, ...noRole } = access();
      jwt.verify.mockReturnValue(noRole);
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('access payload validation', () => {
    it('rejects a decoded value that is null', async () => {
      jwt.verify.mockReturnValue(null);
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toThrow(
        'Unauthorized ...',
      );
    });

    it('rejects a decoded value that is a primitive string', async () => {
      jwt.verify.mockReturnValue('raw-string');
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toThrow(
        'Unauthorized ...',
      );
    });

    it('rejects a refresh-typed token presented as an access token', async () => {
      jwt.verify.mockReturnValue(access({ typ: 'refresh' }));
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toThrow(
        'Unauthorized ...',
      );
    });

    it('rejects a token whose sub is not a string', async () => {
      jwt.verify.mockReturnValue(access({ sub: 123 }));
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toThrow(
        'Unauthorized ...',
      );
    });

    it('rejects a token without an email claim', async () => {
      jwt.verify.mockReturnValue(access({ email: undefined }));
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toThrow(
        'Unauthorized ...',
      );
    });

    it('does not attach request.user when the payload is rejected', async () => {
      jwt.verify.mockReturnValue(access({ typ: 'refresh' }));
      const req: Req = { headers: bearer() };
      await expect(guard.canActivate(buildContext(req))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(req.user).toBeUndefined();
    });

    it('maps the token payload to id/email/typ/role on the request', async () => {
      const req: Req = { headers: bearer() };
      await guard.canActivate(buildContext(req));
      expect(req.user).toEqual({ id: 'user-1', email: 'a@b.c', typ: 'access', role: 'TUTOR' });
    });
  });

  describe('secret resolution', () => {
    it('verifies with JWT_ACCESS_SECRET when present', async () => {
      await guard.canActivate(buildContext({ headers: bearer() }));
      expect(jwt.verify).toHaveBeenCalledWith('t', { secret: 'access-secret' });
    });

    it('falls back to JWT_SECRET when JWT_ACCESS_SECRET is absent', async () => {
      build({ JWT_SECRET: 'legacy-secret', JWT_REFRESH_SECRET: 'refresh-secret' });
      await guard.canActivate(buildContext({ headers: bearer() }));
      expect(jwt.verify).toHaveBeenCalledWith('t', { secret: 'legacy-secret' });
    });

    it('throws (no insecure fallback) when no secret is configured', async () => {
      build({});
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toThrow(
        /JWT_ACCESS_SECRET/,
      );
      expect(jwt.verify).not.toHaveBeenCalled();
    });
  });

  describe('session cache', () => {
    it('serves a cached valid session without calling Redis again', async () => {
      await guard.canActivate(buildContext({ headers: bearer() }));
      rmq.send.mockClear();
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).resolves.toBe(true);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('does not cache a negative session result (GW-13), re-checks Redis', async () => {
      rmq.send.mockResolvedValueOnce(null);
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toThrow(
        'Session expired or not found ...',
      );
      rmq.send.mockClear();
      rmq.send.mockResolvedValueOnce('{"ok":true}');
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).resolves.toBe(true);
      expect(rmq.send).toHaveBeenCalledTimes(1);
    });

    it('re-checks Redis once the 5-second cache entry expires', async () => {
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValue(1_000_000);
      await guard.canActivate(buildContext({ headers: bearer() }));
      rmq.send.mockClear();
      now.mockReturnValue(1_000_000 + 5_001);
      await guard.canActivate(buildContext({ headers: bearer() }));
      expect(rmq.send).toHaveBeenCalledTimes(1);
    });

    it('keeps a cache entry alive exactly at the 5-second boundary', async () => {
      const now = jest.spyOn(Date, 'now');
      now.mockReturnValue(1_000_000);
      await guard.canActivate(buildContext({ headers: bearer() }));
      rmq.send.mockClear();
      now.mockReturnValue(1_000_000 + 5_000);
      await guard.canActivate(buildContext({ headers: bearer() }));
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('caches sessions per user id independently', async () => {
      await guard.canActivate(buildContext({ headers: bearer() }));
      jwt.verify.mockReturnValue(access({ sub: 'user-2' }));
      rmq.send.mockClear();
      await guard.canActivate(buildContext({ headers: bearer() }));
      expect(rmq.send).toHaveBeenCalledWith('redis.exists', { key: 'session:user-2' });
    });
  });

  describe('Redis session lookup', () => {
    it('queries the session key for the authenticated user', async () => {
      await guard.canActivate(buildContext({ headers: bearer() }));
      expect(rmq.send).toHaveBeenCalledWith('redis.exists', { key: 'session:user-1' });
    });

    it('treats an empty-string session value as missing and rejects', async () => {
      rmq.send.mockResolvedValueOnce(false);
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('fails open when the RPC call throws, letting the request through', async () => {
      rmq.send.mockRejectedValueOnce(new Error('rabbit down'));
      await expect(guard.canActivate(buildContext({ headers: bearer() }))).resolves.toBe(true);
    });

    it('does not cache a fail-open result, so the next request re-checks Redis', async () => {
      rmq.send.mockRejectedValueOnce(new Error('rabbit down'));
      await guard.canActivate(buildContext({ headers: bearer() }));
      rmq.send.mockClear();
      await guard.canActivate(buildContext({ headers: bearer() }));
      expect(rmq.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authorization header parsing', () => {
    it('is case-sensitive about the Bearer scheme', async () => {
      await expect(
        guard.canActivate(buildContext({ headers: { authorization: 'bearer t' } })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a Bearer header with an empty token', async () => {
      await expect(
        guard.canActivate(buildContext({ headers: { authorization: 'Bearer ' } })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('does not verify the token when the header is absent', async () => {
      await expect(guard.canActivate(buildContext({ headers: {} }))).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwt.verify).not.toHaveBeenCalled();
    });
  });
});
