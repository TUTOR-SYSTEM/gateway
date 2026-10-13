import type { ConfigService } from '@nestjs/config';
import { getJwtTokensConfig } from '@packages/configs/jwt-sign.config';

const cfg = (v: Record<string, string | undefined>) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

describe('getJwtTokensConfig (GW-14)', () => {
  it('throws when the access secret is missing', () => {
    expect(() => getJwtTokensConfig(cfg({ JWT_REFRESH_SECRET: 'r' }))).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when the refresh secret is missing', () => {
    expect(() => getJwtTokensConfig(cfg({ JWT_ACCESS_SECRET: 'a' }))).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('returns secrets, accepting legacy JWT_SECRET for access', () => {
    expect(getJwtTokensConfig(cfg({ JWT_SECRET: 'legacy', JWT_REFRESH_SECRET: 'r' }))).toMatchObject({
      accessSecret: 'legacy',
      refreshSecret: 'r',
    });
  });
});
