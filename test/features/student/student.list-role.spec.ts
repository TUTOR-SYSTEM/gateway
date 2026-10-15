import 'reflect-metadata';
import { getStudentsQuerySchema } from '@packages/entities/student';
import { StudentController } from 'src/features/student/student.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

// GW-03: GET /students must only list STUDENT users. The controller has to force
// `role: 'STUDENT'` in the `user.getUsers` payload (after the query spread).
describe('GW-03 GET /students forces role=STUDENT', () => {
  const build = () => {
    const send = jest.fn().mockResolvedValue({ data: [] });
    const controller = new StudentController({ send } as unknown as RmqProducer);
    return { send, controller };
  };

  it('sends user.getUsers with role STUDENT and keeps the query fields', async () => {
    const { send, controller } = build();
    const query = getStudentsQuerySchema.parse({ page: '2', limit: '5', search: 'an' });

    await controller.getAllStudents(query);

    expect(send).toHaveBeenCalledTimes(1);
    const [pattern, payload] = send.mock.calls[0];
    expect(pattern).toBe('user.getUsers');
    expect(payload).toEqual(expect.objectContaining({ role: 'STUDENT' }));
    expect(payload).toEqual(expect.objectContaining({ page: 2, limit: 5, search: 'an' }));
  });

  it('a client-supplied role=ADMIN cannot override STUDENT', async () => {
    const { send, controller } = build();
    // The schema strips unknown keys, so a real request can never carry `role` here...
    const parsed = getStudentsQuerySchema.parse({ page: '1', role: 'ADMIN' });
    expect(parsed).not.toHaveProperty('role');
    // ...but the controller itself must also be override-proof (role set AFTER the spread).
    await controller.getAllStudents({ ...parsed, role: 'ADMIN' } as never);

    expect(send.mock.calls[0][1].role).toBe('STUDENT');
  });
});
