import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';

export type GoogleProfile = {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
};

/**
 * Fails at boot when the Google OAuth client is not configured. No placeholder credentials:
 * a silent fallback would only surface later as an opaque provider error.
 */
function googleOptions(configService: ConfigService) {
  const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
  const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
  if (!clientID || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set');
  }
  return {
    clientID,
    clientSecret,
    callbackURL:
      configService.get<string>('GOOGLE_CALLBACK_URL') ||
      'http://localhost:8888/auth/google/callback',
    scope: ['email', 'profile'],
  };
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super(googleOptions(configService));
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): GoogleProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new BadRequestException('Google account has no public email');
    }
    // Fail closed: only an explicit `true` lets the email be used to link or create an account.
    const raw = (profile as Profile & { _json?: { email_verified?: boolean } })._json;
    if (raw?.email_verified !== true) {
      throw new BadRequestException('Google account email is not verified');
    }

    return {
      googleId: profile.id,
      email,
      firstName: profile.name?.givenName || profile.displayName || 'Google',
      lastName: profile.name?.familyName || 'User',
      avatar: profile.photos?.[0]?.value,
    };
  }
}
