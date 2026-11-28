import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Returns the localizable code instead of the library's English "Too Many Requests", so
 * `HttpExceptionFilter` can translate it like every other error (`request.language`).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  /**
   * Authenticated routes are counted per user, so students behind one NAT do not share a bucket.
   * `req.user` is set only after JwtAuthGuard verified the token (AppModule's guards run before
   * ThrottleModule's). Unauthenticated requests (login, register, ...) stay keyed by IP.
   */
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as { user?: { id?: unknown } }).user;
    if (typeof user?.id === 'string' && user.id.length > 0) return `user:${user.id}`;
    return super.getTracker(req);
  }

  protected async getErrorMessage(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<string> {
    return 'TOO_MANY_REQUESTS';
  }
}
