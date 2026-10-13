import { getRedisQuerySchema } from '@packages/entities/redis';

describe('getRedisQuerySchema (GW-05)', () => {
  it.each(['cache:foo', 'public:x', 'stats:daily'])('accepts %s', (key) => {
    expect(getRedisQuerySchema.safeParse({ key }).success).toBe(true);
  });

  it.each(['session:user-1', 'reset-password:tok', 'other', ''])('rejects %j', (key) => {
    expect(getRedisQuerySchema.safeParse({ key }).success).toBe(false);
  });
});
