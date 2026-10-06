import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { LoggerInterceptor, resolveServiceHost } from './logger.interceptor';
import { emitRequestLog, type RequestLogEntry } from '@packages/context/log-sink';

jest.mock('@packages/context/log-sink', () => ({ emitRequestLog: jest.fn() }));

function buildContext(request: object, response: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

describe('LoggerInterceptor header capture', () => {
  const originalEnv = { ...process.env };
  const emit = emitRequestLog as jest.Mock<void, [RequestLogEntry]>;

  beforeEach(() => {
    emit.mockReset();
    Logger.overrideLogger(false);
    delete process.env.SERVICE_HOST;
    delete process.env.PORT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function run(request: object, response: object) {
    const interceptor = new LoggerInterceptor();
    const next: CallHandler = { handle: () => of({ ok: true }) };
    await lastValueFrom(interceptor.intercept(buildContext(request, response), next));
    return emit.mock.calls[0][0];
  }

  it('captures only allowlisted headers and never authorization/cookie', async () => {
    const entry = await run(
      {
        method: 'GET',
        url: '/classes',
        body: {},
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sid=1',
          'content-type': 'application/json',
          'user-agent': 'jest',
          'x-forwarded-for': '1.2.3.4',
          'x-secret': 'nope',
        },
      },
      {
        statusCode: 200,
        getHeaders: () => ({
          'content-type': 'application/json',
          'set-cookie': ['a=b'],
          server: 'nginx',
          'x-response-time': '12ms',
        }),
      },
    );

    expect(JSON.parse(entry.requestHeaders as string)).toEqual({
      'content-type': 'application/json',
      'user-agent': 'jest',
      'x-forwarded-for': '1.2.3.4',
    });
    expect(JSON.parse(entry.responseHeaders as string)).toEqual({
      'content-type': 'application/json',
      server: 'nginx',
      'x-response-time': '12ms',
    });
    expect(entry.requestHeaders).not.toMatch(/authorization|cookie|secret/i);
    expect(entry.responseHeaders).not.toMatch(/cookie/i);
  });

  it('leaves headers undefined when none are allowlisted', async () => {
    const entry = await run(
      { method: 'GET', url: '/x', body: {}, headers: { authorization: 'Bearer t' } },
      { statusCode: 200, getHeaders: () => ({}) },
    );
    expect(entry.requestHeaders).toBeUndefined();
    expect(entry.responseHeaders).toBeUndefined();
  });

  it('sets host from SERVICE_HOST, else gateway:PORT', () => {
    process.env.SERVICE_HOST = 'api-gateway:8080';
    expect(resolveServiceHost()).toBe('api-gateway:8080');
    delete process.env.SERVICE_HOST;
    process.env.PORT = '9000';
    expect(resolveServiceHost()).toBe('gateway:9000');
    delete process.env.PORT;
    expect(resolveServiceHost()).toBe('gateway:8888');
  });
});
