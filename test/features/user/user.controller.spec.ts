import { UserController } from 'src/features/user/user.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';
import { updateSelfSchema, createUserSchema } from '@packages/entities/user';

function setup() {
  const send = jest.fn().mockResolvedValue({});
  return { send, controller: new UserController({ send } as unknown as RmqProducer) };
}

describe('UserController', () => {
  it('GW-01: PUT /users sends trusted userId/role even if the dto carries them', async () => {
    const { send, controller } = setup();
    await controller.updateUserController(
      { id: 'real', role: 'STUDENT' } as never,
      { firstName: 'A', userId: 'victim', role: 'ADMIN' } as never,
    );
    expect(send).toHaveBeenCalledWith(
      'user.updateUser',
      expect.objectContaining({ firstName: 'A', userId: 'real', role: 'STUDENT' }),
    );
  });

  it('PUT /users/:id keeps the path id over a body id', async () => {
    const { send, controller } = setup();
    await controller.updateUserByAdminController('path-id', { id: 'body', firstName: 'A' } as never);
    expect(send.mock.calls[0][1]).toMatchObject({ id: 'path-id' });
  });

  it('change password uses the authenticated user id', async () => {
    const { send, controller } = setup();
    await controller.changePasswordController({ id: 'me' } as never, {
      userId: 'other',
      currentPassword: 'a',
      newPassword: 'b',
    } as never);
    expect(send.mock.calls[0][1]).toMatchObject({ userId: 'me' });
  });
});

describe('updateSelfSchema (GW-01)', () => {
  it.each(['role', 'isActive', 'userCode', 'googleId', 'facebookId'])('rejects %s', (field) => {
    const value = field === 'isActive' ? true : field === 'role' ? 'ADMIN' : 'x';
    expect(updateSelfSchema.safeParse({ [field]: value }).success).toBe(false);
  });

  it('accepts ordinary profile fields', () => {
    expect(updateSelfSchema.safeParse({ firstName: 'Alice' }).success).toBe(true);
  });
});

describe('createUserSchema password rules (GW-23)', () => {
  const base = { email: 'a@b.co', firstName: 'A', lastName: 'B', role: 'STUDENT' };
  it('rejects weak passwords', () => {
    expect(createUserSchema.safeParse({ ...base, password: 'abc' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: 'abcdefg' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, password: 'alllowercase' }).success).toBe(false);
  });
});
