import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-facebook';

export type FacebookProfile = {
  facebookId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
};

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('FACEBOOK_APP_ID') || 'dev-missing-facebook-app-id',
      clientSecret: config.get<string>('FACEBOOK_APP_SECRET') || 'dev-missing-facebook-app-secret',
      callbackURL:
        config.get<string>('BACKEND_URL')
          ? `${config.get('BACKEND_URL')}/auth/facebook/callback`
          : 'http://localhost:8888/auth/facebook/callback',

      profileFields: ['id', 'emails', 'displayName', 'photos'],

      scope: ['email'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile): FacebookProfile {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new BadRequestException('Facebook account has no public email');
    }

    return {
      facebookId: profile.id,
      email,
      firstName: profile.name?.givenName || profile.displayName || 'Facebook',
      lastName: profile.name?.familyName || 'User',
      avatar: profile.photos?.[0]?.value,
    };
  }
}
