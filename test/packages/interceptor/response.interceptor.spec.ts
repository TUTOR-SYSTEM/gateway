import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from 'src/packages/interceptor/response.interceptor';
import { runWithRequestContext } from '@packages/context/request-context';

function buildContext(request: object, response: object): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
}

describe('ResponseInterceptor', () => {
  it('wraps the handler result in the standard envelope', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ message: 'SUCCESS' });
    const interceptor = new ResponseInterceptor(reflector);
    const request = { method: 'GET', url: '/classes', language: 'en' };
    const response = { statusCode: 201 };
    const next: CallHandler = { handle: () => of({ id: 1 }) };

    const out = await runWithRequestContext({ correlationId: 'cid-1' } as never, () =>
      lastValueFrom(interceptor.intercept(buildContext(request, response), next)),
    );

    expect(out).toEqual(
      expect.objectContaining({
        statusCode: 201,
        data: { id: 1 },
        method: 'GET',
        path: '/classes',
        correlationId: 'cid-1',
      }),
    );
    expect(out.timestamp).toBeInstanceOf(Date);
  });

  it('defaults the status code to 200 and the message when no metadata is set', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const interceptor = new ResponseInterceptor(reflector);
    const request = { method: 'POST', url: '/x' };
    const response = { statusCode: undefined };
    const out = await lastValueFrom(
      interceptor.intercept(buildContext(request, response), { handle: () => of(null) }),
    );
    expect(out.statusCode).toBe(200);
    expect(out.data).toBeNull();
    expect(out.message).toBe('Thành công');
  });
});
