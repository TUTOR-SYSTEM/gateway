export const USER_SERVICE = 'USER_SERVICE';
export const TUTOR_SERVICE = 'TUTOR_SERVICE';
export const THIRD_SERVICE = 'THIRD_SERVICE';

export type RmqTarget = typeof USER_SERVICE | typeof TUTOR_SERVICE | typeof THIRD_SERVICE;

export const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';

export const RMQ_QUEUES: Record<RmqTarget, string> = {
  [USER_SERVICE]: process.env.USER_QUEUE ?? 'user_queue',
  [TUTOR_SERVICE]: process.env.TUTOR_QUEUE ?? 'tutor_queue',
  [THIRD_SERVICE]: process.env.THIRD_QUEUE ?? 'third_queue',
};

/** Full-pattern overrides, checked before the prefix map. */
export const RMQ_PATTERN_ROUTES: Record<string, RmqTarget> = {
  'health.postgres': USER_SERVICE,
  'health.redis': THIRD_SERVICE,
};

/** Routes a pattern by its first dot-separated segment to the service queue that handles it. */
export const RMQ_PREFIX_ROUTES: Record<string, RmqTarget> = {
  auth: USER_SERVICE,
  user: USER_SERVICE,
  student: USER_SERVICE,
  admin: USER_SERVICE,
  kafka: USER_SERVICE,

  redis: THIRD_SERVICE,
  email: THIRD_SERVICE,
  notification: THIRD_SERVICE,
  upload: THIRD_SERVICE,
  log: THIRD_SERVICE,
  testscenario: THIRD_SERVICE,

  tutor: TUTOR_SERVICE,
  curriculum: TUTOR_SERVICE,
  chapter: TUTOR_SERVICE,
  lesson: TUTOR_SERVICE,
  exercise: TUTOR_SERVICE,
  tuition: TUTOR_SERVICE,
  class: TUTOR_SERVICE,
  schedule: TUTOR_SERVICE,
  session: TUTOR_SERVICE,
  attendance: TUTOR_SERVICE,
  dashboard: TUTOR_SERVICE,
  report: TUTOR_SERVICE,
  ai: TUTOR_SERVICE,
};

export function resolveRmqTarget(pattern: string): RmqTarget {
  const target = RMQ_PATTERN_ROUTES[pattern] ?? RMQ_PREFIX_ROUTES[pattern.split('.')[0]];
  if (!target) {
    throw new Error(`No RabbitMQ route for pattern "${pattern}" — add it to rmq.constants.ts`);
  }
  return target;
}

export interface RmqCallPolicy {
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Hot path: `redis.exists` runs on every authenticated request. Fail open after 2s with no retry
 * instead of holding each request for the 10s default when THIRD is slow.
 */
const RMQ_FAST_PATTERN_POLICIES: Record<string, RmqCallPolicy> = {
  'redis.exists': { timeoutMs: 2000, maxRetries: 0 },
};

/** Slow operations: longer per-call timeout and no retry (LLM, test runs, file transfer). */
const RMQ_SLOW_PATTERN_POLICIES: Record<string, RmqCallPolicy> = {
  'ai.chat': { timeoutMs: 60000, maxRetries: 0 },
  'testscenario.run': { timeoutMs: 120000, maxRetries: 0 },
  'testscenario.generate': { timeoutMs: 120000, maxRetries: 0 },
};
const RMQ_SLOW_PREFIX_POLICIES: Record<string, RmqCallPolicy> = {
  upload: { timeoutMs: 60000, maxRetries: 0 },
};

export function resolveRmqCallPolicy(pattern: string): RmqCallPolicy {
  return (
    RMQ_FAST_PATTERN_POLICIES[pattern] ??
    RMQ_SLOW_PATTERN_POLICIES[pattern] ??
    RMQ_SLOW_PREFIX_POLICIES[pattern.split('.')[0]] ??
    {}
  );
}

/** Read-only method names are safe to retry after a timeout; everything else is a write. */
export function isIdempotentPattern(pattern: string): boolean {
  const method = pattern.split('.').slice(1).join('.');
  return /^(get|find|list|history|stats|runs|authprofiles|fixtures\.list|fixtures\.resolve|check|verify)/i.test(
    method,
  );
}
