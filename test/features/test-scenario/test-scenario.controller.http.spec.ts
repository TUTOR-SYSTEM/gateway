import { INestApplication, ExecutionContext } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TestScenarioController } from 'src/features/test-scenario/test-scenario.controller';
import { RmqProducer } from 'src/features/rabbitmq/rmq.producer';
import { RolesGuard } from '@packages/guards';
import { listHttpRoutes } from '@packages/helpers';

jest.mock('@packages/helpers', () => ({
  ...jest.requireActual<object>('@packages/helpers'),
  listHttpRoutes: jest.fn(),
}));

const UUID = '123e4567-e89b-42d3-a456-426614174000';

describe('TestScenarioController over HTTP', () => {
  let app: INestApplication;
  let rmq: { send: jest.Mock };
  let discovery: { getControllers: jest.Mock; getProviders: jest.Mock };

  beforeEach(async () => {
    rmq = { send: jest.fn().mockResolvedValue({ ok: true }) };
    discovery = { getControllers: jest.fn().mockReturnValue([]), getProviders: jest.fn().mockReturnValue([]) };
    jest.mocked(listHttpRoutes).mockReturnValue([]);

    const moduleRef = await Test.createTestingModule({
      controllers: [TestScenarioController],
      providers: [
        { provide: RmqProducer, useValue: rmq },
        { provide: DiscoveryService, useValue: discovery },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 'admin-1', email: 'admin@x.io', typ: 'access', role: 'ADMIN' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  const server = () => app.getHttpServer();

  describe('GET /test-scenarios/routes and /meta', () => {
    it('returns the route catalogue from the discovery service', async () => {
      jest.mocked(listHttpRoutes).mockReturnValueOnce([{ method: 'GET', path: '/classes', params: [] }] as never);
      const res = await request(server()).get('/test-scenarios/routes').expect(200);
      expect(res.body).toEqual([{ method: 'GET', path: '/classes', params: [] }]);
    });

    it('reports the environment, preferring APP_ENV over NODE_ENV', async () => {
      const prev = { APP_ENV: process.env.APP_ENV, NODE_ENV: process.env.NODE_ENV };
      process.env.APP_ENV = ' staging ';
      process.env.NODE_ENV = 'production';
      try {
        const res = await request(server()).get('/test-scenarios/meta').expect(200);
        expect(res.body).toEqual({ environment: 'staging' });
      } finally {
        process.env.APP_ENV = prev.APP_ENV;
        process.env.NODE_ENV = prev.NODE_ENV;
      }
    });
  });

  describe('POST /test-scenarios/generate', () => {
    it('accepts an empty body and sends every non-monitor route plus list routes', async () => {
      jest.mocked(listHttpRoutes).mockReturnValue([
        { method: 'GET', path: '/classes', params: [] },
        { method: 'GET', path: '/classes/:id', params: ['id'] },
        { method: 'GET', path: '/test-scenarios/meta', params: [] },
      ] as never);
      await request(server()).post('/test-scenarios/generate').send({}).expect(200);
      const [pattern, payload] = rmq.send.mock.calls[0];
      expect(pattern).toBe('testscenario.generate');
      expect(payload.routes.map((r: { path: string }) => r.path)).toEqual(['/classes', '/classes/:id']);
      expect(payload.listRoutes.map((r: { path: string }) => r.path)).toEqual(['/classes', '/test-scenarios/meta']);
      expect(payload.categories).toBeUndefined();
    });

    it('restricts to the requested routes and forwards categories', async () => {
      jest.mocked(listHttpRoutes).mockReturnValue([
        { method: 'GET', path: '/classes', params: [] },
        { method: 'POST', path: '/classes', params: [] },
      ] as never);
      await request(server())
        .post('/test-scenarios/generate')
        .send({ routes: [{ method: 'POST', path: '/classes' }], categories: ['auth', 'validation'] })
        .expect(200);
      expect(rmq.send.mock.calls[0][1]).toMatchObject({
        routes: [{ method: 'POST', path: '/classes', params: [] }],
        categories: ['auth', 'validation'],
      });
    });

    it('treats an explicit empty routes array as "no routes selected"', async () => {
      jest.mocked(listHttpRoutes).mockReturnValue([{ method: 'GET', path: '/a', params: [] }] as never);
      await request(server()).post('/test-scenarios/generate').send({ routes: [] }).expect(200);
      expect(rmq.send.mock.calls[0][1].routes).toEqual([]);
    });

    it('rejects an empty categories array with 422 and does not call RMQ', async () => {
      await request(server()).post('/test-scenarios/generate').send({ categories: [] }).expect(422);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('rejects an unknown category with 400', async () => {
      await request(server()).post('/test-scenarios/generate').send({ categories: ['nope'] }).expect(422);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('rejects more than 500 routes with 400', async () => {
      const routes = Array.from({ length: 501 }, (_, i) => ({ method: 'GET', path: `/r${i}` }));
      await request(server()).post('/test-scenarios/generate').send({ routes }).expect(422);
      expect(rmq.send).not.toHaveBeenCalled();
    });
  });

  describe('scenario CRUD', () => {
    const validScenario = {
      service: 'gateway',
      method: 'GET',
      path: '/classes',
      name: 'list classes',
      expectedStatus: 200,
    };

    it('POST /test-scenarios creates with defaults applied by the schema', async () => {
      await request(server()).post('/test-scenarios').send(validScenario).expect(201);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.create', expect.objectContaining({
        category: 'valid',
        authProfile: 'caller',
        requestTemplate: {},
      }));
    });

    it('POST /test-scenarios rejects a protocol-relative path', async () => {
      await request(server())
        .post('/test-scenarios')
        .send({ ...validScenario, path: '//evil.example/x' })
        .expect(422);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('POST /test-scenarios rejects a path without a leading slash', async () => {
      await request(server()).post('/test-scenarios').send({ ...validScenario, path: 'classes' }).expect(422);
    });

    it('POST /test-scenarios rejects an HTTP method outside the allowlist', async () => {
      await request(server()).post('/test-scenarios').send({ ...validScenario, method: 'TRACE' }).expect(422);
    });

    it('POST /test-scenarios rejects an out-of-range expected status', async () => {
      await request(server()).post('/test-scenarios').send({ ...validScenario, expectedStatus: 600 }).expect(422);
      await request(server()).post('/test-scenarios').send({ ...validScenario, expectedStatus: 99 }).expect(422);
    });

    it('POST /test-scenarios rejects a non-integer expected status', async () => {
      await request(server()).post('/test-scenarios').send({ ...validScenario, expectedStatus: 200.5 }).expect(422);
    });

    it('POST /test-scenarios rejects a whitespace-only expectedMessage', async () => {
      await request(server())
        .post('/test-scenarios')
        .send({ ...validScenario, expectedMessage: '   ' })
        .expect(422);
    });

    it('POST /test-scenarios accepts a nullable expectedMessage', async () => {
      await request(server()).post('/test-scenarios').send({ ...validScenario, expectedMessage: null }).expect(201);
    });

    it('POST /test-scenarios rejects an unknown auth profile', async () => {
      await request(server()).post('/test-scenarios').send({ ...validScenario, authProfile: 'root' }).expect(422);
    });

    it('POST /test-scenarios rejects an empty name', async () => {
      await request(server()).post('/test-scenarios').send({ ...validScenario, name: '' }).expect(422);
    });

    it('PATCH /test-scenarios/:id forwards the id and only the supplied fields', async () => {
      await request(server()).patch(`/test-scenarios/${UUID}`).send({ name: 'renamed' }).expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.update', { id: UUID, dto: { name: 'renamed' } });
    });

    it('PATCH /test-scenarios/:id rejects a non-UUID id before reaching RMQ', async () => {
      await request(server()).patch('/test-scenarios/not-a-uuid').send({ name: 'x' }).expect(400);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('PATCH /test-scenarios/:id does not apply defaults to omitted fields', async () => {
      await request(server()).patch(`/test-scenarios/${UUID}`).send({ name: 'x' }).expect(200);
      const dto = rmq.send.mock.calls[0][1].dto;
      expect(dto).not.toHaveProperty('category');
      expect(dto).not.toHaveProperty('authProfile');
      expect(dto).not.toHaveProperty('requestTemplate');
    });

    it('DELETE /test-scenarios/:id sends the id to RMQ', async () => {
      await request(server()).delete(`/test-scenarios/${UUID}`).expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.delete', { id: UUID });
    });

    it('DELETE /test-scenarios/:id rejects a non-UUID id', async () => {
      await request(server()).delete('/test-scenarios/123').expect(400);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('GET /test-scenarios forwards validated filters', async () => {
      await request(server()).get('/test-scenarios?service=gateway&category=auth').expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.list', { service: 'gateway', category: 'auth' });
    });

    it('GET /test-scenarios rejects an unknown category filter', async () => {
      await request(server()).get('/test-scenarios?category=bogus').expect(422);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('GET /test-scenarios/stats and /auth-profiles delegate to RMQ', async () => {
      await request(server()).get('/test-scenarios/stats').expect(200);
      await request(server()).get('/test-scenarios/auth-profiles').expect(200);
      expect(rmq.send.mock.calls.map((c) => c[0])).toEqual(['testscenario.stats', 'testscenario.authprofiles']);
    });

    it('POST /test-scenarios/bulk rejects an empty scenario list', async () => {
      await request(server()).post('/test-scenarios/bulk').send({ scenarios: [] }).expect(422);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('POST /test-scenarios/bulk forwards valid scenarios with 201', async () => {
      await request(server()).post('/test-scenarios/bulk').send({ scenarios: [validScenario] }).expect(201);
      expect(rmq.send).toHaveBeenCalledWith(
        'testscenario.createMany',
        { scenarios: [expect.objectContaining({ name: 'list classes', category: 'valid' })] },
      );
    });

    it('POST /test-scenarios/bulk rejects a batch containing one invalid scenario', async () => {
      await request(server())
        .post('/test-scenarios/bulk')
        .send({ scenarios: [validScenario, { ...validScenario, method: 'NOPE' }] })
        .expect(422);
      expect(rmq.send).not.toHaveBeenCalled();
    });
  });

  describe('runs', () => {
    it('defaults the limit to 20 when the query is absent', async () => {
      await request(server()).get(`/test-scenarios/${UUID}/runs`).expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.runs', { id: UUID, limit: 20 });
    });

    it('parses an explicit numeric limit', async () => {
      await request(server()).get(`/test-scenarios/${UUID}/runs?limit=5`).expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.runs', { id: UUID, limit: 5 });
    });

    it('rejects a non-integer limit with 400', async () => {
      await request(server()).get(`/test-scenarios/${UUID}/runs?limit=abc`).expect(400);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID scenario id with 400', async () => {
      await request(server()).get('/test-scenarios/nope/runs').expect(400);
    });
  });

  describe('run', () => {
    it('runs synchronously by default and strips the Bearer prefix from the token', async () => {
      await request(server())
        .post(`/test-scenarios/${UUID}/run`)
        .set('Authorization', 'Bearer abc.def')
        .expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.run', {
        id: UUID,
        userId: 'admin-1',
        accessToken: 'abc.def',
        wait: true,
      });
    });

    it('switches to background mode only for ?async=true', async () => {
      await request(server()).post(`/test-scenarios/${UUID}/run?async=true`).expect(200);
      expect(rmq.send.mock.calls[0][1].wait).toBe(false);
    });

    it('treats any other async value as synchronous', async () => {
      await request(server()).post(`/test-scenarios/${UUID}/run?async=1`).expect(200);
      expect(rmq.send.mock.calls[0][1].wait).toBe(true);
    });

    it('passes an undefined token when no Authorization header is sent', async () => {
      await request(server()).post(`/test-scenarios/${UUID}/run`).expect(200);
      expect(rmq.send.mock.calls[0][1].accessToken).toBeUndefined();
    });

    it('leaves a non-Bearer authorization value as-is', async () => {
      await request(server())
        .post(`/test-scenarios/${UUID}/run`)
        .set('Authorization', 'Basic xyz')
        .expect(200);
      expect(rmq.send.mock.calls[0][1].accessToken).toBe('Basic xyz');
    });

    it('rejects a non-UUID id with 400', async () => {
      await request(server()).post('/test-scenarios/xyz/run').expect(400);
    });
  });

  describe('fixtures', () => {
    it('GET /fixtures lists fixtures via RMQ', async () => {
      await request(server()).get('/test-scenarios/fixtures').expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.fixtures.list', {});
    });

    it('POST /fixtures accepts a fixed value', async () => {
      await request(server()).post('/test-scenarios/fixtures').send({ key: 'classId', value: 'abc' }).expect(201);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.fixtures.create', { key: 'classId', value: 'abc' });
    });

    it('POST /fixtures accepts a resolver and defaults its method and auth profile', async () => {
      await request(server())
        .post('/test-scenarios/fixtures')
        .send({
          key: 'firstClass',
          resolver: { path: '/classes', extract: 'data.0.id' },
        })
        .expect(201);
      const dto = rmq.send.mock.calls[0][1];
      expect(dto.resolver).toEqual({ method: 'GET', path: '/classes', authProfile: 'admin', extract: 'data.0.id' });
    });

    it('POST /fixtures rejects a fixture with neither value nor resolver', async () => {
      await request(server()).post('/test-scenarios/fixtures').send({ key: 'empty' }).expect(422);
      expect(rmq.send).not.toHaveBeenCalled();
    });

    it('POST /fixtures rejects a key that starts with a digit', async () => {
      await request(server()).post('/test-scenarios/fixtures').send({ key: '1bad', value: 'x' }).expect(422);
    });

    it('POST /fixtures rejects a key containing a hyphen', async () => {
      await request(server()).post('/test-scenarios/fixtures').send({ key: 'bad-key', value: 'x' }).expect(422);
    });

    it('POST /fixtures rejects a resolver with a non-GET method', async () => {
      await request(server())
        .post('/test-scenarios/fixtures')
        .send({ key: 'k', resolver: { method: 'POST', path: '/x', extract: 'a' } })
        .expect(422);
    });

    it('POST /fixtures rejects a resolver path that is protocol-relative', async () => {
      await request(server())
        .post('/test-scenarios/fixtures')
        .send({ key: 'k', resolver: { path: '//evil', extract: 'a' } })
        .expect(422);
    });

    it('PATCH /fixtures/:id forwards id and dto', async () => {
      await request(server()).patch(`/test-scenarios/fixtures/${UUID}`).send({ value: 'new' }).expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.fixtures.update', { id: UUID, dto: { value: 'new' } });
    });

    it('PATCH /fixtures/:id rejects a non-UUID id', async () => {
      await request(server()).patch('/test-scenarios/fixtures/abc').send({ value: 'x' }).expect(400);
    });

    it('DELETE /fixtures/:id forwards the id', async () => {
      await request(server()).delete(`/test-scenarios/fixtures/${UUID}`).expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.fixtures.delete', { id: UUID });
    });

    it('POST /fixtures/:id/resolve strips Bearer from the authorization header', async () => {
      await request(server())
        .post(`/test-scenarios/fixtures/${UUID}/resolve`)
        .set('Authorization', 'Bearer tok')
        .expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.fixtures.resolve', { id: UUID, accessToken: 'tok' });
    });

    it('POST /fixtures/:id/resolve sends an undefined token when no header is present', async () => {
      await request(server()).post(`/test-scenarios/fixtures/${UUID}/resolve`).expect(200);
      expect(rmq.send).toHaveBeenCalledWith('testscenario.fixtures.resolve', { id: UUID, accessToken: undefined });
    });
  });
});
