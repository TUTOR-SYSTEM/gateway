import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { CORRELATION_ID_HEADER, runWithRequestContext } from './request-context';

const SERVICE_NAME = 'gateway';

/**
 * Entry point for correlation tracking: reuses an incoming `x-correlation-id` (a caller-supplied
 * request id, e.g. from a frontend or another system) or mints a new one, generates a fresh
 * `traceId` for this hop, and echoes the correlation id back on the response so a client can
 * quote it when asking for logs. Wired first in `main.ts`'s `app.use(...)` chain — the
 * `AsyncLocalStorage` context it opens has to wrap the *entire* rest of the request pipeline
 * (guards, interceptors, the controller, `RmqProducer.send()`) or downstream code sees no
 * context at all.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers[CORRELATION_ID_HEADER];
  const correlationId = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  const traceId = randomUUID();

  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  runWithRequestContext({ correlationId, traceId, serviceName: SERVICE_NAME }, () => next());
}
