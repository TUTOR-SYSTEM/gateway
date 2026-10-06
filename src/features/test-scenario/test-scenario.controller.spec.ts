import { TestScenarioController } from './test-scenario.controller';

describe('TestScenarioController.meta', () => {
  const originalEnv = { ...process.env };
  const controller = new TestScenarioController({} as never);

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('prefers APP_ENV', () => {
    process.env.APP_ENV = 'staging';
    process.env.NODE_ENV = 'production';
    expect(controller.meta()).toEqual({ environment: 'staging' });
  });

  it('falls back to NODE_ENV', () => {
    delete process.env.APP_ENV;
    process.env.NODE_ENV = 'production';
    expect(controller.meta()).toEqual({ environment: 'production' });
  });
});
