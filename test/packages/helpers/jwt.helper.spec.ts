import { signAccessToken, signRefreshToken, type JwtTokensConfig } from 'src/packages/helpers/jwt.helper';

const config: JwtTokensConfig = {
  accessSecret: 'access-secret',
  accessExpiresIn: 100,
  refreshSecret: 'refresh-secret',
  refreshExpiresIn: 200,
};

describe('jwt.helper', () => {
  it('signs an access token with the access secret, TTL, and typ=access', async () => {
    const signAsync = jest.fn().mockResolvedValue('signed-access');
    const token = await signAccessToken(
      { signAsync },
      { sub: 'u1', email: 'a@b.c', role: 'ADMIN' },
      config,
    );
    expect(token).toBe('signed-access');
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'u1', email: 'a@b.c', role: 'ADMIN', typ: 'access' },
      { secret: 'access-secret', expiresIn: 100 },
    );
  });

  it('signs a refresh token with the refresh secret, TTL, and typ=refresh', async () => {
    const signAsync = jest.fn().mockResolvedValue('signed-refresh');
    const token = await signRefreshToken(
      { signAsync },
      { sub: 'u1', email: 'a@b.c' },
      config,
    );
    expect(token).toBe('signed-refresh');
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'u1', email: 'a@b.c', typ: 'refresh' },
      { secret: 'refresh-secret', expiresIn: 200 },
    );
  });

  it('does not leak the role into refresh tokens', async () => {
    const signAsync = jest.fn().mockResolvedValue('t');
    await signRefreshToken({ signAsync }, { sub: 'u1', email: 'e' }, config);
    const [body] = signAsync.mock.calls[0] as [Record<string, unknown>];
    expect(body).not.toHaveProperty('role');
  });
});
