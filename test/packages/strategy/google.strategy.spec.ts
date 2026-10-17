import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from 'src/packages/strategy/google.strategy';

function makeStrategy() {
  const config = {
    get: jest.fn((key: string) =>
      ({ GOOGLE_CLIENT_ID: 'client-id', GOOGLE_CLIENT_SECRET: 'client-secret' })[key],
    ),
  } as unknown as ConfigService;
  return new GoogleStrategy(config);
}

function profile(extra: Record<string, unknown> = {}) {
  return {
    id: 'g-123',
    displayName: 'Ada Lovelace',
    name: { givenName: 'Ada', familyName: 'Lovelace' },
    emails: [{ value: 'ada@example.com' }],
    photos: [{ value: 'https://img.example.com/ada.png' }],
    ...extra,
  } as never;
}

describe('GoogleStrategy.validate', () => {
  it('accepts the profile when Google reports email_verified === true', () => {
    const result = makeStrategy().validate(
      'at',
      'rt',
      profile({ _json: { email_verified: true } }),
    );

    expect(result).toEqual({
      googleId: 'g-123',
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      avatar: 'https://img.example.com/ada.png',
    });
  });

  it.each([
    ['email_verified is false', { _json: { email_verified: false } }],
    ['email_verified is absent', { _json: {} }],
    ['_json is missing entirely', {}],
    ['email_verified is the string "true"', { _json: { email_verified: 'true' } }],
    ['email_verified is null', { _json: { email_verified: null } }],
  ])('rejects when %s', (_label, extra) => {
    expect(() => makeStrategy().validate('at', 'rt', profile(extra))).toThrow(
      new BadRequestException('Google account email is not verified'),
    );
  });

  it('rejects a profile with no email before checking verification', () => {
    expect(() =>
      makeStrategy().validate(
        'at',
        'rt',
        profile({ emails: [], _json: { email_verified: true } }),
      ),
    ).toThrow(new BadRequestException('Google account has no public email'));
  });

  it('refuses to construct without GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET', () => {
    const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;
    expect(() => new GoogleStrategy(config)).toThrow(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set',
    );
  });
});
