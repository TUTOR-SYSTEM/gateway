import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '@packages/decorators/roles.decorator';
import { RolesGuard } from '@packages/guards';
import { StudentController } from 'src/features/student/student.controller';
import { UserController } from 'src/features/user/user.controller';

// Các route user/student quản trị trước đây không có RolesGuard: STUDENT đọc được danh bạ,
// tạo/sửa/xóa user. Test này khóa metadata phân quyền để regression không lọt lại.
const adminOnly = (target: object, method: string) => {
  const proto = target.prototype as Record<string, unknown>;
  const fn = proto[method] as object;
  const roles = Reflect.getMetadata(ROLES_KEY, fn);
  const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, fn) ?? [];
  return { roles, guards };
};

describe('gateway user/student admin routes require ADMIN', () => {
  it.each([
    ['UserController', UserController, 'getUsers'],
    ['UserController', UserController, 'createUser'],
    ['UserController', UserController, 'updateUserByAdminController'],
    ['UserController', UserController, 'updateStatusUserController'],
    ['UserController', UserController, 'deleteUserByAdminController'],
    ['StudentController', StudentController, 'getAllStudents'],
  ])('%s.%s is restricted to ADMIN with RolesGuard', (_name, ctrl, method) => {
    const { roles, guards } = adminOnly(ctrl, method);
    expect(roles).toEqual(['ADMIN']);
    expect(guards).toContain(RolesGuard);
  });

  it('keeps self-service PUT /users open to authenticated users (no ADMIN restriction)', () => {
    const { roles } = adminOnly(UserController, 'updateUserController');
    expect(roles).toBeUndefined();
  });
});
