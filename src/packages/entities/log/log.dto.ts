import { z } from 'zod';
import { getRequestLogsQuerySchema, traceLogsQuerySchema } from './log.schema';

export type GetRequestLogsQueryDto = z.infer<typeof getRequestLogsQuerySchema>;
export type TraceLogsQueryDto = z.infer<typeof traceLogsQuerySchema>;
