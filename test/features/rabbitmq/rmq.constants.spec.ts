import {
  resolveRmqTarget,
  RMQ_PATTERN_ROUTES,
  RMQ_PREFIX_ROUTES,
  TUTOR_SERVICE,
  THIRD_SERVICE,
  USER_SERVICE,
} from 'src/features/rabbitmq/rmq.constants';

describe('resolveRmqTarget', () => {
  it.each([
    ['auth.login', USER_SERVICE],
    ['user.getProfile', USER_SERVICE],
    ['kafka.consume', USER_SERVICE],
    ['redis.get', THIRD_SERVICE],
    ['email.send', THIRD_SERVICE],
    ['notification.list', THIRD_SERVICE],
    ['upload.file', THIRD_SERVICE],
    ['log.write', THIRD_SERVICE],
    ['testscenario.run', THIRD_SERVICE],
    ['tutor.list', TUTOR_SERVICE],
    ['class.create', TUTOR_SERVICE],
    ['schedule.update', TUTOR_SERVICE],
    ['session.get', TUTOR_SERVICE],
    ['attendance.mark', TUTOR_SERVICE],
    ['dashboard.stats', TUTOR_SERVICE],
    ['report.export', TUTOR_SERVICE],
    ['ai.chat', TUTOR_SERVICE],
  ])('routes %s by its prefix to the owning queue', (pattern, target) => {
    expect(resolveRmqTarget(pattern)).toBe(target);
  });

  it('prefers a full-pattern override over the prefix map', () => {
    expect(RMQ_PATTERN_ROUTES['kafka.tutor']).toBe(TUTOR_SERVICE);
    expect(resolveRmqTarget('kafka.tutor')).toBe(TUTOR_SERVICE);
    expect(resolveRmqTarget('kafka.other')).toBe(USER_SERVICE);
    expect(resolveRmqTarget('health.postgres')).toBe(USER_SERVICE);
    expect(resolveRmqTarget('health.redis')).toBe(THIRD_SERVICE);
  });

  it('uses only the first dot-separated segment for prefix routing', () => {
    expect(resolveRmqTarget('class.a.b.c')).toBe(TUTOR_SERVICE);
  });

  it('matches a bare pattern with no dot against the prefix map', () => {
    expect(resolveRmqTarget('auth')).toBe(USER_SERVICE);
  });

  it('throws a descriptive error for an unknown prefix', () => {
    expect(() => resolveRmqTarget('unknown.op')).toThrow(
      'No RabbitMQ route for pattern "unknown.op" — add it to rmq.constants.ts',
    );
  });

  it('is case-sensitive: an upper-cased prefix does not route', () => {
    expect(RMQ_PREFIX_ROUTES.AUTH).toBeUndefined();
    expect(() => resolveRmqTarget('AUTH.login')).toThrow(/No RabbitMQ route/);
  });

  it('throws for an empty pattern', () => {
    expect(() => resolveRmqTarget('')).toThrow(/No RabbitMQ route for pattern ""/);
  });
});
