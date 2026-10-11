import { ArgumentsHost, BadRequestException, HttpException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from 'src/packages/filters/http-exception.filter';
import { runWithRequestContext } from '@packages/context/request-context';

function buildHost(request: object, response: { status: jest.Mock; json: jest.Mock }): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

function setup(language?: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status, json };
  const request = { url: '/classes/1', language };
  return { request, response, status, json, host: buildHost(request, response) };
}

function lastBody(json: jest.Mock): Record<string, unknown> {
  const calls = json.mock.calls as [Record<string, unknown>][];
  return calls[calls.length - 1][0];
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('localizes a message code to the request language', () => {
    const { host, status, json } = setup('en');
    filter.catch(new NotFoundException('USER_NOT_FOUND'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, statusCode: 404, message: 'User not found', path: '/classes/1' }),
    );
  });

  it('uses Vietnamese by default when no language is attached', () => {
    const { host, json } = setup(undefined);
    filter.catch(new NotFoundException('USER_NOT_FOUND'), host);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Không tìm thấy người dùng' }));
  });

  it('localizes a composed "CODE: suffix" message and keeps the suffix', () => {
    const { host, json } = setup('en');
    filter.catch(new BadRequestException('EMAIL_EXISTS: a@b.c'), host);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Email already exists: a@b.c' }));
  });

  it('joins array-style validation messages and localizes each part', () => {
    const { host, json } = setup('en');
    filter.catch(new BadRequestException(['USER_NOT_FOUND', 'some plain text']), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'User not found, some plain text' }),
    );
  });

  it('localizes field-level errors and keeps their other properties', () => {
    const { host, json } = setup('en');
    const ex = new HttpException(
      { message: 'VALIDATION_FAILED', errors: [{ field: 'name', message: 'USER_NOT_FOUND', code: 'custom' }] },
      422,
    );
    filter.catch(ex, host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Validation failed',
        errors: [{ field: 'name', message: 'User not found', code: 'custom' }],
      }),
    );
  });

  it('passes a plain string response through untouched', () => {
    const { host, json } = setup('en');
    filter.catch(new HttpException('just text', 400), host);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ message: 'just text' }));
  });

  it('adds correlationId from the request context', () => {
    const { host, json } = setup('en');
    runWithRequestContext({ correlationId: 'cid-9' } as never, () =>
      filter.catch(new BadRequestException('x'), host),
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'cid-9' }));
  });

  it('includes serviceName when the RPC payload carried one', () => {
    const { host, json } = setup('en');
    filter.catch(new HttpException({ message: 'x', serviceName: 'user' }, 400), host);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ serviceName: 'user' }));
  });

  it('includes a stack trace on 5xx outside production only', () => {
    const { host, json } = setup('en');
    process.env.NODE_ENV = 'development';
    filter.catch(new InternalServerErrorException('down'), host);
    expect(lastBody(json)).toHaveProperty('trace');

    json.mockClear();
    process.env.NODE_ENV = 'production';
    filter.catch(new InternalServerErrorException('down'), host);
    expect(lastBody(json)).not.toHaveProperty('trace');
  });
});
