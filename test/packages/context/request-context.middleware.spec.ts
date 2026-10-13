import type { NextFunction, Request, Response } from 'express';
import { requestContextMiddleware } from '@packages/context/request-context.middleware';
import { CORRELATION_ID_HEADER, getRequestContext } from '@packages/context/request-context';

function run(header: string | string[] | undefined) {
  const setHeader = jest.fn();
  let seen: string | undefined;
  const next: NextFunction = () => {
    seen = getRequestContext()?.correlationId;
  };
  requestContextMiddleware(
    { headers: { [CORRELATION_ID_HEADER]: header } } as unknown as Request,
    { setHeader } as unknown as Response,
    next,
  );
  return { setHeader, seen };
}

describe('requestContextMiddleware (GW-29)', () => {
  it('reuses a valid incoming correlation id', () => {
    const { setHeader, seen } = run('abc-123_X.y');
    expect(seen).toBe('abc-123_X.y');
    expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, 'abc-123_X.y');
  });

  it('accepts exactly 100 chars', () => {
    expect(run('a'.repeat(100)).seen).toBe('a'.repeat(100));
  });

  it.each([['a'.repeat(101)], ['bad id with spaces'], ['x\r\ny'], ['<script>'], ['']])(
    'replaces invalid id %j with a fresh uuid',
    (bad) => {
      const { seen, setHeader } = run(bad);
      expect(seen).toMatch(/^[0-9a-f-]{36}$/);
      expect(setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, seen);
    },
  );

  it('mints a uuid when absent', () => {
    expect(run(undefined).seen).toMatch(/^[0-9a-f-]{36}$/);
  });
});
