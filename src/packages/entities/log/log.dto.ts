import { z } from 'zod';
import { getRequestLogsQuerySchema } from './log.schema';

export type GetRequestLogsQueryDto = z.infer<typeof getRequestLogsQuerySchema>;
