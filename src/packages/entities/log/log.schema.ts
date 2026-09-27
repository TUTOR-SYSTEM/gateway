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
