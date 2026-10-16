import {
  CallHandler,
  ExecutionContext,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { lastValueFrom, throwError, of } from 'rxjs';
import { ErrorInterceptor } from 'src/packages/interceptor/error.interceptor';

const ctx = {} as ExecutionContext;

function handlerThrowing(error: unknown): CallHandler {
  return { handle: () => throwError(() => error) };
}

async function catchFrom(next: CallHandler): Promise<unknown> {
  try {
    await lastValueFrom(new ErrorInterceptor().intercept(ctx, next));
  } catch (e) {
    return e;
  }
  throw new Error('expected an error');
}

describe('ErrorInterceptor', () => {
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('passes through the value when the handler succeeds', async () => {
    const interceptor = new ErrorInterceptor();
    const result = await lastValueFrom(
      interceptor.intercept(ctx, { handle: () => of({ ok: true }) }),
    );
    expect(result).toEqual({ ok: true });
  });

  it('rethrows HttpException unchanged', async () => {
    const http = new HttpException('nope', 404);
    expect(await catchFrom(handlerThrowing(http))).toBe(http);
  });

  it.each([
    ['23503', 'Referenced record not found (foreign key violation)'],
    ['23505', 'Record already exists (duplicate value)'],
    ['23502', 'Required field is missing (not-null violation)'],
    ['23514', 'Value violates check constraint'],
  ])('maps Postgres code %s to a client-safe message', async (code, expected) => {
    const err = Object.assign(new Error('raw pg text'), { code });
    const out = (await catchFrom(handlerThrowing(err))) as InternalServerErrorException;
    expect(out).toBeInstanceOf(InternalServerErrorException);
    expect(out.getResponse()).toEqual(expect.objectContaining({ message: expected }));
  });

  it('reads the Postgres code from error.cause when the top-level code is absent', async () => {
    const err = new Error('wrapped', { cause: { code: '23505' } });
    const out = (await catchFrom(handlerThrowing(err))) as InternalServerErrorException;
    expect(out.getResponse()).toEqual(
      expect.objectContaining({ message: 'Record already exists (duplicate value)' }),
    );
  });

  it('replaces drizzle "Failed query:" messages with a generic database error', async () => {
    const err = new Error('Failed query: select * from users');
    const out = (await catchFrom(handlerThrowing(err))) as InternalServerErrorException;
    expect(out.getResponse()).toEqual(expect.objectContaining({ message: 'Database error' }));
  });

  it('hides the original message of a plain Error from the client but records it', async () => {
    const out = (await catchFrom(
      handlerThrowing(new Error('boom')),
    )) as InternalServerErrorException;
    expect(out.getResponse()).toEqual(
      expect.objectContaining({ message: 'Internal server error', originalError: 'boom' }),
    );
    expect(errorLog).toHaveBeenCalledWith('[ERROR-INTERCEPTOR] boom', expect.any(String));
  });

  it('uses a generic message for non-Error throwables', async () => {
    const out = (await catchFrom(handlerThrowing('string thrown'))) as InternalServerErrorException;
    expect(out.getResponse()).toEqual(
      expect.objectContaining({
        message: 'Internal server error',
        originalError: 'Internal server error',
      }),
    );
  });
});
