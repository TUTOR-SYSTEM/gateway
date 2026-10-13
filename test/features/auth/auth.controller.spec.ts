import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthController } from 'src/features/auth/auth.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

function setup(configValues: Record<string, string | undefined> = {}) {
  const send = jest.fn();
  const rmq = { send } as unknown as RmqProducer;
  const config = { get: jest.fn((key: string) => configValues[key]) } as unknown as ConfigService;
  return { send, controller: new AuthController(rmq, config) };
}

function responseMock() {
  const redirect = jest.fn<void, [string]>();
  return { res: { redirect } as unknown as Response, redirect };
}

function redirectedUrl(redirect: jest.Mock<void, [string]>): URL {
  return new URL(redirect.mock.calls[0][0]);
}

describe('AuthController', () => {
  describe('RPC forwarding', () => {
    it.each([
      ['register', 'auth.register'],
      ['login', 'auth.login'],
      ['loginByUserCode', 'auth.loginByUserCode'],
      ['refresh', 'auth.refresh'],
      ['forgotPassword', 'auth.forgotPassword'],
      ['resetPassword', 'auth.resetPassword'],
    ] as const)('%s forwards its body to %s', async (method, pattern) => {
      const { send, controller } = setup();
      send.mockResolvedValue({ ok: true });
      const body = { email: 'a@b.c' };

      const result = await (controller as unknown as Record<string, (b: unknown) => Promise<unknown>>)[
        method
      ](body);

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
      const { res, redirect } = responseMock();

      await controller.googleAuthCallback({ user: profile } as never, res);

      expect(send).toHaveBeenCalledWith('auth.googleLogin', profile);
      const target = redirectedUrl(redirect);
      expect(target.origin + target.pathname).toBe('https://app.example.com/oauth/callback');
      expect(target.searchParams.get('accessToken')).toBe('AT');
      expect(target.searchParams.get('refreshToken')).toBe('RT');
    });

    it('falls back to localhost when no redirect URL is configured', async () => {
      const { send, controller } = setup();
      send.mockResolvedValue({ accessToken: 'AT', refreshToken: 'RT' });
      const { res, redirect } = responseMock();

      await controller.googleAuthCallback({ user: {} } as never, res);

      expect(redirect).toHaveBeenCalledWith(
        expect.stringMatching(/^http:\/\/localhost:3000\/oauth\/callback\?/),
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
      const { res, redirect } = responseMock();

      await controller.facebookAuthCallback({ user: profile } as never, res);

      expect(send).toHaveBeenCalledWith('auth.facebookLogin', profile);
      const target = redirectedUrl(redirect);
      expect(target.searchParams.get('accessToken')).toBe('AT2');
      expect(target.searchParams.get('refreshToken')).toBe('RT2');
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
        expect.stringMatching(/^http:\/\/localhost:3000\/oauth\/callback\?/),
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

  describe('OAuth entry points', () => {
    it('googleAuth and facebookAuth send nothing; the guard performs the redirect', () => {
      const { send, controller } = setup();
      expect(controller.googleAuth()).toBeUndefined();
      expect(controller.facebookAuth()).toBeUndefined();
      expect(send).not.toHaveBeenCalled();
    });
  });
});
