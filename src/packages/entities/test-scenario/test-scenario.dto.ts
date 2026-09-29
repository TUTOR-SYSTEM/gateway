import { z } from 'zod';
import {
  createTestScenarioSchema,
  getTestScenariosQuerySchema,
  updateTestScenarioSchema,
} from './test-scenario.schema';

export type CreateTestScenarioDto = z.infer<typeof createTestScenarioSchema>;
export type UpdateTestScenarioDto = z.infer<typeof updateTestScenarioSchema>;
export type GetTestScenariosQueryDto = z.infer<typeof getTestScenariosQuerySchema>;
