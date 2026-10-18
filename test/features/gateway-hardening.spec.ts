import { redactConnectionSecrets } from 'src/features/rabbitmq/rmq.producer';
import { securityHeaders } from 'src/packages/helpers/security-headers.helper';
import { isSafeRedirectUrl } from 'src/packages/entities/notification/notification.schema';
import {
  createSessionSchema,
  updateSessionSchema,
} from 'src/packages/entities/session/session.schema';
import {
  createScheduleSchema,
  updateScheduleSchema,
} from 'src/packages/entities/schedule/schedule.schema';
import { updateUserStatusSchema } from 'src/packages/entities/user/user.schema';
import { updateLessonSchema } from 'src/packages/entities/curriculum/curriculum.schema';

describe('gateway hardening', () => {
  it('redacts AMQP credentials from broker error text', () => {
    expect(redactConnectionSecrets('{"url":"amqp://admin:s3cret@rabbitmq:5672"}')).toBe(
      '{"url":"amqp://***@rabbitmq:5672"}',
    );
  });

  it('sets baseline security headers and removes X-Powered-By', () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => (headers[k] = v),
      removeHeader: jest.fn(),
    };
    const next = jest.fn();
    securityHeaders({} as never, res as never, next);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(res.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    expect(next).toHaveBeenCalled();
  });

  it.each([
    '/\t/evil.com',
    '/\n/evil.com',
    '//evil.com',
    '/\\evil.com',
    'javascript:x',
    'https://evil.com/x',
  ])('redirectUrl %j is rejected', (u) => expect(isSafeRedirectUrl(u)).toBe(false));

  it('session endAt must be after startAt on create and update', () => {
    const base = {
      classId: '123e4567-e89b-42d3-a456-426614174000',
      sessionNumber: 1,
      startAt: '2026-01-01T10:00:00Z',
    };
    expect(createSessionSchema.safeParse({ ...base, endAt: '2026-01-01T09:00:00Z' }).success).toBe(
      false,
    );
    expect(createSessionSchema.safeParse({ ...base, endAt: '2026-01-01T11:00:00Z' }).success).toBe(
      true,
    );
    expect(
      updateSessionSchema.safeParse({
        startAt: '2026-01-01T10:00:00Z',
        endAt: '2026-01-01T09:00:00Z',
      }).success,
    ).toBe(false);
    expect(updateSessionSchema.safeParse({ title: 'x' }).success).toBe(true);
  });

  it('schedule startTime must be before endTime on create and update', () => {
    const valid = {
      classId: '123e4567-e89b-42d3-a456-426614174000',
      dayOfWeek: 'MONDAY',
      startTime: '09:00',
      endTime: '08:00',
    };
    expect(createScheduleSchema.safeParse(valid).success).toBe(false);
    expect(updateScheduleSchema.safeParse({ startTime: '09:00', endTime: '08:00' }).success).toBe(
      false,
    );
    expect(updateScheduleSchema.safeParse({ endTime: '10:00' }).success).toBe(true);
  });

  it('status update is an explicit boolean, not a toggle', () => {
    expect(updateUserStatusSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateUserStatusSchema.safeParse({}).success).toBe(false);
    expect(updateUserStatusSchema.safeParse({ isActive: 'false' }).success).toBe(false);
  });

  it('an empty lesson update is refused before reaching the service', () => {
    expect(updateLessonSchema.safeParse({}).success).toBe(false);
    expect(updateLessonSchema.safeParse({ title: 'x' }).success).toBe(true);
  });
});
