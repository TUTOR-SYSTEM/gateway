import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, Observable, throwError } from 'rxjs';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorInterceptor.name);

  private resolveClientMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null) {
      const e = error as Record<string, unknown>;
      const pgCode = (e.code ?? (e.cause as Record<string, unknown> | undefined)?.code) as
        string | undefined;
      switch (pgCode) {
        case '23503':
          return 'Referenced record not found (foreign key violation)';
        case '23505':
          return 'Record already exists (duplicate value)';
        case '23502':
          return 'Required field is missing (not-null violation)';
        case '23514':
          return 'Value violates check constraint';
      }
    }
    // Anything else (TypeError, driver text, etc.) stays server-side; the original message is
    // still logged and kept on `originalError`, which the HTTP filter does not send to clients.
    const message = error instanceof Error ? error.message : '';
    return message.startsWith('Failed query:') ? 'DATABASE_ERROR' : 'INTERNAL_SERVER_ERROR';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException) {
          return throwError(() => error);
        }

        const isError = error instanceof Error;
        const originalMessage = isError ? error.message : 'Internal server error';
        const originalStack = isError ? error.stack : undefined;

        this.logger.error(`[ERROR-INTERCEPTOR] ${originalMessage}`, originalStack);

        const clientMessage = this.resolveClientMessage(error);
        const exception = new InternalServerErrorException({
          message: clientMessage,
          originalError: originalMessage,
          timestamp: new Date().toISOString(),
        });
        if (originalStack) exception.stack = originalStack;

        return throwError(() => exception);
      }),
    );
  }
}
