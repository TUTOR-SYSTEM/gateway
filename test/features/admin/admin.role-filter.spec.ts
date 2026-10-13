import { AdminController } from 'src/features/admin/admin.controller';

// Brief DEMO2-1: GET /admin/tutors và GET /admin/students phải chỉ trả đúng role,
// bất kể client có gửi `role` hay không (client không được ghi đè role).
describe('AdminController role filter (listTutors / listStudents)', () => {
  const makeController = () => {
    const send = jest.fn().mockResolvedValue({ items: [], total: 0 });
    const controller = new AdminController({ send } as never);
    return { controller, send };
  };

  describe('listTutors', () => {
    it('AC1: forwards query with role TUTOR', async () => {
      const { controller, send } = makeController();
      await controller.listTutors({ page: 1, limit: 10 } as never);
      expect(send).toHaveBeenCalledWith('user.getUsers', { page: 1, limit: 10, role: 'TUTOR' });
    });

    it('AC2: overrides a client-supplied role with TUTOR', async () => {
      const { controller, send } = makeController();
      await controller.listTutors({ page: 1, limit: 10, role: 'ADMIN' } as never);
      expect(send).toHaveBeenCalledWith('user.getUsers', { page: 1, limit: 10, role: 'TUTOR' });
    });

    it('AC4: keeps search and isActive in the payload', async () => {
      const { controller, send } = makeController();
      await controller.listTutors({
        page: 2,
        limit: 5,
        search: 'an',
        isActive: true,
      } as never);
      expect(send).toHaveBeenCalledWith('user.getUsers', {
        page: 2,
        limit: 5,
        search: 'an',
        isActive: true,
        role: 'TUTOR',
      });
    });
  });

  describe('listStudents', () => {
    it('AC3: forwards query with role STUDENT', async () => {
      const { controller, send } = makeController();
      await controller.listStudents({ page: 1, limit: 10 } as never);
      expect(send).toHaveBeenCalledWith('user.getUsers', { page: 1, limit: 10, role: 'STUDENT' });
    });

    it('AC2/AC3: overrides a client-supplied role with STUDENT', async () => {
      const { controller, send } = makeController();
      await controller.listStudents({ page: 1, limit: 10, role: 'PARENT' } as never);
      expect(send).toHaveBeenCalledWith('user.getUsers', { page: 1, limit: 10, role: 'STUDENT' });
    });

    it('AC4: keeps search and isActive in the payload', async () => {
      const { controller, send } = makeController();
      await controller.listStudents({
        page: 3,
        limit: 20,
        search: 'binh',
        isActive: false,
      } as never);
      expect(send).toHaveBeenCalledWith('user.getUsers', {
        page: 3,
        limit: 20,
        search: 'binh',
        isActive: false,
        role: 'STUDENT',
      });
    });
  });
});
