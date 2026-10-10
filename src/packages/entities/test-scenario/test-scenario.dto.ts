import { z } from 'zod';
import {
  bulkCreateTestScenariosSchema,
  createTestFixtureSchema,
  createTestScenarioSchema,
  fixtureResolverSchema,
  generateTestScenariosSchema,
  getTestScenariosQuerySchema,
  testAuthProfileSchema,
  updateTestFixtureSchema,
  updateTestScenarioSchema,
} from './test-scenario.schema';

export type CreateTestScenarioDto = z.infer<typeof createTestScenarioSchema>;
export type UpdateTestScenarioDto = z.infer<typeof updateTestScenarioSchema>;
export type GetTestScenariosQueryDto = z.infer<typeof getTestScenariosQuerySchema>;
export type TestAuthProfile = z.infer<typeof testAuthProfileSchema>;
export type FixtureResolverDto = z.infer<typeof fixtureResolverSchema>;
export type GenerateTestScenariosBodyDto = z.infer<typeof generateTestScenariosSchema>;
export type BulkCreateTestScenariosDto = z.infer<typeof bulkCreateTestScenariosSchema>;
export type CreateTestFixtureDto = z.infer<typeof createTestFixtureSchema>;
export type UpdateTestFixtureDto = z.infer<typeof updateTestFixtureSchema>;
