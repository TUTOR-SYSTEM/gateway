import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { LoggerInterceptor } from 'src/packages/interceptor/logger.interceptor';
import { emitRequestLog, type RequestLogEntry } from '@packages/context/log-sink';

jest.mock('@packages/context/log-sink', () => ({ emitRequestLog: jest.fn() }));

const emit = emitRequestLog as jest.Mock<void, [RequestLogEntry]>;

describe('LoggerInterceptor redaction (GW-22)', () => {
  beforeEach(() => emit.mockReset());

  it('redacts jti/key/secret/apiKey/authorization/cookie/otp/resetToken/buffer case-insensitively', async () => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/x',
          headers: {},
          body: {
            jti: 'j',
            key: 'session:1',
            clientSecret: 's',
            APIKEY: 'k',
            Authorization: 'Bearer z',
            cookie: 'c',
            otp: '123456',
            resetToken: 'rt',
            buffer: 'AAAA',
            keep: 'visible',
          },
        }),
        getResponse: () => ({ statusCode: 200, getHeaders: () => ({}) }),
      }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of({ ok: true }) };
    await lastValueFrom(new LoggerInterceptor().intercept(ctx, next));
    const body = JSON.parse(emit.mock.calls[0][0].requestBody as string);
    expect(body.keep).toBe('visible');
    for (const k of ['jti', 'key', 'clientSecret', 'APIKEY', 'Authorization', 'cookie', 'otp', 'resetToken', 'buffer']) {
      expect(body[k]).toBe('[REDACTED]');
    }
  });
});
