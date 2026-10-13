import { AdminController } from 'src/features/admin/admin.controller';

// Brief #18: POST /admin/tutors phải tạo user với role TUTOR (không phải STUDENT mặc định của USER),
// và client không được tự chọn role khác.
describe('AdminController.createTutor role assignment', () => {
  const makeController = () => {
    const send = jest.fn().mockResolvedValue({ id: 'new-user' });
    const controller = new AdminController({ send } as never);
    return { controller, send };
  };

  it('forwards the body to user.createUser with role TUTOR', async () => {
    const { controller, send } = makeController();
    const dto = { email: 'tutor@example.com', fullName: 'Tutor A' };
    await controller.createTutor(dto as never);
    expect(send).toHaveBeenCalledWith('user.createUser', { ...dto, role: 'TUTOR' });
  });

  it('overrides a client-supplied role with TUTOR', async () => {
    const { controller, send } = makeController();
    await controller.createTutor({ email: 'x@example.com', role: 'ADMIN' } as never);
    expect(send).toHaveBeenCalledWith('user.createUser', {
      email: 'x@example.com',
      role: 'TUTOR',
    });
  });
});
