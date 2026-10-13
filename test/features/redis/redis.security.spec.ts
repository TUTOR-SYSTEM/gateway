import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '@packages/decorators/roles.decorator';
import { RolesGuard } from '@packages/guards';
import { RedisController } from 'src/features/redis/redis.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

describe('F-01 gateway RedisController hardening', () => {
  const rmq = { send: jest.fn() };
  const controller = new RedisController(rmq as unknown as RmqProducer);
  beforeEach(() => jest.clearAllMocks());

  it('requires ADMIN via RolesGuard', () => {
    const roles =
      Reflect.getMetadata(ROLES_KEY, RedisController.prototype.get) ??
      Reflect.getMetadata(ROLES_KEY, RedisController);
    expect(roles).toEqual(['ADMIN']);
    const guards: unknown[] = [
      ...(Reflect.getMetadata(GUARDS_METADATA, RedisController) ?? []),
      ...(Reflect.getMetadata(GUARDS_METADATA, RedisController.prototype.get) ?? []),
    ];
    expect(guards).toContain(RolesGuard);
  });

  it.each(['session:u1', 'login-session:u1', 'reset-password:jti-1', 'refresh:u1', 'SESSION:u1'])(
    'rejects sensitive key %s with 403 without calling RPC',
    async (key) => {
      await expect((async () => controller.get({ key }))()).rejects.toBeInstanceOf(ForbiddenException);
      expect(rmq.send).not.toHaveBeenCalled();
    },
  );

  it('forwards non-sensitive keys', async () => {
    rmq.send.mockResolvedValue('v');
    await expect((async () => controller.get({ key: 'cache:foo' }))()).resolves.toBe('v');
    expect(rmq.send).toHaveBeenCalledWith('redis.get', { key: 'cache:foo' });
  });
});
