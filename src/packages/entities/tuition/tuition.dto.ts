import { z } from 'zod';
import {
  createTuitionSchema,
  getTuitionSummaryQuerySchema,
  getTuitionsQuerySchema,
} from './tuition.schema';

export type CreateTuitionDto = z.infer<typeof createTuitionSchema>;
export type UpdateTuitionDto = Partial<z.infer<typeof createTuitionSchema>>;
export type GetTuitionsQueryDto = z.infer<typeof getTuitionsQuerySchema>;
export type GetTuitionSummaryQueryDto = z.infer<typeof getTuitionSummaryQuerySchema>;

export type TuitionSummaryDto = {
  totalPaid: number;
  totalUnpaid: number;
  totalOverdue: number;
  totalRevenue: number;
};
