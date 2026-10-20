import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiBearerAuth,
  ApiResponse as SwaggerResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { StatusCodes } from 'http-status-codes';
import type { Request, Response } from 'express';
import {
  forgotPasswordSchema,
  loginSchema,
  loginByUserCodeSchema,
  type RegisterDto,
  RegisterResponseDto,
  registerSchema,
  type ForgotPasswordDto,
  type ForgotPasswordResponseDto,
  type LoginByUserCodeDto,
  type LoginDto,
  type LoginResponseDto,
  type RefreshTokenBodyDto,
  resetPasswordSchema,
  type ResetPasswordDto,
  ResetPasswordResponseDto,
  type VerifyEmailDto,
  type VerifyEmailResponseDto,
  verifyEmailSchema,
} from '@packages/entities/auth';
import { ApiResponse, CurrentUser, Public } from '@packages/decorators';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from '@packages/helpers/refresh-cookie.helper';
import { ZodValidationPipe } from '@packages/pipes';
import type { FacebookProfile, GoogleProfile } from '@packages/strategy';
import {
  FacebookOAuthCallbackGuard,
  FacebookOAuthStartGuard,
  GoogleOAuthCallbackGuard,
  GoogleOAuthStartGuard,
} from '@packages/guards/oauth-state.guard';
import { RmqProducer } from '../rabbitmq/rmq.producer';

type RequestWithGoogleProfile = Request & { user: GoogleProfile };
type RequestWithFacebookProfile = Request & { user: FacebookProfile };

