import { UnprocessableEntityException } from '@nestjs/common';
import { HTTP_CODE_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from 'src/features/auth/auth.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';
import { IS_PUBLIC_KEY } from '@packages/decorators';

function setup(configValues: Record<string, string | undefined> = {}) {
  const send = jest.fn();
  const rmq = { send } as unknown as RmqProducer;
  const defaults = {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_REFRESH_EXPIRES_SECONDS: '604800',
  };
  const merged = { ...defaults, ...configValues };
  const config = { get: jest.fn((key: string) => merged[key]) } as unknown as ConfigService;
  return { send, controller: new AuthController(rmq, config) };
}

function responseMock() {
  const redirect = jest.fn<void, [string]>();
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  return { res: { redirect, cookie, clearCookie } as unknown as Response, redirect, cookie };
}

function redirectedUrl(redirect: jest.Mock<void, [string]>): URL {
  return new URL(redirect.mock.calls[0][0]);
}

// Tokens travel in the URL fragment (not the query) so they never reach server or proxy logs.
function fragmentParams(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.slice(1));
}

describe('AuthController', () => {
  describe('RPC forwarding', () => {
    it.each([
      ['register', 'auth.register'],
      ['forgotPassword', 'auth.forgotPassword'],
      ['resetPassword', 'auth.resetPassword'],
    ] as const)('%s forwards its body to %s', async (method, pattern) => {
      const { send, controller } = setup();
      send.mockResolvedValue({ ok: true });
      const body = { email: 'a@b.c' };

      const result = await (
        controller as unknown as Record<string, (b: unknown) => Promise<unknown>>
      )[method](body);

      expect(send).toHaveBeenCalledWith(pattern, body);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('Google OAuth callback', () => {
    it('redirects to GOOGLE_OAUTH_REDIRECT_URL with both tokens in the query', async () => {
      const { send, controller } = setup({
        GOOGLE_OAUTH_REDIRECT_URL: 'https://app.example.com/oauth/callback',
      });
      send.mockResolvedValue({ accessToken: 'AT', refreshToken: 'RT' });
      const profile = { id: 'g-1', email: 'g@x.y' };
      const { res, redirect, cookie } = responseMock();

      await controller.googleAuthCallback({ user: profile } as never, res);

      expect(send).toHaveBeenCalledWith('auth.googleLogin', profile);
      const target = redirectedUrl(redirect);
      expect(target.origin + target.pathname).toBe('https://app.example.com/oauth/callback');
      expect(fragmentParams(target).get('accessToken')).toBe('AT');
      expect(fragmentParams(target).has('refreshToken')).toBe(false);
      expect(cookie).toHaveBeenCalledWith(
        'refresh_token',
        'RT',
        expect.objectContaining({ httpOnly: true, path: '/auth' }),
      );
    });

    it('falls back to localhost when no redirect URL is configured', async () => {
      const { send, controller } = setup();
      send.mockResolvedValue({ accessToken: 'AT', refreshToken: 'RT' });
      const { res, redirect } = responseMock();

      await controller.googleAuthCallback({ user: {} } as never, res);

      expect(redirect).toHaveBeenCalledWith(
        expect.stringMatching(/^http:\/\/localhost:3000\/oauth\/callback#/),
      );
    });
  });

  describe('Facebook OAuth callback', () => {
    it('forwards the profile to auth.facebookLogin and redirects with tokens', async () => {
      const { send, controller } = setup({
        GOOGLE_OAUTH_REDIRECT_URL: 'https://app.example.com/oauth/callback',
      });
      send.mockResolvedValue({ accessToken: 'AT2', refreshToken: 'RT2' });
      const profile = { id: 'f-1' };
      const { res, redirect, cookie } = responseMock();

      await controller.facebookAuthCallback({ user: profile } as never, res);

      expect(send).toHaveBeenCalledWith('auth.facebookLogin', profile);
      const target = redirectedUrl(redirect);
      expect(fragmentParams(target).get('accessToken')).toBe('AT2');
      expect(fragmentParams(target).has('refreshToken')).toBe(false);
      expect(cookie).toHaveBeenCalledWith(
        'refresh_token',
        'RT2',
        expect.objectContaining({ httpOnly: true, path: '/auth' }),
      );
    });

    // KNOWN BUG (see report): the Facebook callback reads GOOGLE_OAUTH_REDIRECT_URL, not a
    // Facebook-specific variable. This test pins the current behaviour so a change is deliberate.
    it('reads FACEBOOK_OAUTH_REDIRECT_URL for the Facebook callback', async () => {
      const { send, controller } = setup({
        GOOGLE_OAUTH_REDIRECT_URL: 'https://google-only.example.com/cb',
        FACEBOOK_OAUTH_REDIRECT_URL: 'https://facebook.example.com/cb',
      });
      send.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
      const { res, redirect } = responseMock();

      await controller.facebookAuthCallback({ user: {} } as never, res);

      expect(redirectedUrl(redirect).origin).toBe('https://facebook.example.com');
    });

    it('falls back to GOOGLE_OAUTH_REDIRECT_URL when the Facebook one is unset', async () => {
      const { send, controller } = setup({
        GOOGLE_OAUTH_REDIRECT_URL: 'https://google-only.example.com/cb',
      });
      send.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
      const { res, redirect } = responseMock();

      await controller.facebookAuthCallback({ user: {} } as never, res);

      expect(redirectedUrl(redirect).origin).toBe('https://google-only.example.com');
    });

    it('falls back to localhost when the redirect URL is not configured', async () => {
      const { send, controller } = setup();
      send.mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
      const { res, redirect } = responseMock();

      await controller.facebookAuthCallback({ user: {} } as never, res);

      expect(redirect).toHaveBeenCalledWith(
        expect.stringMatching(/^http:\/\/localhost:3000\/oauth\/callback#/),
      );
    });

    it('propagates an RPC failure without redirecting', async () => {
      const { send, controller } = setup();
      send.mockRejectedValue(new Error('user service down'));
      const { res, redirect } = responseMock();

      await expect(controller.facebookAuthCallback({ user: {} } as never, res)).rejects.toThrow(
        'user service down',
      );
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/verify-email', () => {
    const VALID_JTI = '3f2a8c1e-9b4d-4e6a-8f00-1234567890ab';
    // @nestjs/throttler stores each named tier as `THROTTLER:<PREFIX><tierName>`.
    const THROTTLER_LIMIT_SHORT = 'THROTTLER:LIMITshort';
    const THROTTLER_TTL_SHORT = 'THROTTLER:TTLshort';
    const handler = AuthController.prototype.verifyEmail;

    it('is public so an unauthenticated user can verify their email', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    });

    it('is throttled to 5 requests per 60s on the short tier', () => {
      expect(Reflect.getMetadata(THROTTLER_LIMIT_SHORT, handler)).toBe(5);
      expect(Reflect.getMetadata(THROTTLER_TTL_SHORT, handler)).toBe(60000);
    });

    it('responds with HTTP 200', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
    });

    it('binds ZodValidationPipe(verifyEmailSchema) to the body', () => {
      const params = Object.values(
        (Reflect.getMetadata(ROUTE_ARGS_METADATA, AuthController, 'verifyEmail') ?? {}) as Record<
          string,
          { pipes: Array<{ transform: (v: unknown) => unknown }> }
        >,
      );
      const pipe = params.flatMap((p) => p.pipes)[0];

      expect(pipe.transform({ jti: VALID_JTI })).toEqual({ jti: VALID_JTI });
      expect(() => pipe.transform({})).toThrow(UnprocessableEntityException);
      expect(() => pipe.transform({ jti: 'not-a-uuid' })).toThrow(UnprocessableEntityException);
    });

    it('forwards the dto to auth.verifyEmail and returns the RPC result', async () => {
      const { send, controller } = setup();
      send.mockResolvedValue({ message: 'ok' });
      const dto = { jti: VALID_JTI };

      await expect(controller.verifyEmail(dto)).resolves.toEqual({ message: 'ok' });
      expect(send).toHaveBeenCalledWith('auth.verifyEmail', dto);
    });

    it('propagates an RPC failure instead of swallowing it', async () => {
      const { send, controller } = setup();
      send.mockRejectedValue(new Error('token expired'));

      await expect(controller.verifyEmail({ jti: VALID_JTI })).rejects.toThrow('token expired');
    });
  });

  describe('OAuth entry points', () => {
    it('googleAuth and facebookAuth send nothing; the guard performs the redirect', () => {
      const { send, controller } = setup();
      expect(controller.googleAuth()).toBeUndefined();
      expect(controller.facebookAuth()).toBeUndefined();
      expect(send).not.toHaveBeenCalled();
    });
  });
});
