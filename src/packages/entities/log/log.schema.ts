import { z } from 'zod';

export const logTypeSchema = z.enum(['HTTP', 'RPC']);

export const getRequestLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  serviceName: z.string().optional(),
  type: logTypeSchema.optional(),
  correlationId: z.string().optional(),
  search: z.string().trim().min(1).optional(),
});

/** `GET /logs/trace/:correlationId?limit=` — how many hops to return (default 500, max 1000). */
export const traceLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

/** `GET /log/trace/:correlationId` path param: a bounded, non-blank id (correlation ids are UUIDs). */
export const correlationIdParamSchema = z.string().trim().min(1).max(128);