/** Login/refresh bodies never carry the refresh token: it is set as an httpOnly cookie instead. */
type LoginSessionResponse = Omit<LoginResponseDto, 'refreshToken'>;
type RefreshSessionResponse = { accessToken: string };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly rmqProducer: RmqProducer,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('register')
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Create a new user account with email and password',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password', 'firstName', 'lastName'],
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
        username: { type: 'string', maxLength: 50, example: 'johndoe' },
        password: { type: 'string', minLength: 8, maxLength: 100, example: 'Password123!' },
        firstName: { type: 'string', minLength: 1, maxLength: 25, example: 'John' },
        lastName: { type: 'string', minLength: 1, maxLength: 25, example: 'Doe' },
      },
    },
  })
  @SwaggerResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ statusCode: StatusCodes.CREATED, message: 'Registration successful' })
  register(
    @Body(new ZodValidationPipe<RegisterDto>(registerSchema))
    registerDto: RegisterDto,
  ): Promise<RegisterResponseDto> {
    return this.rmqProducer.send('auth.register', registerDto);
  }

  @Public()
  @Throttle({ short: { limit: 50, ttl: 60000 } })
  @Post('login')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Login with email',
    description: 'Authenticate using email and password',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', example: 'dang04223@gmail.com' },
        // Login does not re-check password strength (see loginPasswordFieldSchema).
        password: { type: 'string', minLength: 1, example: 'Admin@123456' },
      },
    },
  })
  @SwaggerResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            userCode: { type: 'string', nullable: true },
            username: { type: 'string' },
          },
        },
      },
    },
  })
  @SwaggerResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ statusCode: StatusCodes.OK, message: 'Login successful' })
  async login(
    @Body(new ZodValidationPipe<LoginDto>(loginSchema))
    loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginSessionResponse> {
    const { refreshToken, ...body } = await this.rmqProducer.send<LoginResponseDto, LoginDto>(
      'auth.login',
      loginDto,
    );
    setRefreshCookie(res, refreshToken, this.configService);
    return body;
  }

  @Public()
  // A class of students shares one NAT IP; @Throttle only overrides the buckets it names, so all
  // three are raised (otherwise the global medium 20/10s and long 100/min still apply).
  @Throttle({
    short: { limit: 50, ttl: 60000 },
    medium: { limit: 50, ttl: 60000 },
    long: { limit: 50, ttl: 60000 },
  })
  @Post('login/user-code')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Login with user code',
    description: 'Authenticate using user code and role',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userCode', 'password', 'role'],
      properties: {
        userCode: { type: 'string', maxLength: 6, example: 'ABC123' },
        password: { type: 'string', minLength: 6, maxLength: 25, example: 'Password123!' },
        role: { type: 'string', enum: ['PARENT', 'STUDENT'], example: 'STUDENT' },
      },
    },
  })
  @SwaggerResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            userCode: { type: 'string', nullable: true },
            username: { type: 'string' },
          },
        },
      },
    },
  })
  @SwaggerResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ statusCode: StatusCodes.OK, message: 'Login successful' })
  async loginByUserCode(
    @Body(new ZodValidationPipe<LoginByUserCodeDto>(loginByUserCodeSchema))
    dto: LoginByUserCodeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginSessionResponse> {
    const { refreshToken, ...body } = await this.rmqProducer.send<
      LoginResponseDto,
      LoginByUserCodeDto
    >('auth.loginByUserCode', dto);
    setRefreshCookie(res, refreshToken, this.configService);
    return body;
  }

  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Refresh tokens',
    description:
      'Rotate the refresh token. The refresh token is read from the httpOnly cookie `refresh_token` (no body); a new cookie is set and a new access token is returned.',
  })
  @SwaggerResponse({ status: 200, description: 'Token refreshed successfully' })
  @SwaggerResponse({ status: 401, description: 'Missing, invalid or expired refresh cookie' })
  @ApiResponse({ statusCode: StatusCodes.OK, message: 'Token refreshed' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshSessionResponse> {
    const refreshToken = readRefreshCookie(req);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing ...');
    }
    const result = await this.rmqProducer.send<LoginResponseDto, RefreshTokenBodyDto>(
      'auth.refresh',
      { refreshToken },
    );
    setRefreshCookie(res, result.refreshToken, this.configService);
    return { accessToken: result.accessToken };
  }

  @HttpCode(StatusCodes.OK)
  @Post('logout')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Logout',
    description:
      'Revoke the current login session (this device only) and clear the refresh cookie. Other devices stay signed in.',
  })
  @SwaggerResponse({ status: 200, description: 'Logged out' })
  async logout(
    @CurrentUser() user: JwtGuardUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const result = await this.rmqProducer.send<
      { message: string },
      { userId: string; sid: string }
    >('auth.logout', { userId: user.id, sid: user.sid });
    clearRefreshCookie(res);
    return result;
  }

  @Public()
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ summary: 'Forgot password', description: 'Request a password reset email' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
      },
    },
  })
  @SwaggerResponse({ status: 200, description: 'Reset link sent (or logged to console in dev)' })
  @ApiResponse({ statusCode: StatusCodes.OK, message: 'Forgot password successful' })
  forgotPassword(
    @Body(new ZodValidationPipe<ForgotPasswordDto>(forgotPasswordSchema))
    forgotPasswordDto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponseDto> {
    return this.rmqProducer.send('auth.forgotPassword', forgotPasswordDto);
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('/reset-password')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Reset password',
    description: 'Reset password using the token from the reset email',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['jti', 'password', 'confirmPassword'],
      properties: {
        jti: {
          type: 'string',
          format: 'uuid',
          description: 'Reset token (JWT ID) from the reset email',
        },
        password: { type: 'string', minLength: 6, maxLength: 25, example: 'NewPass123!' },
        newPassword: {
          type: 'string',
          minLength: 6,
          maxLength: 25,
          description: 'Alias for password',
        },
        confirmPassword: { type: 'string', minLength: 6, maxLength: 25, example: 'NewPass123!' },
      },
    },
  })
  @SwaggerResponse({ status: 200, description: 'Password reset successful' })
  @SwaggerResponse({ status: 422, description: 'Validation failed or token invalid' })
  @ApiResponse({ statusCode: StatusCodes.OK, message: 'Reset password successful' })
  resetPassword(
    @Body(new ZodValidationPipe<ResetPasswordDto>(resetPasswordSchema))
    resetPasswordDto: ResetPasswordDto,
  ): Promise<ResetPasswordResponseDto> {
    return this.rmqProducer.send('auth.resetPassword', resetPasswordDto);
  }

  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('verify-email')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    summary: 'Verify email',
    description: 'Mark the account email as verified using the token from the verification email',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['jti'],
      properties: {
        jti: {
          type: 'string',
          format: 'uuid',
          description: 'Verification token (JWT ID) from the verification email',
        },
      },
    },
  })
  @SwaggerResponse({ status: 200, description: 'Email verified' })
  @SwaggerResponse({ status: 422, description: 'Validation failed or token invalid' })
  @ApiResponse({ statusCode: StatusCodes.OK, message: 'Email verified successfully' })
  verifyEmail(
    @Body(new ZodValidationPipe<VerifyEmailDto>(verifyEmailSchema))
    verifyEmailDto: VerifyEmailDto,
  ): Promise<VerifyEmailResponseDto> {
    return this.rmqProducer.send('auth.verifyEmail', verifyEmailDto);
  }

  @Public()
  @Get('google')
  @UseGuards(GoogleOAuthStartGuard)
  @ApiOperation({
    summary: 'Google OAuth login',
    description: 'Redirect to Google consent screen for authentication',
  })
  @SwaggerResponse({ status: 302, description: 'Redirects to Google' })
  googleAuth(): void {
    // Guard redirects to Google's consent screen; no body to return.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleOAuthCallbackGuard)
  @ApiOperation({
    summary: 'Google OAuth callback',
    description: 'Handle Google OAuth callback and return JWT tokens',
  })
  @SwaggerResponse({
    status: 302,
    description:
      'Redirects to the frontend with the access token in the URL fragment (#accessToken=...). The refresh token is set as an httpOnly cookie.',
  })
  async googleAuthCallback(
    @Req() req: RequestWithGoogleProfile,
    @Res() res: Response,
  ): Promise<void> {
    const { accessToken, refreshToken } = await this.rmqProducer.send<
      LoginResponseDto,
      GoogleProfile
    >('auth.googleLogin', req.user);

    const redirectBase =
      this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URL') ??
      'http://localhost:3000/oauth/callback';
    // Refresh token never travels in the URL: it is set as an httpOnly cookie on this response.
    setRefreshCookie(res, refreshToken, this.configService);
    const redirectUrl = new URL(redirectBase);
    redirectUrl.hash = new URLSearchParams({ accessToken }).toString();

    res.redirect(redirectUrl.toString());
  }

  // GET /auth/facebook
  @Public()
  @Get('facebook')
  @UseGuards(FacebookOAuthStartGuard)
  @ApiOperation({
    summary: 'Facebook OAuth login',
    description: 'Redirect to Facebook consent screen for authentication',
  })
  @SwaggerResponse({ status: 302, description: 'Redirects to Facebook' })
  facebookAuth(): void {
    // Guard redirects to Facebook's consent screen; no body to return.
  }

  // GET /auth/facebook/callback
  @Public()
  @Get('facebook/callback')
  @UseGuards(FacebookOAuthCallbackGuard)
  @ApiOperation({
    summary: 'Facebook OAuth callback',
    description: 'Handle Facebook OAuth callback and return JWT tokens',
  })
  @SwaggerResponse({
    status: 302,
    description:
      'Redirects to the frontend with the access token in the URL fragment (#accessToken=...). The refresh token is set as an httpOnly cookie.',
  })
  async facebookAuthCallback(
    @Req() req: RequestWithFacebookProfile,
    @Res() res: Response,
  ): Promise<void> {
    const { accessToken, refreshToken } = await this.rmqProducer.send<
      LoginResponseDto,
      FacebookProfile
    >('auth.facebookLogin', req.user);

    const redirectBase =
      this.configService.get<string>('FACEBOOK_OAUTH_REDIRECT_URL') ??
      this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URL') ??
      'http://localhost:3000/oauth/callback';
    // Refresh token never travels in the URL: it is set as an httpOnly cookie on this response.
    setRefreshCookie(res, refreshToken, this.configService);
    const redirectUrl = new URL(redirectBase);
    redirectUrl.hash = new URLSearchParams({ accessToken }).toString();

    res.redirect(redirectUrl.toString());
  }
}
