import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { LoggerInterceptor } from 'src/packages/interceptor/logger.interceptor';
import { emitRequestLog, type RequestLogEntry } from '@packages/context/log-sink';

jest.mock('@packages/context/log-sink', () => ({ emitRequestLog: jest.fn() }));

const emit = emitRequestLog as jest.Mock<void, [RequestLogEntry]>;

describe('LoggerInterceptor currentPassword redaction (GW-01)', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    emit.mockReset();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  it('redacts currentPassword/newPassword on POST /users/change-password and keeps other fields', async () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/users/change-password',
          headers: {},
          body: {
            currentPassword: 'OldSecret#123',
            newPassword: 'NewSecret#456',
            note: 'visible',
          },
        }),
        getResponse: () => ({ statusCode: 200, getHeaders: () => ({}) }),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of({ ok: true }) };

    await lastValueFrom(new LoggerInterceptor().intercept(ctx, next));

    const requestBody = emit.mock.calls[0][0].requestBody as string;
    const body = JSON.parse(requestBody);
    expect(body.currentPassword).toBe('[REDACTED]');
    expect(body.newPassword).toBe('[REDACTED]');
    expect(body.note).toBe('visible');

    const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    for (const text of [requestBody, logged]) {
      expect(text).not.toContain('OldSecret#123');
      expect(text).not.toContain('NewSecret#456');
    }
  });
});
