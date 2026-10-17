import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY, ROLES_KEY } from '@packages/decorators';
import { RolesGuard } from '@packages/guards';
import { AppController } from 'src/app.controller';
import { UserController } from 'src/features/user/user.controller';
import { StudentController } from 'src/features/student/student.controller';
import { ChapterController } from 'src/features/chapter/chapter.controller';
import { LessonController } from 'src/features/lesson/lesson.controller';
import { NotificationController } from 'src/features/notification/notification.controller';
import { EmailController } from 'src/features/email/email.controller';
import { RedisController } from 'src/features/redis/redis.controller';
import { UploadController } from 'src/features/upload/upload.controller';
import { AuthController } from 'src/features/auth/auth.controller';

type Ctor = { prototype: Record<string, unknown> };

const handler = (c: Ctor, name: string) => c.prototype[name] as object;
const roles = (c: Ctor, name: string) => Reflect.getMetadata(ROLES_KEY, handler(c, name));
const guards = (c: Ctor, name: string): unknown[] =>
  Reflect.getMetadata(GUARDS_METADATA, handler(c, name)) ?? [];
const isPublic = (c: Ctor, name: string) =>
  Reflect.getMetadata(IS_PUBLIC_KEY, handler(c, name)) === true ||
  Reflect.getMetadata(IS_PUBLIC_KEY, c) === true;

describe('route guards (RolesGuard + @Roles)', () => {
  const adminOnly: Array<[string, Ctor, string[]]> = [
    [
      'AppController',
      AppController,
      ['pingMsgFromKafkaController', 'sendMsgFromKafkaController', 'testMsgError', 'testError'],
    ],
    [
      'UserController',
      UserController,
      [
        'getUsers',
        'getUserByField',
        'createUser',
        'updateUserByAdminController',
        'updateStatusUserController',
        'deleteUserByAdminController',
      ],
    ],
    ['EmailController', EmailController, ['testSendEmail']],
    ['RedisController', RedisController, ['get']],
    // Tutors may read a student but only ADMIN may change or delete one (see student.authz.spec).
    ['StudentController', StudentController, ['update', 'delete']],
  ];

  describe.each(adminOnly)('%s admin-only routes', (_n, ctor, methods) => {
    it.each(methods)('%s requires ADMIN via RolesGuard and is not public', (m) => {
      expect(roles(ctor, m)).toEqual(['ADMIN']);
      expect(guards(ctor, m)).toContain(RolesGuard);
      expect(isPublic(ctor, m)).toBe(false);
    });
  });

  const adminOrTutor: Array<[string, Ctor, string[]]> = [
    ['StudentController', StudentController, ['findById']],
    ['ChapterController', ChapterController, ['create', 'update', 'delete']],
    ['LessonController', LessonController, ['create', 'update', 'delete']],
    ['NotificationController', NotificationController, ['create']],
  ];

  describe.each(adminOrTutor)('%s ADMIN/TUTOR routes', (_n, ctor, methods) => {
    it.each(methods)('%s requires ADMIN or TUTOR via RolesGuard', (m) => {
      expect(roles(ctor, m)).toEqual(['ADMIN', 'TUTOR']);
      expect(guards(ctor, m)).toContain(RolesGuard);
    });
  });

  it('keeps the self-service user routes open to any authenticated user', () => {
    for (const m of [
      'getDetailUserController',
      'updateUserController',
      'changePasswordController',
    ]) {
      expect(roles(UserController, m)).toBeUndefined();
    }
  });
});

describe('@Public metadata', () => {
  it('GW-03: no upload route is public', () => {
    for (const m of ['upload', 'uploadMultiple', 'download', 'delete']) {
      expect(isPublic(UploadController, m)).toBe(false);
    }
  });

  it('GW-04: POST /auth/reset-password is public', () => {
    expect(isPublic(AuthController, 'resetPassword')).toBe(true);
  });

  it('POST /auth/verify-email is public', () => {
    expect(isPublic(AuthController, 'verifyEmail')).toBe(true);
  });

  it('GW-25: GET / health check is public', () => {
    expect(isPublic(AppController, 'getHello')).toBe(true);
  });

  it('kafka debug routes are not public', () => {
    for (const m of [
      'pingMsgFromKafkaController',
      'sendMsgFromKafkaController',
      'testMsgError',
      'testError',
    ]) {
      expect(isPublic(AppController, m)).toBe(false);
    }
  });
});
