import { AdminController } from 'src/features/admin/admin.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

function setup() {
  const send = jest.fn().mockResolvedValue({});
  return { send, c: new AdminController({ send } as unknown as RmqProducer) };
}

describe('AdminController role scoping (GW-08/09)', () => {
  it('tutor routes carry role TUTOR and override a body-supplied role', () => {
    const { send, c } = setup();
    c.createTutor({ email: 'a@b.c', role: 'ADMIN' } as never);
    expect(send).toHaveBeenLastCalledWith(
      'user.createUser',
      expect.objectContaining({ role: 'TUTOR' }),
    );
    c.listTutors({ page: 1 } as never);
    expect(send).toHaveBeenLastCalledWith(
      'user.getUsers',
      expect.objectContaining({ role: 'TUTOR' }),
    );
    c.getTutor('t1', { id: 'admin-1', role: 'ADMIN' } as never);
    expect(send).toHaveBeenLastCalledWith('user.getDetailUser', {
      userId: 't1',
      expectedRole: 'TUTOR',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
    c.updateTutor('t1', { id: 'evil', firstName: 'x' } as never);
    expect(send).toHaveBeenLastCalledWith(
      'user.updateUserByAdmin',
      expect.objectContaining({ id: 't1', expectedRole: 'TUTOR' }),
    );
    c.deleteTutor('t1', { id: 'admin-1', role: 'ADMIN' } as never);
    expect(send).toHaveBeenLastCalledWith('user.deleteUserByAdmin', {
      id: 't1',
      expectedRole: 'TUTOR',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
  });

  it('student routes carry role STUDENT', () => {
    const { send, c } = setup();
    c.createStudent({ email: 'a@b.c', role: 'ADMIN' } as never);
    expect(send).toHaveBeenLastCalledWith(
      'user.createUser',
      expect.objectContaining({ role: 'STUDENT' }),
    );
    c.listStudents({ page: 1 } as never);
    expect(send).toHaveBeenLastCalledWith(
      'user.getUsers',
      expect.objectContaining({ role: 'STUDENT' }),
    );
    c.getStudent('s1', { id: 'admin-1', role: 'ADMIN' } as never);
    expect(send).toHaveBeenLastCalledWith('user.getDetailUser', {
      userId: 's1',
      expectedRole: 'STUDENT',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
    c.updateStudent('s1', { firstName: 'x' } as never);
    expect(send).toHaveBeenLastCalledWith(
      'user.updateUserByAdmin',
      expect.objectContaining({ id: 's1', expectedRole: 'STUDENT' }),
    );
    c.deleteStudent('s1', { id: 'admin-1', role: 'ADMIN' } as never);
    expect(send).toHaveBeenLastCalledWith('user.deleteUserByAdmin', {
      id: 's1',
      expectedRole: 'STUDENT',
      actorId: 'admin-1',
      actorRole: 'ADMIN',
    });
  });
});
