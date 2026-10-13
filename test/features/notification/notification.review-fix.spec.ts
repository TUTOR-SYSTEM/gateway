import { NotificationController } from 'src/features/notification/notification.controller';
import {
  createNotificationSchema,
  getNotificationsQuerySchema,
} from '@packages/entities/notification';

const user = { id: 'u-1', email: 'a@b.c', typ: 'access', role: 'TUTOR' } as any;

describe('gateway NotificationController review fixes', () => {
  const rmq = { send: jest.fn().mockResolvedValue({}) };
  const c = new NotificationController(rmq as never);
  beforeEach(() => jest.clearAllMocks());

  it('F-12: getById/markAsRead/delete forward id + userId + role', () => {
    (c as any).getById('n-1', user);
    (c as any).markAsRead('n-1', user);
    (c as any).delete('n-1', user);
    expect(rmq.send).toHaveBeenNthCalledWith(1, 'notification.getById', { id: 'n-1', userId: 'u-1', role: 'TUTOR' });
    expect(rmq.send).toHaveBeenNthCalledWith(2, 'notification.markAsRead', { id: 'n-1', userId: 'u-1', role: 'TUTOR' });
    expect(rmq.send).toHaveBeenNthCalledWith(3, 'notification.delete', { id: 'n-1', userId: 'u-1', role: 'TUTOR' });
  });

  it('F-13: create forwards senderId and role (server-side, not from body)', () => {
    c.create({ type: 'TUTOR', title: 't', content: 'c', role: 'ADMIN', senderId: 'evil' } as any, user);
    expect(rmq.send).toHaveBeenCalledWith(
      'notification.create',
      expect.objectContaining({ senderId: 'u-1', role: 'TUTOR' }),
    );
  });
});

describe('gateway notification schemas', () => {
  it('F-23: isRead "false" -> false', () => {
    expect(getNotificationsQuerySchema.parse({ isRead: 'false' }).isRead).toBe(false);
    expect(getNotificationsQuerySchema.parse({ isRead: 'true' }).isRead).toBe(true);
    expect(getNotificationsQuerySchema.parse({}).isRead).toBeUndefined();
  });

  const ok = (redirectUrl: string) =>
    createNotificationSchema.safeParse({ type: 'TUTOR', title: 't', content: 'c', redirectUrl }).success;
  it.each(['/classes/1', 'https://example.com/x'])('F-13: accepts %s', (u) => expect(ok(u)).toBe(true));
  it.each(['javascript:alert(1)', 'data:text/html,x', 'http://example.com', '//evil.com'])(
    'F-13: rejects %s',
    (u) => expect(ok(u)).toBe(false),
  );
});
