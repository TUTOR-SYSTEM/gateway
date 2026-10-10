import { listHttpRoutes } from '@packages/helpers';
import { TestScenarioController } from './test-scenario.controller';

jest.mock('@packages/helpers', () => ({
  ...jest.requireActual<object>('@packages/helpers'),
  listHttpRoutes: jest.fn(),
}));

describe('TestScenarioController.meta', () => {
  const originalEnv = { ...process.env };
  const controller = new TestScenarioController({} as never, {} as never);

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

describe('TestScenarioController.runs', () => {
  it('forwards the id and limit to third-service', () => {
    const send = jest.fn().mockReturnValue('ok');
    const controller = new TestScenarioController({ send } as never, {} as never);
    expect(controller.runs('id-1', 5)).toBe('ok');
    expect(send).toHaveBeenCalledWith('testscenario.runs', { id: 'id-1', limit: 5 });
  });
});

describe('TestScenarioController fixtures', () => {
  it('forwards the caller token when resolving a fixture', () => {
    const send = jest.fn().mockReturnValue('ok');
    const controller = new TestScenarioController({ send } as never, {} as never);
    void controller.resolveFixture('f1', 'Bearer abc');
    expect(send).toHaveBeenCalledWith('testscenario.fixtures.resolve', { id: 'f1', accessToken: 'abc' });
  });

  it('wraps the update dto with its id', () => {
    const send = jest.fn();
    const controller = new TestScenarioController({ send } as never, {} as never);
    void controller.updateFixture('f1', { value: '42' });
    expect(send).toHaveBeenCalledWith('testscenario.fixtures.update', { id: 'f1', dto: { value: '42' } });
  });
});

describe('TestScenarioController.generate', () => {
  const route = (method: string, path: string, params: string[] = []) => ({ method, path, params });

  it('sends the requested routes (or all but its own) with the list routes for fixtures', () => {
    jest.mocked(listHttpRoutes).mockReturnValue([
      route('GET', '/classes'),
      route('GET', '/classes/:id', ['id']),
      route('POST', '/test-scenarios'),
    ] as never);
    const send = jest.fn<unknown, [string, { routes: { path: string }[] }]>();
    const controller = new TestScenarioController({ send } as never, {} as never);

    void controller.generate({ routes: [{ method: 'GET', path: '/classes/:id' }], categories: ['auth'] });
    expect(send).toHaveBeenLastCalledWith('testscenario.generate', {
      routes: [route('GET', '/classes/:id', ['id'])],
      listRoutes: [route('GET', '/classes')],
      categories: ['auth'],
    });

    void controller.generate({});
    const payload = send.mock.lastCall![1];
    expect(payload.routes.map((r) => r.path)).toEqual(['/classes', '/classes/:id']);
  });
});
