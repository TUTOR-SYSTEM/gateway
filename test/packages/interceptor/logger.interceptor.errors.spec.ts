import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  LoggerInterceptor,
  resolveServiceHost,
} from 'src/packages/interceptor/logger.interceptor';
import { emitRequestLog, type RequestLogEntry } from '@packages/context/log-sink';
import { runWithRequestContext } from '@packages/context/request-context';

jest.mock('@packages/context/log-sink', () => ({ emitRequestLog: jest.fn() }));

function buildContext(request: object, response: object): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

const emit = emitRequestLog as jest.Mock<void, [RequestLogEntry]>;

async function runWith(
  request: object,
  response: object,
  handle: CallHandler['handle'],
): Promise<RequestLogEntry> {
  const interceptor = new LoggerInterceptor();
  await lastValueFrom(
    interceptor.intercept(buildContext(request, response), { handle }).pipe(
      // swallow errors so the emitted entry can be inspected
    ),
  ).catch(() => undefined);
  return emit.mock.calls[0][0];
}

describe('LoggerInterceptor error and redaction paths', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    emit.mockReset();
    Logger.overrideLogger(false);
    delete process.env.SERVICE_HOST;
    delete process.env.PORT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('records the HttpException response body and status when the handler throws', async () => {
    const entry = await runWith(
      { method: 'POST', url: '/auth/login', body: { email: 'a@b.c' }, headers: {} },
      { statusCode: 401, getHeaders: () => ({}) },
      () => throwError(() => new HttpException({ message: 'Invalid credentials' }, 401)),
    );
    expect(entry.errorMessage).toBe('Invalid credentials');
    expect(JSON.parse(entry.responseBody as string)).toEqual({
      statusCode: 401,
      message: 'Invalid credentials',
    });
  });

  it('wraps a string HttpException response as the message', async () => {
    const entry = await runWith(
      { method: 'GET', url: '/x', body: {}, headers: {} },
      { statusCode: 404, getHeaders: () => ({}) },
      () => throwError(() => new HttpException('Not here', HttpStatus.NOT_FOUND)),
    );
    expect(JSON.parse(entry.responseBody as string)).toEqual({
      statusCode: 404,
      message: 'Not here',
    });
  });

  it('serialises a plain Error as name and message', async () => {
    const entry = await runWith(
      { method: 'GET', url: '/boom', body: {}, headers: {} },
      { statusCode: 500, getHeaders: () => ({}) },
      () => throwError(() => new TypeError('bad type')),
    );
    expect(entry.errorMessage).toBe('bad type');
    expect(JSON.parse(entry.responseBody as string)).toEqual({
      name: 'TypeError',
      message: 'bad type',
    });
  });

  it('serialises a non-Error thrown value as-is', async () => {
    const entry = await runWith(
      { method: 'GET', url: '/raw', body: {}, headers: {} },
      { statusCode: 500, getHeaders: () => ({}) },
      () => throwError(() => ({ code: 'E_RAW' })),
    );
    expect(JSON.parse(entry.responseBody as string)).toEqual({ code: 'E_RAW' });
    expect(entry.errorMessage).toBeUndefined();
  });

  it('keeps a HttpException whose getResponse returns a non-object as the message field', async () => {
    const weird = { getResponse: () => 'text-body', getStatus: () => 418, message: 'teapot' };
    const entry = await runWith(
      { method: 'GET', url: '/tea', body: {}, headers: {} },
      { statusCode: 418, getHeaders: () => ({}) },
      () => throwError(() => weird),
    );
    expect(JSON.parse(entry.responseBody as string)).toEqual({
      statusCode: 418,
      message: 'text-body',
    });
  });

  it('redacts sensitive keys at any depth in the logged request body', async () => {
    const entry = await runWith(
      {
        method: 'POST',
        url: '/auth/reset',
        body: {
          email: 'a@b.c',
          password: 'p1',
          nested: { newPassword: 'p2', items: [{ refreshToken: 'r', ok: 1 }] },
        },
        headers: {},
      },
      { statusCode: 200, getHeaders: () => ({}) },
      () => of({ accessToken: 'abc', user: { oldPassword: 'x' } }),
    );
    const body = entry.requestBody as string;
    expect(body).not.toMatch(/"p1"|"p2"|"r"/);
    expect(JSON.parse(body)).toEqual({
      email: 'a@b.c',
      password: '[REDACTED]',
      nested: { newPassword: '[REDACTED]', items: [{ refreshToken: '[REDACTED]', ok: 1 }] },
    });
    expect(JSON.parse(entry.responseBody as string)).toEqual({
      accessToken: '[REDACTED]',
      user: { oldPassword: '[REDACTED]' },
    });
  });

  it('truncates a logged payload longer than 1000 characters', async () => {
    const big = 'x'.repeat(1500);
    const entry = await runWith(
      { method: 'POST', url: '/big', body: { big }, headers: {} },
      { statusCode: 200, getHeaders: () => ({}) },
      () => of({ ok: true }),
    );
    expect(entry.requestBody).toHaveLength(1000 + '…(truncated)'.length);
    expect(entry.requestBody?.endsWith('…(truncated)')).toBe(true);
  });

  it('does not truncate a payload exactly at the 1000-character limit', async () => {
    const pad = 'y'.repeat(1000 - '{"v":""}'.length);
    const entry = await runWith(
      { method: 'POST', url: '/edge', body: { v: pad }, headers: {} },
      { statusCode: 200, getHeaders: () => ({}) },
      () => of({ ok: true }),
    );
    expect(entry.requestBody).toHaveLength(1000);
    expect(entry.requestBody?.includes('truncated')).toBe(false);
  });

  it('logs "[Unserializable]" for a circular request body without throwing', async () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const entry = await runWith(
      { method: 'POST', url: '/loop', body: circular, headers: {} },
      { statusCode: 200, getHeaders: () => ({}) },
      () => of({ ok: true }),
    );
    expect(entry.requestBody).toBe('[Unserializable]');
  });

  it('omits the request body entirely when the body is empty or not an object', async () => {
    const empty = await runWith(
      { method: 'GET', url: '/a', body: {}, headers: {} },
      { statusCode: 200, getHeaders: () => ({}) },
      () => of(1),
    );
    expect(empty.requestBody).toBeUndefined();

    emit.mockReset();
    const primitive = await runWith(
      { method: 'POST', url: '/b', body: 'raw text', headers: {} },
      { statusCode: 200, getHeaders: () => ({}) },
      () => of(1),
    );
    expect(primitive.requestBody).toBeUndefined();
  });

  it('records a response body of "undefined" when the handler emits undefined', async () => {
    const entry = await runWith(
      { method: 'DELETE', url: '/x/1', body: {}, headers: {} },
      { statusCode: 204, getHeaders: () => ({}) },
      () => of(undefined),
    );
    expect(entry.responseBody).toBe('undefined');
  });

  it('includes the user id, ip and request-context ids in the emitted entry', async () => {
    const request = {
      method: 'GET',
      url: '/me',
      body: {},
      headers: {},
      ip: '10.0.0.7',
      user: { id: 'user-42' },
    };
    const entry = await runWithRequestContext(
      { correlationId: 'corr-9', traceId: 'trace-9', parentTraceId: 'parent-9' } as never,
      () => runWith(request, { statusCode: 200, getHeaders: () => ({}) }, () => of({})),
    );
    expect(entry).toMatchObject({
      serviceName: 'gateway',
      type: 'HTTP',
      method: 'GET',
      path: '/me',
      statusCode: 200,
      correlationId: 'corr-9',
      traceId: 'trace-9',
      parentTraceId: 'parent-9',
      userId: 'user-42',
      ip: '10.0.0.7',
    });
    expect(entry.durationMs).toEqual(expect.any(Number));
  });

  it('falls back to "unknown" correlation and trace ids outside a request context', async () => {
    const entry = await runWith(
      { method: 'GET', url: '/anon', body: {}, headers: {} },
      { statusCode: 200, getHeaders: () => ({}) },
      () => of({}),
    );
    expect(entry.correlationId).toBe('unknown');
    expect(entry.traceId).toBe('unknown');
    expect(entry.userId).toBeUndefined();
  });

  it('captures array and numeric or boolean header values in the allowlist', async () => {
    const entry = await runWith(
      {
        method: 'GET',
        url: '/h',
        body: {},
        headers: {
          'x-forwarded-for': ['1.1.1.1', '2.2.2.2'],
          'x-trace-id': 77,
          'x-span-id': true,
          'accept-language': undefined,
        },
      },
      { statusCode: 200, getHeaders: () => ({ 'x-response-time': 12, server: false }) },
      () => of({}),
    );
    expect(JSON.parse(entry.requestHeaders as string)).toEqual({
      'x-forwarded-for': '1.1.1.1, 2.2.2.2',
      'x-trace-id': '77',
      'x-span-id': 'true',
    });
    expect(JSON.parse(entry.responseHeaders as string)).toEqual({
      'x-response-time': '12',
      server: 'false',
    });
  });

  it('leaves header fields undefined when the request or response has no headers accessor', async () => {
    const entry = await runWith(
      { method: 'GET', url: '/n', body: {}, headers: undefined },
      { statusCode: 200 },
      () => of({}),
    );
    expect(entry.requestHeaders).toBeUndefined();
    expect(entry.responseHeaders).toBeUndefined();
  });

  it('logs a timing line with duration on every request', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await runWith(
      { method: 'GET', url: '/t', body: {}, headers: {} },
      { statusCode: 200, getHeaders: () => ({}) },
      () => of({}),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[Timing\] GET \/t - \d+ms/));
  });
});

describe('resolveServiceHost', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('prefers SERVICE_HOST when configured and trims whitespace', () => {
    process.env.SERVICE_HOST = '  gateway.internal  ';
    expect(resolveServiceHost()).toBe('gateway.internal');
  });

  it('falls back to gateway:PORT when only PORT is set', () => {
    delete process.env.SERVICE_HOST;
    process.env.PORT = '9001';
    expect(resolveServiceHost()).toBe('gateway:9001');
  });

  it('falls back to gateway:8888 when neither is set', () => {
    delete process.env.SERVICE_HOST;
    delete process.env.PORT;
    expect(resolveServiceHost()).toBe('gateway:8888');
  });

  it('treats a blank SERVICE_HOST as unset', () => {
    process.env.SERVICE_HOST = '   ';
    process.env.PORT = '7000';
    expect(resolveServiceHost()).toBe('gateway:7000');
  });

  it('truncates the host to 100 characters', () => {
    process.env.SERVICE_HOST = 'h'.repeat(150);
    expect(resolveServiceHost()).toHaveLength(100);
  });
});
