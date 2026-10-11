import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from 'src/packages/filters/http-exception.filter';
import { ERROR_TRANSLATIONS } from 'src/data/i18n';

function setup(language?: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status, json };
  const request = { url: '/x', language };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function body(json: jest.Mock): Record<string, unknown> {
  return json.mock.calls[json.mock.calls.length - 1][0] as Record<string, unknown>;
}

describe('HttpExceptionFilter edge cases', () => {
  const filter = new HttpExceptionFilter();

  it('localises each field-level error message in the errors array', () => {
    const [code] = Object.keys(ERROR_TRANSLATIONS);
    const { host, json } = setup('en');
    const exception = new HttpException(
      {
        statusCode: 422,
        message: 'Validation failed',
        errors: [
          { field: 'email', message: code, code: 'custom' },
          { field: 'name', message: 'plain text', code: 'too_small' },
        ],
      },
      422,
    );
    filter.catch(exception, host);
    expect(body(json).errors).toEqual([
      { field: 'email', message: ERROR_TRANSLATIONS[code].en, code: 'custom' },
      { field: 'name', message: 'plain text', code: 'too_small' },
    ]);
  });

  it('passes non-object error items through unchanged', () => {
    const { host, json } = setup('en');
    const exception = new HttpException(
      { statusCode: 400, message: 'bad', errors: ['raw string', 42, null] },
      400,
    );
    filter.catch(exception, host);
    expect(body(json).errors).toEqual(['raw string', 42, null]);
  });

  it('leaves an error item whose message is not a string untouched', () => {
    const { host, json } = setup('en');
    const item = { field: 'x', message: 12 };
    const exception = new HttpException({ statusCode: 400, message: 'bad', errors: [item] }, 400);
    filter.catch(exception, host);
    expect(body(json).errors).toEqual([{ field: 'x', message: 12 }]);
  });

  it('returns errors as-is when the errors property is not an array', () => {
    const { host, json } = setup('en');
    const exception = new HttpException({ statusCode: 400, message: 'bad', errors: { a: 1 } }, 400);
    filter.catch(exception, host);
    expect(body(json).errors).toEqual({ a: 1 });
  });

  it('sends the status from the exception and mirrors it in the body', () => {
    const { host, status, json } = setup('vi');
    filter.catch(new HttpException('Teapot', HttpStatus.I_AM_A_TEAPOT), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.I_AM_A_TEAPOT);
    expect(body(json).statusCode).toBe(HttpStatus.I_AM_A_TEAPOT);
  });

  it('localises the array-message fallback path when the response message is an array of codes', () => {
    const [code] = Object.keys(ERROR_TRANSLATIONS);
    const { host, json } = setup('en');
    filter.catch(new HttpException({ statusCode: 400, message: [code, 'free text'] }, 400), host);
    expect(body(json).message).toBe(`${ERROR_TRANSLATIONS[code].en}, free text`);
  });
});
