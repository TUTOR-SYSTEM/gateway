import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap, finalize } from 'rxjs';
import { getRequestContext } from '@packages/context/request-context';
import { emitRequestLog } from '@packages/context/log-sink';
import type { JwtGuardUser } from '@packages/guards/jwt-auth.guard';

type RequestWithUser = Request & { user?: JwtGuardUser };

const SENSITIVE_KEYS = [
  'password',
  'newPassword',
  'oldPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
];
const MAX_LOG_LENGTH = 1000;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        SENSITIVE_KEYS.includes(key) ? '[REDACTED]' : redact(val),
      ]),
    );
  }
  return value;
}

function stringifyForLog(value: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(redact(value));
  } catch {
    return '[Unserializable]';
  }
  if (json === undefined) return 'undefined';
  return json.length > MAX_LOG_LENGTH ? `${json.slice(0, MAX_LOG_LENGTH)}…(truncated)` : json;
}

/**
 * Best-effort, redacted+truncated preview of the FULL error payload — never throws. Reads
 * `HttpException.getResponse()` (the same body `HttpExceptionFilter` sends to the client), so
 * `responseBody` is populated on failure the same way it is on success instead of `NULL`.
 */
function previewError(err: unknown): string {
  let payload: unknown;
  if (
    err &&
    typeof err === 'object' &&
    typeof (err as { getResponse?: unknown }).getResponse === 'function'
  ) {
    const response = (err as { getResponse: () => unknown }).getResponse();
    const status =
      typeof (err as { getStatus?: unknown }).getStatus === 'function'
        ? (err as { getStatus: () => number }).getStatus()
        : undefined;
    payload =
      response !== null && typeof response === 'object'
        ? { statusCode: status, ...(response as Record<string, unknown>) }
        : { statusCode: status, message: response };
  } else if (err instanceof Error) {
    payload = { name: err.name, message: err.message };
  } else {
    payload = err;
  }
  return stringifyForLog(payload);
}

@Injectable()
export class LoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggerInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const response = http.getResponse<Response>();

    const { method, url } = request;
    const body: unknown = request.body;
    const startTime = Date.now();
    const ctx = getRequestContext();
    const trace = ctx ? `correlationId=${ctx.correlationId} traceId=${ctx.traceId} ` : '';
    const requestBody =
      body && typeof body === 'object' && Object.keys(body).length > 0
        ? stringifyForLog(body)
        : undefined;
    let errorMessage: string | undefined;
    let responseBody: string | undefined;

    if (requestBody) {
      this.logger.log(`[Request] ${trace}${method} ${url} - body=${requestBody}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          responseBody = stringifyForLog(data);
          this.logger.log(
            `[Response] ${trace}${method} ${url} - ${response.statusCode} - data=${responseBody}`,
          );
        },
        error: (err) => {
          errorMessage = (err as Error).message;
          responseBody = previewError(err);
          this.logger.error(`[Error] ${trace}${method} ${url} - ${errorMessage}`);
        },
      }),

      finalize(() => {
        const duration = Date.now() - startTime;
        this.logger.log(`[Timing] ${trace}${method} ${url} - ${duration}ms`);
        emitRequestLog({
          serviceName: 'gateway',
          type: 'HTTP',
          method,
          path: url,
          statusCode: response.statusCode,
          durationMs: duration,
          correlationId: ctx?.correlationId ?? 'unknown',
          traceId: ctx?.traceId ?? 'unknown',
          parentTraceId: ctx?.parentTraceId,
          userId: request.user?.id,
          ip: request.ip,
          requestBody,
          responseBody,
          errorMessage,
        });
      }),
    );
  }
}
