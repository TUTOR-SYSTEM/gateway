import { Injectable } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Returns the localizable code instead of the library's English "Too Many Requests", so
 * `HttpExceptionFilter` can translate it like every other error (`request.language`).
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getErrorMessage(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<string> {
    return 'TOO_MANY_REQUESTS';
  }
}
