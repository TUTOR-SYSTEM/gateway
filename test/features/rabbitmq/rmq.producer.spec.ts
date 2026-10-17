import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ClientProxy, RmqRecord } from '@nestjs/microservices';
import { of, throwError, Observable } from 'rxjs';
import { RmqProducer } from 'src/features/rabbitmq/rmq.producer';
import {
  CORRELATION_ID_HEADER,
  PARENT_TRACE_ID_HEADER,
  runWithRequestContext,
  SERVICE_NAME_HEADER,
  TRACE_ID_HEADER,
} from '@packages/context/request-context';
import { THIRD_SERVICE, TUTOR_SERVICE, USER_SERVICE } from 'src/features/rabbitmq/rmq.constants';

type MockClient = {
  send: jest.Mock<Observable<unknown>, [string, RmqRecord<unknown>]>;
  emit: jest.Mock<Observable<unknown>, [string, RmqRecord<unknown>]>;
  close: jest.Mock<Promise<void>, []>;
};

function mockClient(): MockClient {
  return {
    send: jest.fn(),
    emit: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function timeoutError(): Error {
  const err = new Error('Timeout has occurred');
  err.name = 'TimeoutError';
  return err;
}

describe('RmqProducer', () => {
  let user: MockClient;
  let tutor: MockClient;
  let third: MockClient;
  let producer: RmqProducer;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    user = mockClient();
    tutor = mockClient();
    third = mockClient();
    producer = new RmqProducer(
      user as unknown as ClientProxy,
      tutor as unknown as ClientProxy,
      third as unknown as ClientProxy,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor and lifecycle', () => {
    it('logs the initialised clients', () => {
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        `✅ RabbitMQ clients initialized: ${USER_SERVICE}, ${TUTOR_SERVICE}, ${THIRD_SERVICE}`,
      );
    });

    it('closes all three clients on module destroy', async () => {
      await producer.onModuleDestroy();
      expect(user.close).toHaveBeenCalledTimes(1);
      expect(tutor.close).toHaveBeenCalledTimes(1);
      expect(third.close).toHaveBeenCalledTimes(1);
    });

    it('rejects module destroy when a client fails to close', async () => {
      tutor.close.mockRejectedValueOnce(new Error('close failed'));
      await expect(producer.onModuleDestroy()).rejects.toThrow('close failed');
    });
  });

  describe('emit', () => {
    it('routes to the owning client and resolves with the emit result', async () => {
      tutor.emit.mockReturnValue(of('ack'));
      await expect(producer.emit('class.created', { id: 1 })).resolves.toBe('ack');
      expect(tutor.emit).toHaveBeenCalledTimes(1);
      expect(user.emit).not.toHaveBeenCalled();
      expect(third.emit).not.toHaveBeenCalled();
    });

    it('wraps the payload in an RmqRecord with the original message', async () => {
      tutor.emit.mockReturnValue(of(undefined));
      await producer.emit('class.created', { id: 'abc' });
      const [pattern, record] = tutor.emit.mock.calls[0];
      expect(pattern).toBe('class.created');
      expect(record).toBeInstanceOf(RmqRecord);
      expect(record.data).toEqual({ id: 'abc' });
    });

    it('resolves undefined when the emit observable completes empty', async () => {
      tutor.emit.mockReturnValue(of());
      await expect(producer.emit('class.created', {})).resolves.toBeUndefined();
    });

    it('rejects when the emit observable errors', async () => {
      tutor.emit.mockReturnValue(throwError(() => new Error('broker down')));
      await expect(producer.emit('class.created', {})).rejects.toThrow('broker down');
    });

    it('throws synchronously for an unroutable pattern without touching a client', () => {
      expect(() => producer.emit('nope.x', {})).toThrow(/No RabbitMQ route/);
      expect(user.emit).not.toHaveBeenCalled();
    });
  });

  describe('trace headers', () => {
    it('reuses the correlation id and sets the parent trace from the active request context', async () => {
      tutor.emit.mockReturnValue(of(undefined));
      await runWithRequestContext(
        { correlationId: 'corr-1', traceId: 'trace-parent', parentTraceId: undefined } as never,
        () => producer.emit('class.created', {}),
      );
      const record = tutor.emit.mock.calls[0][1];
      expect(record.options?.headers).toMatchObject({
        [CORRELATION_ID_HEADER]: 'corr-1',
        [PARENT_TRACE_ID_HEADER]: 'trace-parent',
        [SERVICE_NAME_HEADER]: 'gateway',
      });
      expect(record.options?.headers[TRACE_ID_HEADER]).toEqual(expect.any(String));
      expect(record.options?.headers[TRACE_ID_HEADER]).not.toBe('trace-parent');
    });

    it('generates a fresh correlation id and empty parent trace outside a request context', async () => {
      tutor.emit.mockReturnValue(of(undefined));
      await producer.emit('class.created', {});
      const headers = tutor.emit.mock.calls[0][1].options?.headers as Record<string, string>;
      expect(headers[CORRELATION_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
      expect(headers[PARENT_TRACE_ID_HEADER]).toBe('');
    });
  });

  describe('send', () => {
    it('returns the response on first-attempt success', async () => {
      user.send.mockReturnValue(of({ ok: true }));
      await expect(producer.send('auth.login', { email: 'a@b.c' })).resolves.toEqual({ ok: true });
      expect(user.send).toHaveBeenCalledTimes(1);
    });

    it('routes the request to the owning client', async () => {
      third.send.mockReturnValue(of('sent'));
      await expect(producer.send('email.send', {})).resolves.toBe('sent');
      expect(third.send).toHaveBeenCalledTimes(1);
      expect(user.send).not.toHaveBeenCalled();
    });

    it('retries after a failure and succeeds on a later attempt', async () => {
      user.send
        .mockReturnValueOnce(throwError(() => new Error('flaky')))
        .mockReturnValueOnce(of('recovered'));
      await expect(producer.send('user.getUsers', {}, 1000)).resolves.toBe('recovered');
      expect(user.send).toHaveBeenCalledTimes(2);
    });

    it('AUTH-02: does not retry a plain error on a non-idempotent write pattern', async () => {
      user.send.mockReturnValue(throwError(() => new Error('Channel closed')));
      const err = await producer
        .send('auth.register', {}, 1000, 2)
        .catch((e: unknown) => e as HttpException);
      expect(user.send).toHaveBeenCalledTimes(1);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect((err as HttpException).getResponse()).toMatchObject({ attempts: 1 });
    });

    it('AUTH-02: does not retry a raw connection-failure object on a write pattern', async () => {
      user.send.mockReturnValue(
        throwError(() => ({ err: {}, url: 'amqp://guest:***@rabbit:5672' })),
      );
      await producer.send('auth.googleLogin', {}, 1000, 2).catch(() => undefined);
      expect(user.send).toHaveBeenCalledTimes(1);
    });

    it('makes maxRetries + 1 attempts before throwing a 500 for a plain error', async () => {
      user.send.mockReturnValue(throwError(() => new Error('boom')));
      const err = await producer
        .send('user.getUsers', {}, 1000, 2)
        .catch((e: unknown) => e as HttpException);
      expect(user.send).toHaveBeenCalledTimes(3);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect((err as HttpException).getResponse()).toMatchObject({
        message: 'INTERNAL_SERVER_ERROR',
        isTimeout: false,
        attempts: 3,
      });
    });

    it('GW-06: does not retry a responder error that carries a statusCode', async () => {
      user.send.mockReturnValue(throwError(() => ({ statusCode: 409, message: 'dup' })));
      const err = (await producer
        .send('user.createUser', {}, 1000)
        .catch((e: unknown) => e)) as HttpException;
      expect(user.send).toHaveBeenCalledTimes(1);
      expect(err.getStatus()).toBe(409);
    });

    it('GW-06: does not retry a timeout on a write pattern (504)', async () => {
      user.send.mockReturnValue(throwError(() => timeoutError()));
      const err = (await producer
        .send('user.createUser', {}, 1000)
        .catch((e: unknown) => e)) as HttpException;
      expect(user.send).toHaveBeenCalledTimes(1);
      expect(err.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
    });

    it('GW-06: retries a timeout on a read pattern', async () => {
      user.send.mockReturnValueOnce(throwError(() => timeoutError())).mockReturnValueOnce(of('ok'));
      await expect(producer.send('user.getUsers', {}, 1000)).resolves.toBe('ok');
      expect(user.send).toHaveBeenCalledTimes(2);
    });

    it('performs no retries when maxRetries is 0', async () => {
      user.send.mockReturnValue(throwError(() => new Error('once')));
      await expect(producer.send('auth.login', {}, 1000, 0)).rejects.toBeInstanceOf(HttpException);
      expect(user.send).toHaveBeenCalledTimes(1);
    });

    it('maps a timeout to 504 Gateway Timeout and flags isTimeout', async () => {
      user.send.mockReturnValue(throwError(() => timeoutError()));
      const err = (await producer
        .send('auth.login', {}, 1000, 0)
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
      expect(err.getResponse()).toMatchObject({ isTimeout: true, attempts: 1 });
    });

    it('preserves the RPC status code and message from a responder error payload', async () => {
      user.send.mockReturnValue(
        throwError(() => ({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found',
          serviceName: 'user',
          errors: { field: 'id' },
        })),
      );
      const err = (await producer
        .send('user.get', {}, 1000, 0)
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(err.getResponse()).toMatchObject({
        message: 'User not found',
        serviceName: 'user',
        errors: { field: 'id' },
        isTimeout: false,
      });
    });

    it('defaults to 500 when the RPC payload has no statusCode', async () => {
      user.send.mockReturnValue(throwError(() => ({ message: 'no status' })));
      const err = (await producer
        .send('user.get', {}, 1000, 0)
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(err.getResponse()).toMatchObject({ message: 'INTERNAL_SERVER_ERROR' });
    });

    it('keeps an array validation message from the RPC payload', async () => {
      user.send.mockReturnValue(
        throwError(() => ({ statusCode: 400, message: ['email invalid', 'password short'] })),
      );
      const err = (await producer
        .send('user.create', {}, 1000, 0)
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(400);
      expect(err.getResponse()).toMatchObject({ message: ['email invalid', 'password short'] });
    });

    it('hides a raw connection-failure object (broker URL) behind a generic 500 message', async () => {
      const connectionFailure = { err: {}, url: 'amqp://guest:***@rabbit:5672' };
      user.send.mockReturnValue(throwError(() => connectionFailure));
      const err = (await producer
        .send('user.get', {}, 1000, 0)
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(err.getResponse()).toMatchObject({ message: 'INTERNAL_SERVER_ERROR' });
      expect(JSON.stringify(err.getResponse())).not.toContain('amqp://');
    });

    it('uses a generic 500 message for a non-Error primitive failure', async () => {
      user.send.mockReturnValue(throwError(() => 'plain string'));
      const err = (await producer
        .send('user.get', {}, 1000, 0)
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(err.getResponse()).toMatchObject({ message: 'INTERNAL_SERVER_ERROR' });
    });

    it('treats an object without a message as a connection failure: generic 500 message', async () => {
      user.send.mockReturnValue(throwError(() => ({ statusCode: 503 })));
      const err = (await producer
        .send('user.get', {}, 1000, 0)
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(err.getResponse()).toMatchObject({ message: 'INTERNAL_SERVER_ERROR' });
    });

    it('treats a non-Error object that carries a message property as the RPC payload', async () => {
      user.send.mockReturnValue(throwError(() => ({ statusCode: 422, message: 'Unprocessable' })));
      const err = (await producer
        .send('user.get', {}, 1000, 0)
        .catch((e: unknown) => e)) as HttpException;
      expect(err.getStatus()).toBe(422);
    });

    it('applies exponential backoff capped at 5000ms between attempts', async () => {
      const sleeps: number[] = [];
      jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
        sleeps.push(ms ?? 0);
        fn();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);
      user.send.mockReturnValue(throwError(() => new Error('down')));
      await producer.send('user.getUsers', {}, 1000, 2).catch(() => undefined);
      expect(sleeps).toEqual([100, 200]);
    });

    it('uses the default 10000ms timeout per attempt when none is given', async () => {
      user.send.mockReturnValue(of('ok'));
      await producer.send('auth.login', {});
      const record = user.send.mock.calls[0][1];
      expect(record).toBeInstanceOf(RmqRecord);
      expect(Logger.prototype.log).toHaveBeenCalledWith(expect.stringContaining('timeoutMs=10000'));
    });

    it('logs the attempt sequence on retry and on final failure', async () => {
      user.send.mockReturnValue(throwError(() => new Error('down')));
      jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
        fn();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);
      await producer.send('user.getUsers', {}, 1000, 1).catch(() => undefined);
      const logCalls = (Logger.prototype.log as jest.Mock).mock.calls.map((c) => String(c[0]));
      expect(logCalls.some((m) => m.startsWith('[SEND-RETRY]'))).toBe(true);
      expect(Logger.prototype.warn).toHaveBeenCalledTimes(2);
      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('[SEND-FAILED]'));
    });
  });
});
