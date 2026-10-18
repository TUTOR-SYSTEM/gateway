import 'reflect-metadata';
import { getStudentsQuerySchema } from '@packages/entities/student';
import { StudentController } from 'src/features/student/student.controller';
import type { RmqProducer } from 'src/features/rabbitmq/rmq.producer';

// GET /students forwards to student.findAll with the verified actor. The role filter (STUDENT only)
// is applied by the owning service, which reads actorRole; the gateway never forwards a client role.
describe('GET /students forwards the verified actor', () => {
  const build = () => {
    const send = jest.fn().mockResolvedValue({ students: [] });
    const controller = new StudentController({ send } as unknown as RmqProducer);
    return { send, controller };
  };
  const admin = { id: 'admin-1', role: 'ADMIN' } as never;

  it('sends student.findAll with the query fields and actorId/actorRole', async () => {
    const { send, controller } = build();
    const query = getStudentsQuerySchema.parse({ page: '2', limit: '5', search: 'an' });

    await controller.getAllStudents(query, admin);

    expect(send).toHaveBeenCalledTimes(1);
    const [pattern, payload] = send.mock.calls[0];
    expect(pattern).toBe('student.findAll');
    expect(payload).toEqual(
      expect.objectContaining({
        page: 2,
        limit: 5,
        search: 'an',
        actorId: 'admin-1',
        actorRole: 'ADMIN',
      }),
    );
  });

  it('strips a client-supplied role at the schema, so none reaches the service', () => {
    const parsed = getStudentsQuerySchema.parse({ page: '1', role: 'ADMIN' });
    expect(parsed).not.toHaveProperty('role');
  });
});
