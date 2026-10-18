import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from 'src/features/auth/auth.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';
import { readRefreshCookie } from 'src/packages/helpers/refresh-cookie.helper';

function setup() {
  const send = jest.fn();
  const rmq = { send } as unknown as RmqProducer;
  const values: Record<string, string> = {
    JWT_ACCESS_SECRET: 'a',
    JWT_REFRESH_SECRET: 'r',
    JWT_REFRESH_EXPIRES_SECONDS: '600',
  };
  const config = { get: jest.fn((k: string) => values[k]) } as unknown as ConfigService;
  const res = { cookie: jest.fn(), clearCookie: jest.fn() };
  return {
    send,
    res,
    controller: new AuthController(rmq, config),
    res_: res as unknown as Response,
  };
}

describe('AuthController sessions (refresh cookie, logout)', () => {
  it('login sets the refresh token as an httpOnly cookie and omits it from the body', async () => {
    const { send, res, res_, controller } = setup();
    send.mockResolvedValue({ accessToken: 'AT', refreshToken: 'RT', user: { id: 'u' } });
    const body = await controller.login({ email: 'a@b.c', password: 'x' }, res_);
    expect(send).toHaveBeenCalledWith('auth.login', { email: 'a@b.c', password: 'x' });
    expect(body).toEqual({ accessToken: 'AT', user: { id: 'u' } });
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'RT',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/auth', maxAge: 600_000 }),
    );
  });

  it('refresh reads the cookie (no body), rotates it and returns only the access token', async () => {
    const { send, res, res_, controller } = setup();
    send.mockResolvedValue({ accessToken: 'AT2', refreshToken: 'RT2' });
    const req = { headers: { cookie: 'other=1; refresh_token=RT1' } } as unknown as Request;
    const body = await controller.refresh(req, res_);
    expect(send).toHaveBeenCalledWith('auth.refresh', { refreshToken: 'RT1' });
    expect(body).toEqual({ accessToken: 'AT2' });
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'RT2', expect.any(Object));
  });

  it('refresh without the cookie is 401 and never calls the user service', async () => {
    const { send, res_, controller } = setup();
    await expect(
      controller.refresh({ headers: {} } as unknown as Request, res_),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(send).not.toHaveBeenCalled();
  });

  it('logout revokes only the caller session (userId + sid) and clears the cookie', async () => {
    const { send, res, res_, controller } = setup();
    send.mockResolvedValue({ message: 'Logged out' });
    const result = await controller.logout(
      { id: 'u1', email: 'e', typ: 'access', role: 'TUTOR', sid: 's1' },
      res_,
    );
    expect(send).toHaveBeenCalledWith('auth.logout', { userId: 'u1', sid: 's1' });
    expect(result).toEqual({ message: 'Logged out' });
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ path: '/auth' }),
    );
  });
});

describe('readRefreshCookie', () => {
  it('returns undefined for missing or empty values', () => {
    expect(readRefreshCookie({ headers: {} } as unknown as Request)).toBeUndefined();
    expect(
      readRefreshCookie({ headers: { cookie: 'refresh_token=' } } as unknown as Request),
    ).toBeUndefined();
  });
});
