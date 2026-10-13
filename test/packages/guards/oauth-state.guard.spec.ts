import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  GoogleOAuthCallbackGuard,
  GoogleOAuthStartGuard,
} from 'src/packages/guards/oauth-state.guard';

/** Base class of the generated guard: its canActivate is what Passport runs after the state check. */
const PassportBase = Object.getPrototypeOf(
  Object.getPrototypeOf(GoogleOAuthCallbackGuard.prototype),
).constructor;

function ctx(req: object, res: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

function res() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

describe('GW3-05 OAuth state (anti-CSRF)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('start: sets an HttpOnly state cookie and passes the same value to Passport', () => {
    const r = res();
    const guard = new GoogleOAuthStartGuard() as unknown as {
      getAuthenticateOptions(c: ExecutionContext): { state: string };
    };
    const options = guard.getAuthenticateOptions(ctx({}, r));
    expect(options.state).toMatch(/^[0-9a-f]{64}$/);
    expect(r.cookie).toHaveBeenCalledWith(
      'oauth_state_google',
      options.state,
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/auth' }),
    );
  });

  it('callback: rejects a missing state cookie before Passport exchanges the code', async () => {
    const passport = jest.spyOn(PassportBase.prototype, 'canActivate').mockResolvedValue(true);
    const guard = new GoogleOAuthCallbackGuard();
    const r = res();
    await expect(
      guard.canActivate(ctx({ headers: {}, query: { state: 'abc', code: 'x' } }, r)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passport).not.toHaveBeenCalled();
    expect(r.clearCookie).toHaveBeenCalledWith('oauth_state_google', { path: '/auth' });
  });

  it('callback: rejects a state that does not match the cookie (login CSRF)', async () => {
    const passport = jest.spyOn(PassportBase.prototype, 'canActivate').mockResolvedValue(true);
    const guard = new GoogleOAuthCallbackGuard();
    await expect(
      guard.canActivate(
        ctx(
          { headers: { cookie: 'oauth_state_google=good' }, query: { state: 'evil', code: 'x' } },
          res(),
        ),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passport).not.toHaveBeenCalled();
  });

  it('callback: hands off to Passport when the state matches', async () => {
    const passport = jest.spyOn(PassportBase.prototype, 'canActivate').mockResolvedValue(true);
    const guard = new GoogleOAuthCallbackGuard();
    await expect(
      guard.canActivate(
        ctx(
          {
            headers: { cookie: 'theme=dark; oauth_state_google=same' },
            query: { state: 'same', code: 'x' },
          },
          res(),
        ),
      ),
    ).resolves.toBe(true);
    expect(passport).toHaveBeenCalledTimes(1);
  });
});
