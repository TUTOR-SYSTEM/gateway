import { AdminController } from 'src/features/admin/admin.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

// Gateway forwards to the admin.* / student.* RPC patterns; actor identity comes from the JWT only
// and the owning service decides the role (ADMIN for admin.*, ADMIN or TUTOR for student.*).
function setup() {
  const send = jest.fn().mockResolvedValue({ ok: true });
  const controller = new AdminController({ send } as unknown as RmqProducer);
  const admin = { id: 'admin-1', email: 'a@b.c', typ: 'access', role: 'ADMIN', sid: 's' } as never;
  return { send, c: controller, admin };
}

describe('AdminController RPC contract', () => {
  it('tutor routes call admin.* with actorId/actorRole and no client-controlled role', async () => {
    const { send, c, admin } = setup();
    await c.createTutor({ email: 'x@y.z', role: 'ADMIN' } as never, admin);
    expect(send).toHaveBeenLastCalledWith(
      'admin.createTutor',
      {
        email: 'x@y.z',
        role: 'ADMIN',
        actorId: 'admin-1',
        actorRole: 'ADMIN',
      },
      30000,
      0,
    );
    await c.listTutors({ page: 1, role: 'ADMIN' } as never, admin);
    expect(send).toHaveBeenLastCalledWith('admin.listTutors', {
      page: 1,
      role: 'ADMIN',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
    await c.getTutor('t1', admin);
    expect(send).toHaveBeenLastCalledWith('admin.getTutor', {
      id: 't1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
    await c.updateTutor('t1', admin, { firstName: 'x' } as never);
    expect(send).toHaveBeenLastCalledWith('admin.updateTutor', {
      firstName: 'x',
      id: 't1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
    await c.deleteTutor('t1', admin);
    expect(send).toHaveBeenLastCalledWith('admin.deleteTutor', {
      id: 't1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
  });

  it('student routes call admin.* the same way', async () => {
    const { send, c, admin } = setup();
    await c.createStudent({ email: 's@y.z' } as never, admin);
    expect(send).toHaveBeenLastCalledWith(
      'admin.createStudent',
      {
        email: 's@y.z',
        actorId: 'admin-1',
        actorRole: 'ADMIN',
      },
      30000,
      0,
    );
    await c.listStudents({ page: 2 } as never, admin);
    expect(send).toHaveBeenLastCalledWith('admin.listStudents', {
      page: 2,
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
    await c.getStudent('s1', admin);
    expect(send).toHaveBeenLastCalledWith('admin.getStudent', {
      id: 's1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
    await c.updateStudent('s1', admin, { firstName: 'x' } as never);
    expect(send).toHaveBeenLastCalledWith('admin.updateStudent', {
      firstName: 'x',
      id: 's1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
    await c.deleteStudent('s1', admin);
    expect(send).toHaveBeenLastCalledWith('admin.deleteStudent', {
      id: 's1',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
  });
});
